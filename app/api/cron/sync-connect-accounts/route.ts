// ============================================================================
//  GET /api/cron/sync-connect-accounts
//
//  Re-reads every studio's Accounts v2 status from Stripe and writes it back to
//  stripe_connect_accounts.
//
//  This is deliberate belt-and-braces for /api/webhooks/stripe-v2. That
//  endpoint is the real fix — it reacts in seconds — but it depends on an Event
//  Destination existing, being enabled, pointing at the right host, and holding
//  a signing secret that matches STRIPE_V2_WEBHOOK_SECRET. Four pieces of
//  dashboard state that no deploy can verify, guarding the one fact that must
//  not go stale: whether a studio can still take money. If any of them is wrong
//  the failure is silent and indefinite, so a daily sweep re-derives the truth
//  from Stripe regardless.
//
//  It also covers the case the webhook structurally cannot: a status that was
//  already wrong before the destination was ever registered.
//
//  Ordering: oldest `last_synced_at` first, so a partial run (rate limit,
//  timeout) still makes progress on the stalest rows rather than re-checking
//  the same head of the list every night.
//
//  Auth: `Authorization: Bearer <CRON_SECRET>` (or ?secret= in local dev).
//
//  Requires env: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, STRIPE_SECRET_KEY.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron/auth";
import { reportHandledError, reportHandledMessage } from "@/lib/observability/report";
import { syncStripeAccountStatus } from "@/lib/stripe/connect";

export const dynamic = "force-dynamic";

/** Ceiling on accounts touched per run, so one sweep cannot exhaust the function's time budget. */
const DEFAULT_LIMIT = 200;

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    await reportHandledError(e, {
      route: "cron.sync-connect-accounts",
      tags: { reason: "admin-client" },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 },
    );
  }

  const limit = Math.max(
    1,
    Math.min(1000, Number(req.nextUrl.searchParams.get("limit")) || DEFAULT_LIMIT),
  );

  const { data: accounts, error } = await supabase
    .from("stripe_connect_accounts")
    .select("studio_id, stripe_account_id, charges_enabled")
    .order("last_synced_at", { ascending: true, nullsFirst: true })
    .limit(limit);

  if (error) {
    await reportHandledError(new Error(error.message), {
      route: "cron.sync-connect-accounts",
      tags: { reason: "query" },
    });
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const summary = { checked: 0, changed: 0, lost: 0, failed: 0 };
  const lostAccess: string[] = [];

  for (const row of accounts ?? []) {
    summary.checked += 1;
    let updated;
    try {
      updated = await syncStripeAccountStatus(supabase, row.stripe_account_id as string);
    } catch (e) {
      // One unreadable account must not abort the sweep — the rest of the
      // studios still need checking.
      summary.failed += 1;
      console.warn(
        `[sync-connect-accounts] ${row.stripe_account_id} failed:`,
        e instanceof Error ? e.message : e,
      );
      continue;
    }
    if (!updated) continue;

    const was = row.charges_enabled === true;
    if (was !== updated.charges_enabled) {
      summary.changed += 1;
      console.log(
        `[sync-connect-accounts] ${row.stripe_account_id} charges_enabled ${was} → ${updated.charges_enabled}`,
      );
    }
    if (was && !updated.charges_enabled) {
      summary.lost += 1;
      lostAccess.push(`${row.studio_id}/${row.stripe_account_id}`);
    }
  }

  // A studio losing the ability to charge is the whole point of this sweep. If
  // the webhook were working we'd already know, so finding one here also means
  // the Event Destination probably is not delivering — report both facts.
  if (summary.lost > 0) {
    await reportHandledMessage(
      `Nightly sweep found ${summary.lost} studio(s) that can no longer take payments`,
      {
        route: "cron.sync-connect-accounts",
        tags: { reason: "charges-disabled" },
        extra: { accounts: lostAccess },
      },
    );
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), summary });
}
