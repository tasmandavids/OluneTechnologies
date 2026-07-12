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

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, stripe_customer_id")
      .eq("id", user.id)
      .single();

    let customerId = profile?.stripe_customer_id as string | undefined;

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: (profile?.full_name as string | null) ?? undefined,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;

      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

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
