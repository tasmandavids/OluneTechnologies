// ============================================================================
//  POST /api/webhooks/stripe
//
//  Platform-account Stripe events. Handled event types:
//    • payment_intent.succeeded   → mark invoice/order/ticket paid, record payment
//    • invoice.paid               → finalise an existing invoice, OR (for
//                                   subscription auto-pay charges) mirror a new
//                                   per-charge invoices + payments row
//    • invoice.payment_failed     → mark overdue + payment_failed notification
//    • charge.refunded            → reconcile refunds
//    • customer.subscription.*    → sync the subscriptions row status/period
//
//  Under Connect destination charges, PaymentIntents/Charges/Refunds stay on
//  the platform account (only the settled funds transfer out), so all of the
//  above keep arriving here unchanged. See /api/webhooks/stripe-connect for
//  account.updated and other Connect-account-scoped events.
//
//  Requires env: STRIPE_WEBHOOK_SECRET
// ============================================================================

import { claimStripeEvent, markStripeEventProcessed } from "@/lib/webhooks/claim-event";
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getServiceSupabase } from "@/lib/webhooks/service-supabase";
import { processStripeEvent } from "@/lib/webhooks/process-stripe-event";
import { reportHandledError, reportHandledMessage } from "@/lib/observability/report";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET not set");
    await reportHandledMessage("Stripe webhook secret not configured", {
      route: "webhook.stripe",
      tags: { reason: "misconfigured" },
    });
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    // Deliberately not reported to Sentry. Anyone on the internet can POST here
    // with a bad signature, so this is unbounded, attacker-controlled volume —
    // it would bury the failures that matter. A rotated secret shows up instead
    // as Stripe's own delivery failures in the dashboard.
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await getServiceSupabase();
  } catch (err) {
    console.error("[stripe-webhook] service client unavailable:", err);
    await reportHandledError(err, {
      route: "webhook.stripe",
      tags: { reason: "service-client" },
      extra: { eventType: event.type },
    });
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // ── Idempotency ledger (migration 0020) ──────────────────────────────────
  // Stripe retries on non-2xx and can deliver the same event more than once.
  // Record the event.id first as a processing claim; if it's already present,
  // this is a replay — ack with 200 and do no further work.
  const claim = await claimStripeEvent(supabase, { id: event.id, type: event.type, account: event.account ?? null });
  const ledgerError = claim.status === "error" ? claim : null;

  if (claim.status === "duplicate") {
    console.log(`[stripe-webhook] duplicate event ${event.id} ignored`);
    return NextResponse.json({ received: true, duplicate: true });
  }

  if (ledgerError) {
    // Processing without a claim lets concurrent deliveries race and a later
    // retry apply the same payment twice. Return 500 so Stripe retries once
    // the ledger is healthy again — same rule as /api/webhooks/stripe-v2.
    console.error(`[stripe-webhook] ledger insert failed:`, ledgerError.message);
    await reportHandledMessage("Stripe idempotency ledger insert failed", {
      route: "webhook.stripe",
      tags: { reason: "ledger" },
      extra: { eventType: event.type, code: ledgerError.code, message: ledgerError.message },
    });
    return NextResponse.json({ error: "Event ledger unavailable" }, { status: 500 });
  }

  try {
    await processStripeEvent(event, supabase);
    await markStripeEventProcessed(supabase, event.id);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    // The insert above is a processing claim, not proof of success. Without
    // releasing it, Stripe's retry is acked as a duplicate and the event is
    // lost — e.g. a charged order that never gets marked paid.
    const { error: releaseError } = await supabase
      .from("stripe_events")
      .delete()
      .eq("id", event.id);
    await reportHandledError(err, {
      route: "webhook.stripe",
      tags: { reason: "handler", eventType: event.type },
      extra: {
        eventId: event.id,
        account: event.account ?? null,
        claimReleased: !releaseError,
        releaseError: releaseError?.message,
      },
    });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
