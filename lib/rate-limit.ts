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
