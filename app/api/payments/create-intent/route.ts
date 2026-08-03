// ============================================================================
//  POST /api/payments/create-intent
//
//  Creates a Stripe PaymentIntent for a given invoice.
//  Also ensures the user has a Stripe Customer record.
//
//  Body: { invoiceId: string }
//  Returns: { clientSecret: string }
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { CURRENCY } from "@/lib/currency";
import { isUuid } from "@/lib/validation/uuid";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { resolveTransferData } from "@/lib/stripe/connect";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    if (!checkRateLimit(rateLimitKey("pay-intent", user.id), { limit: 20, windowMs: 60_000 })) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const body = await req.json();
    const { invoiceId } = body as { invoiceId: string };

    if (!invoiceId) {
      return NextResponse.json({ error: "invoiceId required" }, { status: 400 });
    }
    if (!isUuid(invoiceId)) {
      return NextResponse.json({ error: "Invalid invoiceId" }, { status: 400 });
    }

    // Fetch invoice — RLS ensures the user can only access their own invoices
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("id, amount_cents, studio_id, payer_id, stripe_payment_intent_id")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Return existing intent if already created (idempotency)
    if (invoice.stripe_payment_intent_id) {
      const intent = await stripe.paymentIntents.retrieve(
        invoice.stripe_payment_intent_id as string,
      );
      if (intent.status !== "canceled") {
        return NextResponse.json({ clientSecret: intent.client_secret });
      }
    }

    // Ensure Stripe customer exists (per-studio once the studio has its own
    // connected Stripe account, else the legacy global platform customer).
    const customerId = await getOrCreateStripeCustomer(supabase, user.id, invoice.studio_id as string);

    // Fetch studio for currency / descriptor
    const { data: studio } = await supabase
      .from("studios")
      .select("name")
      .eq("id", invoice.studio_id)
      .single();

    // Create PaymentIntent — settles directly to the studio's own Stripe
    // account once they've completed Connect onboarding, else falls back to
    // the platform account exactly as before.
    const intent = await stripe.paymentIntents.create({
      amount: invoice.amount_cents as number,
      currency: CURRENCY,
      customer: customerId,
      description: `Invoice ${invoiceId} — ${studio?.name ?? "Studio"}`,
      metadata: {
        invoice_id: invoiceId,
        studio_id: invoice.studio_id as string,
        supabase_user_id: user.id,
      },
      automatic_payment_methods: { enabled: true },
      transfer_data: await resolveTransferData(supabase, invoice.studio_id as string),
    });

    // Persist the intent ID on the invoice
    await supabase
      .from("invoices")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", invoiceId);

    return NextResponse.json({ clientSecret: intent.client_secret });
  } catch (err) {
    console.error("[create-intent]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
