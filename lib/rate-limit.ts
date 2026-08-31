// ============================================================================
//  Simple in-process sliding-window rate limiter for server actions / API routes.
//  Suitable for single-instance / low-traffic abuse prevention. For multi-region
//  Vercel fleets, replace with Redis/Upstash when traffic warrants it.
// ============================================================================

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
 * @returns true if the request is allowed, false if rate-limited.
 */
export function checkRateLimit(
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
 *
 * This is per-instance, like the rest of this module. On a Fluid Compute fleet
 * the effective limit is multiplied by the number of live instances, so treat
 * these numbers as "stops a script", not "stops a botnet".
 */
export function clientIpKey(scope: string, headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || headers.get("x-real-ip")?.trim() || "unknown";
  return `${scope}:${ip}`;
}
