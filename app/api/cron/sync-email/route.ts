// ============================================================================
//  GET /api/cron/sync-email
//
//  Pulls every studio's connected mailbox (Gmail / Microsoft 365 / IMAP) into
//  the studio inbox.
//
//  CADENCE SAFETY (0117 cron cadence change): this route fans out over studios
//  sequentially, and each studio's sync is a series of network round-trips to a
//  third-party mail provider. A daily run could afford to walk the whole list;
//  a 30-minute run cannot, because a slow provider on studio #3 would push the
//  route past its wall clock and the next scheduled run would start while this
//  one was still going — two syncs writing the same messages concurrently.
//
//  Two changes make the higher cadence safe:
//
//    1. A wall-clock budget. The loop stops cleanly when it runs out of time
//       and reports what it didn't reach, rather than being killed mid-studio.
//    2. Least-recently-synced first. Under a budget, a stable ordering would
//       starve the tail forever — the same studios would be reached every run
//       and the last ones never. Ordering by `last_sync_at` (nulls first, so a
//       newly connected mailbox syncs immediately) makes the budget rotate
//       through every studio instead of truncating the same list each pass.
//
//  Auth: `Authorization: Bearer <CRON_SECRET>` (or ?secret= in local dev).
//  Requires env: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron/auth";
import { reportHandledMessage } from "@/lib/observability/report";
import { syncStudioAccounts } from "@/lib/email/sync";
import { isUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Stop starting new studios past this point. Set below `maxDuration` so the
 * route returns its summary under its own control instead of being terminated
 * part-way through a studio, which is what would overlap the next run.
 */
const BUDGET_MS = 240_000;

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const supabase = createAdminClient();
  const studioId = req.nextUrl.searchParams.get("studioId");

  if (studioId && !isUuid(studioId)) {
    return NextResponse.json({ error: "Invalid studio id" }, { status: 400 });
  }

  // Single-studio mode (manual re-sync from the Connections hub) is unbounded
  // by design: it's one studio, initiated by a human who is waiting for it.
  if (studioId) {
    const result = await syncStudioAccounts(supabase, studioId);
    return NextResponse.json(result);
  }

  // Least-recently-synced studio first. `nullsFirst` puts a mailbox that has
  // never synced at the front, which is what a studio that just connected one
  // expects to happen.
  const { data: accounts } = await supabase
    .from("email_accounts")
    .select("studio_id, last_sync_at")
    .order("last_sync_at", { ascending: true, nullsFirst: true });

  // A studio is due as early as its stalest account; the ordering above means
  // first-seen wins, so a plain de-dupe preserves it.
  const ids = [...new Set((accounts ?? []).map((a) => a.studio_id as string))];

  let synced = 0;
  let studiosProcessed = 0;
  const errors: string[] = [];

  for (const id of ids) {
    if (Date.now() - startedAt > BUDGET_MS) break;
    const result = await syncStudioAccounts(supabase, id);
    synced += result.synced;
    studiosProcessed += 1;
    errors.push(...result.errors);
  }

  const skipped = ids.length - studiosProcessed;

  // A mailbox that stops syncing is invisible from the outside: the Inbox hub
  // simply shows nothing new. The per-account errors are already collected for
  // the response body, so surface them rather than letting them expire with it.
  if (errors.length) {
    await reportHandledMessage("Email sync reported per-account errors", {
      route: "cron.sync-email",
      tags: { reason: "account-sync" },
      extra: { errorCount: errors.length, errors: errors.slice(0, 10), studiosProcessed },
    });
  }

  return NextResponse.json({
    studios: ids.length,
    studiosProcessed,
    // Not an error: the next run picks these up first, because they're now the
    // least-recently-synced. Reported so a persistently large number is visible
    // as the signal to shard this route rather than silently lagging.
    skippedForBudget: skipped,
    synced,
    errors,
    elapsedMs: Date.now() - startedAt,
  });
}
