// ============================================================================
//  POST /api/events/purchase — purchase tickets for an event.
//  Generates a QR code (base64 PNG) stored on the ticket row.
//  Free events: reserve immediately. Paid: create Stripe intent (returns clientSecret).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import { CURRENCY } from "@/lib/currency";
import { familyDiscountInfo } from "@/lib/discounts";
import { isUuid } from "@/lib/validation/uuid";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { resolveDestinationCharge } from "@/lib/stripe/connect";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await checkRateLimit(rateLimitKey("event-purchase", user.id), { limit: 20, windowMs: 60_000 }))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json();
  const { eventId, quantity = 1 } = body as { eventId: string; quantity?: number };

  if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });
  if (!isUuid(eventId)) return NextResponse.json({ error: "Invalid eventId" }, { status: 400 });
  if (quantity < 1 || quantity > 10) return NextResponse.json({ error: "Quantity 1–10" }, { status: 400 });

  // Fetch event
  const { data: event, error: evErr } = await supabase
    .from("events")
    .select("id, studio_id, name, ticket_price, total_tickets, sold_tickets, status, event_date")
    .eq("id", eventId)
    .single();

  if (evErr || !event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  if (event.status !== "published") return NextResponse.json({ error: "Event not available" }, { status: 400 });
  if (event.total_tickets - event.sold_tickets < quantity) {
    return NextResponse.json({ error: "Not enough tickets available" }, { status: 400 });
  }

  // Family discount (opt-in per studio) — applied to tickets when the buyer
  // already has an actively-enrolled student. No-op unless the studio enabled it.
  const grossCents = event.ticket_price * quantity;
  const discount = await familyDiscountInfo(supabase, event.studio_id, user.id, grossCents);
  const totalCents = discount.discountedCents;

  // Generate QR code — encodes a JSON payload identifying the ticket.
  //
  // qr_token is the part that matters: it is an unguessable secret minted here
  // and stored on the row, so the door scanner can verify the code came from
  // us. Everything else in the payload is a convenience for humans reading a
  // scan log — the scanner trusts NONE of it, and reads quantity and status
  // from the row, because the holder controls what their QR says.
  //
  // Generating it here rather than leaning on the column default is deliberate:
  // the payload has to be encoded into the image before the row is written, and
  // on re-purchase the upsert below rotates the token, invalidating the old QR.
  const qrToken = crypto.randomUUID();
  const qrPayload = JSON.stringify({
    kind:       "event_ticket",
    event_id:   event.id,
    qr_token:   qrToken,
    event_name: event.name,
    event_date: event.event_date,
    quantity,
    issued_at:  new Date().toISOString(),
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });

  if (totalCents === 0) {
    // Free event — reserve immediately
    const { data: ticket, error: tickErr } = await supabase
      .from("event_tickets")
      .upsert(
        {
          event_id:      event.id,
          user_id:       user.id,
          quantity,
          total_cents:   0,
          qr_code:       qrDataUrl,
          qr_token:      qrToken,
          status:        "paid",
          // Re-issuing supersedes the old QR, so any earlier check-in against
          // it is cleared — otherwise a re-purchase would arrive at the door
          // already marked as admitted.
          checked_in_at: null,
          checked_in_by: null,
        },
        { onConflict: "event_id,user_id" }
      )
      .select()
      .single();

    if (tickErr) return NextResponse.json({ error: tickErr.message }, { status: 500 });

    // Notify user
    const { data: profile } = await supabase
      .from("profiles")
      .select("studio_id")
      .eq("id", user.id)
      .single();

    if (profile?.studio_id) {
      await supabase.from("notifications").insert({
        studio_id: profile.studio_id,
        user_id:   user.id,
        type:      "event_ticket",
        title:     `Tickets confirmed for ${event.name}`,
        body:      `${quantity} ticket${quantity > 1 ? "s" : ""} reserved. See you there!`,
        link:      "/portal/parent",
        payload:   { event_id: event.id, ticket_id: ticket?.id },
      });
    }

    return NextResponse.json({ ticket, qrCode: qrDataUrl, free: true }, { status: 201 });
  }

  // Paid event — create Stripe PaymentIntent
  const stripe = (await import("@/lib/stripe")).stripe;
  const customerId = await getOrCreateStripeCustomer(supabase, user.id, event.studio_id as string);

  const intent = await stripe.paymentIntents.create({
    amount:   totalCents,
    currency: CURRENCY,
    customer: customerId,
    metadata: {
      event_id: event.id,
      user_id:  user.id,
      quantity: String(quantity),
      // Saves the webhook a lookup on `events` to dispatch payment.succeeded.
      studio_id: event.studio_id as string,
    },
    ...(await resolveDestinationCharge(supabase, event.studio_id as string)),
  });

  // Reserve ticket row (pending payment)
  await supabase.from("event_tickets").upsert(
    {
      event_id:                 event.id,
      user_id:                  user.id,
      quantity,
      total_cents:              totalCents,
      qr_code:                  qrDataUrl,
      qr_token:                 qrToken,
      stripe_payment_intent_id: intent.id,
      status:                   "reserved",
      checked_in_at:            null,
      checked_in_by:            null,
    },
    { onConflict: "event_id,user_id" }
  );

  return NextResponse.json({
    clientSecret: intent.client_secret,
    totalCents,
    qrCode:       qrDataUrl,
    free:         false,
  }, { status: 201 });
}
