// ============================================================================
//  POST /api/webhooks/stripe-connect
//
//  Stripe Connect account events (account.updated, capability.updated, ...).
//  Signed with a separate secret from the platform endpoint — Stripe HMACs
//  each webhook endpoint independently. Subscribe this endpoint to Connect
//  events in the Stripe Dashboard.
//
//  Requires env: STRIPE_CONNECT_WEBHOOK_SECRET
//
//  ── This endpoint does NOT hear about studio accounts — by design
//  Studio accounts are Accounts v2 (see lib/stripe/connect.ts). v2 status
//  changes are emitted as `v2.core.account[configuration.merchant]
//  .capability_status_updated` and friends, and a CLASSIC webhook endpoint
//  cannot subscribe to those — the API rejects the event names outright.
//  v2 events are delivered to an Event Destination
//  (`stripe.v2.core.eventDestinations`) instead, which is a different payload
//  shape and a different route: /api/webhooks/stripe-v2.
//
//  So a studio's status is refreshed from four places, and this is not one of
//  them:
//    • /api/webhooks/stripe-v2 — the Event Destination, within seconds;
//    • /api/cron/sync-connect-accounts — nightly sweep, in case the
//      destination is unregistered, disabled or pointed at the wrong host;
//    • /api/stripe/connect/return — on return from onboarding; and
//    • the refresh action on /portal/admin/payments — on demand.
//
//  This route is kept for platform-level Connect events that ARE classic
//  (transfers, payouts on the platform account). If it ever starts logging
//  `account.updated` for a studio, something is creating v1 accounts again.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { reportHandledError, reportHandledMessage } from "@/lib/observability/report";
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

  if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    console.error("STRIPE_CONNECT_WEBHOOK_SECRET not set");
    await reportHandledMessage("Stripe Connect webhook secret not configured", {
      route: "webhook.stripe-connect",
      tags: { reason: "misconfigured" },
    });
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (err) {
    // Unreported for the same reason as the platform webhook: publicly
    // POST-able, so unbounded attacker-controlled volume.
    console.error("[stripe-connect-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await getServiceSupabase();
  } catch (err) {
    console.error("[stripe-connect-webhook] service client unavailable:", err);
    await reportHandledError(err, {
      route: "webhook.stripe-connect",
      tags: { reason: "service-client" },
    });
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Same idempotency ledger as the platform endpoint — Stripe event ids are
  // globally unique across the platform account and all connected accounts.
  const { error: ledgerError } = await supabase
    .from("stripe_events")
    .insert({ id: event.id, type: event.type, account: event.account ?? null });

  if (ledgerError) {
    if (ledgerError.code === "23505") {
      console.log(`[stripe-connect-webhook] duplicate event ${event.id} ignored`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.warn(`[stripe-connect-webhook] ledger insert failed (continuing):`, ledgerError.message);
  }

  try {
    await processStripeEvent(event, supabase);
    return NextResponse.json({ received: true });
  } catch (err) {
    console.error("[stripe-connect-webhook] handler error:", err);
    await reportHandledError(err, {
      route: "webhook.stripe-connect",
      tags: { reason: "handler" },
    });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
