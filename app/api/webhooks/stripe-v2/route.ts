// ============================================================================
//  POST /api/webhooks/stripe-v2
//
//  Stripe Event Destination endpoint — Accounts v2 thin event notifications.
//
//  This is the third Stripe endpoint and the reason for it is a hard API
//  constraint, not a preference: v2 event names
//  (`v2.core.account[configuration.merchant].capability_status_updated` and
//  friends) CANNOT be added to a classic webhook endpoint. Stripe rejects the
//  names. They are delivered to an Event Destination
//  (`stripe.v2.core.eventDestinations`), whose payload is a thin notification —
//  an id, a type and a `related_object` pointer, with no `data.object` — so it
//  needs its own parser (`parseEventNotification`, not `constructEvent`), its
//  own signing secret, and its own route.
//
//  Register the destination with:  node --env-file=.env.local \
//      scripts/setup-v2-event-destination.mjs --url https://<host>/api/webhooks/stripe-v2
//  which prints the signing secret to put in STRIPE_V2_WEBHOOK_SECRET.
//
//  Requires env: STRIPE_V2_WEBHOOK_SECRET, STRIPE_SECRET_KEY,
//                SUPABASE_SERVICE_ROLE_KEY.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { reportHandledError, reportHandledMessage } from "@/lib/observability/report";
import { stripe } from "@/lib/stripe";
import { getServiceSupabase } from "@/lib/webhooks/service-supabase";
import {
  processStripeV2Event,
  type StripeV2Notification,
} from "@/lib/webhooks/process-stripe-v2-event";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  if (!process.env.STRIPE_V2_WEBHOOK_SECRET) {
    console.error("STRIPE_V2_WEBHOOK_SECRET not set");
    await reportHandledMessage("Stripe v2 event destination secret not configured", {
      route: "webhook.stripe-v2",
      tags: { reason: "misconfigured" },
    });
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  let notification: StripeV2Notification;
  try {
    notification = stripe.parseEventNotification(
      body,
      sig,
      process.env.STRIPE_V2_WEBHOOK_SECRET,
    ) as unknown as StripeV2Notification;
  } catch (err) {
    // Unreported for the same reason as the other two endpoints: publicly
    // POST-able, so an attacker controls how much of this we'd emit.
    console.error("[stripe-v2-webhook] signature verification failed:", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let supabase;
  try {
    supabase = await getServiceSupabase();
  } catch (err) {
    console.error("[stripe-v2-webhook] service client unavailable:", err);
    await reportHandledError(err, {
      route: "webhook.stripe-v2",
      tags: { reason: "service-client" },
    });
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  // Same ledger as the v1 endpoints. v2 event ids share the `evt_` namespace
  // and the same uniqueness guarantee, so one table still covers every
  // delivery path — and a destination that re-delivers after a timeout cannot
  // double-apply anything.
  const { error: ledgerError } = await supabase.from("stripe_events").insert({
    id: notification.id,
    type: notification.type,
    account: notification.related_object?.id ?? null,
  });

  if (ledgerError) {
    if (ledgerError.code === "23505") {
      console.log(`[stripe-v2-webhook] duplicate event ${notification.id} ignored`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.warn(`[stripe-v2-webhook] ledger insert failed (continuing):`, ledgerError.message);
  }

  try {
    const outcome = await processStripeV2Event(notification, supabase);
    console.log(
      `[stripe-v2-webhook] ${notification.type}` +
        (outcome.accountId ? ` ${outcome.accountId}` : "") +
        ` — ${outcome.detail}`,
    );
    return NextResponse.json({ received: true, handled: outcome.handled });
  } catch (err) {
    console.error("[stripe-v2-webhook] handler error:", err);
    await reportHandledError(err, {
      route: "webhook.stripe-v2",
      tags: { reason: "handler" },
      extra: { eventType: notification.type, eventId: notification.id },
    });
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }
}
