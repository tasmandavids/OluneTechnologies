// ============================================================================
//  GET /api/cron/ledger-sync
//
//  Daily catch-up for Olune Books. Books pages already sync when they load,
//  but a studio that doesn't open Books for a month should still find its
//  ledger current, and a tax return's figures shouldn't depend on someone
//  having visited the dashboard. Each studio's sync is idempotent, so running
//  this beside a page-load sync is harmless.
//
//  Ordering: stalest `last_synced_at` first, so a run cut short still makes
//  progress where it matters.
//
//  Auth: `Authorization: Bearer <CRON_SECRET>` (or ?secret= in local dev).
//  Requires env: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron/auth";
import { reportHandledError } from "@/lib/observability/report";
import { syncStudioLedger } from "@/lib/ledger/server/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LIMIT = 500;

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    await reportHandledError(e, { route: "cron.ledger-sync", tags: { reason: "admin-client" } });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Admin client unavailable" }, { status: 500 });
  }

  const { data: studios, error } = await supabase
    .from("ledger_settings")
    .select("studio_id")
    .eq("auto_post", true)
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(LIMIT);
  if (error) {
    await reportHandledError(error, { route: "cron.ledger-sync", tags: { reason: "list" } });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const started = Date.now();
  let synced = 0;
  let failed = 0;
  let posted = 0;
  for (const row of studios ?? []) {
    // Leave headroom under maxDuration; the rest go first tomorrow.
    if (Date.now() - started > 240_000) break;
    try {
      const report = await syncStudioLedger(supabase, row.studio_id as string, { force: true });
      synced++;
      posted += (report?.posted ?? 0) + (report?.reposted ?? 0);
      if (report?.errors.length) failed++;
    } catch (e) {
      failed++;
      await reportHandledError(e, { route: "cron.ledger-sync", tags: { studio: row.studio_id as string } });
    }
  }

  return NextResponse.json({ ok: true, studios: studios?.length ?? 0, synced, failed, posted });
}
