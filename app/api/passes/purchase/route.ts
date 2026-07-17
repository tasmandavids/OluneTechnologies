// ============================================================================
//  POST /api/passes/purchase — buy a $25 single adult ballet class pass.
//  Buyer must be an existing, logged-in self-managed adult student. Generates
//  a QR code (base64 PNG) encoding an opaque redemption token, then creates a
//  Stripe PaymentIntent (returns clientSecret). Confirmation of payment is
//  webhook-driven (see lib/webhooks/process-stripe-event.ts).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import QRCode from "qrcode";
import { CURRENCY } from "@/lib/currency";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { resolveTransferData } from "@/lib/stripe/connect";
import { CLASS_PASS_PRICE_CENTS } from "@/lib/passes/constants";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, self_managed, role")
    .eq("id", user.id)
    .single();

  if (!profile?.self_managed || profile.role !== "student") {
    return NextResponse.json(
      { error: "Only self-managed adult students can buy a class pass." },
      { status: 403 },
    );
  }
  if (!profile.studio_id) return NextResponse.json({ error: "No studio found." }, { status: 400 });

  const studioId = profile.studio_id as string;

  // Insert first so the DB mints qr_token, then build the QR payload around it.
  const { data: pass, error: insertErr } = await supabase
    .from("class_passes")
    .insert({
      studio_id: studioId,
      student_id: user.id,
      price_cents: CLASS_PASS_PRICE_CENTS,
      currency: CURRENCY,
      status: "reserved",
    })
    .select("id, qr_token")
    .single();

  if (insertErr || !pass) {
    return NextResponse.json({ error: insertErr?.message ?? "Could not create pass" }, { status: 500 });
  }

  const qrPayload = JSON.stringify({
    kind: "class_pass",
    pass_id: pass.id,
    qr_token: pass.qr_token,
    student_id: user.id,
    issued_at: new Date().toISOString(),
  });
  const qrDataUrl = await QRCode.toDataURL(qrPayload, { width: 300, margin: 2 });

  const stripe = (await import("@/lib/stripe")).stripe;
  const customerId = await getOrCreateStripeCustomer(supabase, user.id, studioId);

  const intent = await stripe.paymentIntents.create({
    amount: CLASS_PASS_PRICE_CENTS,
    currency: CURRENCY,
    customer: customerId,
    metadata: {
      class_pass_id: pass.id,
      user_id: user.id,
      studio_id: studioId,
    },
    transfer_data: await resolveTransferData(supabase, studioId),
  });

  const { error: updateErr } = await supabase
    .from("class_passes")
    .update({ qr_code: qrDataUrl, stripe_payment_intent_id: intent.id })
    .eq("id", pass.id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json(
    { clientSecret: intent.client_secret, qrCode: qrDataUrl, passId: pass.id },
    { status: 201 },
  );
}
