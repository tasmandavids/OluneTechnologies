// ============================================================================
//  Sliding-window rate limiter for server actions / API routes.
//
//  Backed by Redis (Upstash / Vercel KV) when configured, so the window is
//  shared across the fleet. Falls back to an in-process window when it isn't.
//
//  ── Why the shared store matters
//  Vercel runs many isolated instances and each one gets its own empty Map, so
//  a purely in-process limiter enforces `limit × instance_count` — the number
//  you wrote down multiplied by something you don't control and can't see. At
//  one instance it looks like it works, which is the worst property a security
//  control can have. Redis gives every instance the same counter.
//
//  ── Semantics
//  Identical in both backends: a request is allowed if fewer than `limit`
//  requests were recorded in the trailing `windowMs`. A *denied* request is
//  not recorded, so being blocked never extends your own block.
//
//  ── When Redis is unreachable
//  We fall back to the in-process window rather than failing open completely,
//  and report it. Failing closed was the other option and it's the wrong one
//  here: this sits in front of checkout and enrolment, so a Redis blip would
//  become a customer-facing outage. Degraded protection beats no service.
// ============================================================================

import { redisEval, upstashConfigured, UpstashError } from "@/lib/redis/upstash";
import { reportHandledMessage } from "@/lib/observability/report";

// ── In-process fallback ─────────────────────────────────────────────────────

type Bucket = { timestamps: number[] };

const buckets = new Map<string, Bucket>();

const MAX_KEYS = 10_000;

function pruneIfNeeded() {
  if (buckets.size <= MAX_KEYS) return;
  const excess = buckets.size - Math.floor(MAX_KEYS * 0.8);
  let removed = 0;
  for (const key of buckets.keys()) {
    buckets.delete(key);
    removed++;
    if (removed >= excess) break;
  }
}

/**
 * The original in-process limiter. Exported for tests and used verbatim as the
 * fallback path — per-instance protection is worth having when the shared
 * store is unavailable.
 *
 * @returns true if the request is allowed, false if rate-limited.
 */
export function checkRateLimitInProcess(
  key: string,
  opts: { limit: number; windowMs: number },
): boolean {
  const now = Date.now();
  const windowStart = now - opts.windowMs;
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
    pruneIfNeeded();
  }

  bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);
  if (bucket.timestamps.length >= opts.limit) {
    return false;
  }
  bucket.timestamps.push(now);
  return true;
}

/** Test seam: drops all in-process state. */
export function __resetInProcessBuckets() {
  buckets.clear();
}

// ── Shared window ───────────────────────────────────────────────────────────

/**
 * Sliding window as a sorted set, scored by timestamp.
 *
 * Mirrors checkRateLimitInProcess exactly: trim what's fallen out of the
 * window, count, refuse without recording if we're at the limit, otherwise
 * record and re-arm the TTL. Kept as one script so those steps are atomic —
 * two instances racing on the same key is the case this whole module exists
 * for, so doing it in round trips would reintroduce the bug at a new layer.
 *
 * KEYS[1] bucket · ARGV: now, windowMs, limit, member
 */
const SLIDING_WINDOW_LUA = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, 0, now - window)

if redis.call('ZCARD', key) >= limit then
  return 0
end

redis.call('ZADD', key, now, member)
redis.call('PEXPIRE', key, window)
return 1
`.trim();

/**
 * Reporting cooldown. If Redis goes down, every request on every hot path
 * would otherwise raise its own Sentry event — turning one incident into an
 * event storm that buries everything else. One report per minute per instance
 * is enough to notice, and cheap to ignore.
 */
const OUTAGE_REPORT_INTERVAL_MS = 60_000;
let lastOutageReportAt = 0;

async function reportOutageOnce(reason: string): Promise<void> {
  const now = Date.now();
  if (now - lastOutageReportAt < OUTAGE_REPORT_INTERVAL_MS) return;
  lastOutageReportAt = now;
  await reportHandledMessage("Rate limiter fell back to in-process window", {
    route: "rate-limit",
    tags: { reason: "redis-unavailable" },
    extra: { detail: reason },
  });
}

/**
 * @returns true if the request is allowed, false if rate-limited.
 */
export async function checkRateLimit(
  key: string,
  opts: { limit: number; windowMs: number },
): Promise<boolean> {
  if (!upstashConfigured()) {
    return checkRateLimitInProcess(key, opts);
  }

  const now = Date.now();
  // Unique per request: two calls in the same millisecond must be two members,
  // or the second silently overwrites the first's score and the window leaks.
  const member = `${now}-${Math.random().toString(36).slice(2, 10)}`;

  try {
    const result = await redisEval(
      SLIDING_WINDOW_LUA,
      [`rl:${key}`],
      [now, opts.windowMs, opts.limit, member],
    );
    return Number(result) === 1;
  } catch (err) {
    const reason =
      err instanceof UpstashError || err instanceof Error ? err.message : "unknown error";
    await reportOutageOnce(reason);
    return checkRateLimitInProcess(key, opts);
  }
}

// ── Key helpers ─────────────────────────────────────────────────────────────

/** Stable key helper for authenticated callers. */
export function rateLimitKey(scope: string, id: string): string {
  return `${scope}:${id}`;
}

/**
 * Rate-limit key for a caller with no session — public forms, where there is no
 * user id to key on and the only handle we have is the network address.
 *
 * Reads x-forwarded-for's FIRST entry, which on Vercel is the real client: the
 * proxy appends, so later entries are its own hops and are trivially spoofed by
 * sending your own XFF header. Falls back to x-real-ip, then to a single shared
 * bucket — a shared bucket throttles all anonymous callers together, which is
 * blunt but is the safe direction to fail when we cannot tell them apart.
 */
export function clientIpKey(scope: string, headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return `${scope}:${ip}`;
}
