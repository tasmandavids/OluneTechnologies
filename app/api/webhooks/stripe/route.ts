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

import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { getServiceSupabase } from "@/lib/webhooks/service-supabase";
import { processStripeEvent } from "@/lib/webhooks/process-stripe-event";
import type Stripe from "stripe";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await getServiceSupabase();
  } catch (err) {
    console.error("[stripe-webhook] service client unavailable:", err);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // ── Idempotency ledger (migration 0020) ──────────────────────────────────
  // Stripe retries on non-2xx and can deliver the same event more than once.
  // Record the event.id first; if it's already present, this is a replay — ack
  // with 200 and do no further work. A failed insert (e.g. table missing in a
  // not-yet-migrated env) is non-fatal: we fall through and process the event.
  const { error: ledgerError } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, account: event.account ?? null });

  if (ledgerError) {
    // Unique-violation → we've already handled this event. Anything else
    // (table absent, transient) is logged and we continue processing.
    if (ledgerError.code === "23505") {
      console.log(`[stripe-webhook] duplicate event ${event.id} ignored`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.warn(`[stripe-webhook] ledger insert failed (continuing):`, ledgerError.message);
  }

  try {
    await processStripeEvent(event, supabase);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
