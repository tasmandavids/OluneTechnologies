import { NextResponse, type NextRequest } from "next/server";
import { authorizedCron } from "@/lib/cron/auth";
import {
  PRODUCTION_REQUIRED_SECRETS,
  missingProductionSecrets,
} from "@/lib/env/required-secret";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which production-required secrets are missing at runtime.
 *
 * Exists because the Vercel dashboard is SAML-gated for this team, so there is
 * otherwise no way to confirm from outside that a deployment can actually
 * decrypt integration credentials. Every secret in the registry has a dev
 * fallback, so a missing one is silent until a studio owner hits the code path.
 *
 * Reports names and consequences only — never a value, a length, or a prefix,
 * since a length narrows a brute-force search and this response crosses the
 * network. Writes nothing, so unlike the cron routes it is safe to call with
 * the real CRON_SECRET:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *     https://www.olune.co.nz/api/health/secrets
 *
 * Reuses cron auth rather than admin session auth so it can be checked without
 * a browser, and stays closed in production when CRON_SECRET is unset.
 */
export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const missing = missingProductionSecrets();

  return NextResponse.json(
    {
      ok: missing.length === 0,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
      checked: PRODUCTION_REQUIRED_SECRETS.length,
      missing,
    },
    // 200 even when degraded: this is a diagnostic read, and a 5xx here would
    // show up as a deployment error in Vercel's dashboard. Read `ok`.
    { headers: { "Cache-Control": "no-store" } },
  );
}
