// ============================================================================
//  POST /api/payments/billing-portal
//
//  Creates a Stripe Customer Portal session so parents can manage saved cards
//  and view Stripe-hosted receipts. Returns { url } for redirect.
// ============================================================================

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { originForHost } from "@/lib/seo";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    // Each call mints a Stripe billing-portal session. Cheap for a user to
    // spam, not free for us to serve.
    if (!(await checkRateLimit(rateLimitKey("billing-portal", user.id), { limit: 10, windowMs: 60_000 }))) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("studio_id")
      .eq("id", user.id)
      .single();

    if (!profile?.studio_id) {
      return NextResponse.json({ error: "No studio found" }, { status: 400 });
    }

    const customerId = await getOrCreateStripeCustomer(
      supabase,
      user.id,
      profile.studio_id as string,
    );

    // Return the parent to the same host they started on (their studio
    // subdomain / custom domain), not the canonical www apex — auth cookies are
    // host-scoped, so bouncing to www would land them logged out.
    const host = (await headers()).get("host");
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${originForHost(host)}/portal/parent/billing`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[billing-portal]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
