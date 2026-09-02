// ============================================================================
//  GET /api/cron/sweep-unpaid   (Session 9 — pay-to-confirm hygiene)
//
//  Paid shop orders, event tickets and class enrollments reserve their
//  spot/stock at PaymentIntent-creation time and are confirmed by the Stripe
//  webhook on success. If a buyer abandons checkout the reservation lingers:
//    • orders        — `pending` row holding nothing (but cluttering reports)
//    • event_tickets — `reserved` row counted against the event's capacity
//    • invoices      — `sent` enrollment invoice + an `active` enrollment that
//                      holds a class spot (and may have bumped a waitlister)
//
//  This sweep releases reservations whose PaymentIntent never succeeded after a
//  grace window (default 2h, override with ?hours=N). It cancels the dangling
//  PaymentIntent, frees the reservation, and — for enrollments — drops the held
//  spot (status='dropped'), which fires the 0012 waitlist auto-promote trigger.
//
//  Auth: `Authorization: Bearer <CRON_SECRET>` (or ?secret=). Fails closed in
//  production when CRON_SECRET is unset. Runs with the service-role client.
//
//  Requires env: SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, STRIPE_SECRET_KEY.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron/auth";
import { reportHandledError } from "@/lib/observability/report";
import { stripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";

// True if the PaymentIntent has reached a terminal-success state.
function isPaid(status: string | undefined): boolean {
  return status === "succeeded" || status === "processing";
}

// Cancel a PaymentIntent if it's still in a cancelable state. Non-fatal.
async function cancelIntent(intentId: string | null | undefined) {
  if (!intentId) return;
  try {
    await stripe.paymentIntents.cancel(intentId);
  } catch {
    // Already canceled / succeeded / not cancelable — ignore.
  }
}

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    await reportHandledError(e, {
      route: "cron.sweep-unpaid",
      tags: { reason: "admin-client" },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 },
    );
  }

  const hours = Math.max(1, Math.min(168, Number(req.nextUrl.searchParams.get("hours")) || 2));
  const cutoffIso = new Date(Date.now() - hours * 3600_000).toISOString();
  const summary = { orders: 0, tickets: 0, enrollments: 0 };

  // ── 1. Stale pending shop orders ───────────────────────────────────────────
  const { data: orders } = await supabase
    .from("orders")
    .select("id, stripe_payment_intent_id, studio_id")
    .eq("status", "pending")
    .lt("created_at", cutoffIso);

  for (const o of orders ?? []) {
    const piId = o.stripe_payment_intent_id as string | null;
    // Confirm the PI really didn't succeed before we cancel the order.
    if (piId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        if (isPaid(pi.status)) continue; // webhook will (or did) finalise it
      } catch {
        /* PI lookup failed — treat as abandoned */
      }
    }
    await cancelIntent(piId);
    const { error } = await supabase
      .from("orders")
      .update({ status: "cancelled" })
      .eq("id", o.id)
      .eq("status", "pending"); // guard against a race with the webhook
    if (!error) {
      summary.orders += 1;
      console.log(`[sweep-unpaid] cancelled order ${o.id} (studio ${o.studio_id})`);
    }
  }

  // ── 2. Stale reserved event tickets ────────────────────────────────────────
  const { data: tickets } = await supabase
    .from("event_tickets")
    .select("id, stripe_payment_intent_id, events ( studio_id )")
    .eq("status", "reserved")
    .lt("purchased_at", cutoffIso);

  for (const t of tickets ?? []) {
    const piId = t.stripe_payment_intent_id as string | null;
    const eventRef = t.events as unknown as { studio_id: string } | null;
    if (piId) {
      try {
        const pi = await stripe.paymentIntents.retrieve(piId);
        if (isPaid(pi.status)) continue;
      } catch {
        /* treat as abandoned */
      }
    }
    await cancelIntent(piId);
    // Deleting frees the (event_id,user_id) slot and the sold_tickets sync
    // trigger recomputes the event's count.
    const { error } = await supabase
      .from("event_tickets")
      .delete()
      .eq("id", t.id)
      .eq("status", "reserved");
    if (!error) {
      summary.tickets += 1;
      console.log(`[sweep-unpaid] released ticket ${t.id} (studio ${eventRef?.studio_id ?? "unknown"})`);
    }
  }

  // ── 3. Stale unpaid enrollment invoices (release the held class spot) ───────
  // createEnrollmentIntent leaves a `sent` invoice + a stripe_payment_intent_id.
  // The PI metadata carries student_id + class_id, so we can drop the exact
  // enrollment that was reserved.
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, stripe_payment_intent_id, studio_id")
    .eq("status", "sent")
    .not("stripe_payment_intent_id", "is", null)
    .lt("created_at", cutoffIso);

  for (const inv of invoices ?? []) {
    const piId = inv.stripe_payment_intent_id as string;
    let meta: Record<string, string> = {};
    try {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (isPaid(pi.status)) continue; // paid (or settling) — leave it
      meta = (pi.metadata ?? {}) as Record<string, string>;
    } catch {
      // Couldn't read the PI — skip rather than risk voiding a real debt.
      continue;
    }

    const studentId = meta.student_id;
    const classId = meta.class_id;
    // Only sweep invoices that represent an enrollment reservation.
    if (!studentId || !classId) continue;

    await cancelIntent(piId);

    // Drop the held enrollment → fires the waitlist auto-promote trigger.
    await supabase
      .from("enrollments")
      .update({ status: "dropped" })
      .eq("student_id", studentId)
      .eq("class_id", classId)
      .eq("status", "active");

    const { error } = await supabase
      .from("invoices")
      .update({ status: "void" })
      .eq("id", inv.id)
      .eq("status", "sent");
    if (!error) {
      summary.enrollments += 1;
      console.log(`[sweep-unpaid] voided enrollment invoice ${inv.id} (studio ${inv.studio_id})`);
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    graceHours: hours,
    summary,
  });
}
