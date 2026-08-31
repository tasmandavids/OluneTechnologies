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
//  ── KNOWN GAP: this endpoint no longer hears about studio accounts
//  Studio accounts are Accounts v2 (see lib/stripe/connect.ts). v2 status
//  changes are emitted as `v2.core.account[configuration.merchant]
//  .capability_status_updated` and friends, and a CLASSIC webhook endpoint
//  cannot subscribe to those — the API rejects the event names outright.
//  v2 events are delivered to an Event Destination
//  (`stripe.v2.core.eventDestinations`) instead, which is a different payload
//  shape and a different route.
//
//  Until that exists, a studio's status is refreshed:
//    • on return from onboarding — /api/stripe/connect/return calls
//      syncStripeAccountStatus(), which is the common case; and
//    • on demand — the refresh action on /portal/admin/payments.
//
//  What is NOT covered is Stripe restricting an already-onboarded studio
//  later (expired documents, a review). Olune will keep believing that studio
//  is chargeable until something calls the sync, so charges will start failing
//  before the dashboard admits anything is wrong. Building the Event
//  Destination is the fix; a periodic sync of connected accounts would also
//  close it.
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

  if (!process.env.STRIPE_CONNECT_WEBHOOK_SECRET) {
    console.error("STRIPE_CONNECT_WEBHOOK_SECRET not set");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_CONNECT_WEBHOOK_SECRET);
  } catch (err) {
    console.error("[stripe-connect-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await getServiceSupabase();
  } catch (err) {
    console.error("[stripe-connect-webhook] service client unavailable:", err);
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
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
