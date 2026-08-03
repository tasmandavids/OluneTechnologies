import type { NextRequest } from "next/server";

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
  if (header === `Bearer ${secret}`) return true;

  // Query-string secrets are local-dev only (avoid leaking via logs/referrers).
  if (isLocalDev && req.nextUrl.searchParams.get("secret") === secret) {
    return true;
  }
  return false;
}
