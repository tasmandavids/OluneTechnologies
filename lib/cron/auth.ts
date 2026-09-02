import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/** Constant-time string comparison, safe for equal-length secret checks. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Authorize Vercel Cron / manual cron invocations.
 * Always requires CRON_SECRET when set. When unset, only local development
 * (NODE_ENV !== "production" AND no VERCEL_ENV) may proceed — staging/preview
 * with production-like data must configure the secret.
 */
export function authorizedCron(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const isLocalDev =
    process.env.NODE_ENV !== "production" && !process.env.VERCEL_ENV;

  if (!secret) {
    return isLocalDev;
  }

  const header = req.headers.get("authorization");
  if (header && safeEqual(header, `Bearer ${secret}`)) return true;

  // Query-string secrets are local-dev only (avoid leaking via logs/referrers).
  const queryParam = req.nextUrl.searchParams.get("secret");
  if (isLocalDev && queryParam && safeEqual(queryParam, secret)) {
    return true;
  }
  return false;
}
