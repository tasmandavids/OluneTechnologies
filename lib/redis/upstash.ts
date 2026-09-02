// ============================================================================
//  Minimal Upstash Redis client over the REST API.
//
//  No SDK, by the same reasoning as lib/notify/providers.ts: this is a handful
//  of HTTP calls, and a dependency that ships its own connection pooling is
//  the wrong shape for a serverless fleet that gets frozen between requests.
//
//  Reads either naming convention, so it works whether the store was created
//  through Upstash directly or provisioned as a Vercel KV / Marketplace
//  integration (which sets KV_REST_API_*). Unconfigured is a supported state,
//  not an error — callers fall back to something local.
//
//  Requires env (either pair): UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//                          or  KV_REST_API_URL + KV_REST_API_TOKEN
// ============================================================================

/**
 * How long a Redis call may take before we give up on it.
 *
 * This sits in front of checkout and enrolment, so the ceiling matters more
 * than the answer: a rate-limit check that hangs for 10s has done far more
 * damage than one that fails open in 800ms.
 */
const TIMEOUT_MS = 800;

function restUrl(): string | null {
  return process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || null;
}

function restToken(): string | null {
  return process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || null;
}

/** True when both halves of a credential pair are present. */
export function upstashConfigured(): boolean {
  return Boolean(restUrl() && restToken());
}

export class UpstashError extends Error {}

/**
 * Runs a Lua script server-side and returns its result.
 *
 * EVAL rather than a pipeline because the scripts here need to *decide* midway
 * (read a count, then conditionally write). A pipeline would have to write
 * unconditionally and correct itself afterwards, which is neither atomic nor
 * correct under concurrency — the exact thing a shared limiter exists to fix.
 *
 * Throws on transport failure, timeout, or a Redis-level error. Callers decide
 * what an unreachable Redis means for them; this layer does not guess.
 */
export async function redisEval(
  script: string,
  keys: string[],
  args: (string | number)[],
): Promise<unknown> {
  const url = restUrl();
  const token = restToken();
  if (!url || !token) throw new UpstashError("Upstash is not configured");

  const command = [
    "EVAL",
    script,
    String(keys.length),
    ...keys,
    ...args.map((a) => String(a)),
  ];

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    // AbortError (our timeout) and network failures land here alike.
    throw new UpstashError(err instanceof Error ? err.message : "Upstash request failed");
  }

  if (!res.ok) {
    throw new UpstashError(`Upstash responded ${res.status}`);
  }

  const payload = (await res.json().catch(() => null)) as
    | { result?: unknown; error?: string }
    | null;

  if (!payload) throw new UpstashError("Upstash returned a non-JSON body");
  if (typeof payload.error === "string") throw new UpstashError(payload.error);

  return payload.result;
}
