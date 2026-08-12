// ============================================================================
//  POST /api/plans/portal
//
//  Stripe Customer Portal for the studio's own Olune subscription — card
//  updates, invoice history, cancellation, plan changes with Stripe's own
//  proration. Returns { url }.
//
//  Using the hosted portal rather than building those flows is the whole
//  reason upgrade/downgrade and dunning UI are out of scope for this pass:
//  Stripe already does them, correctly, including the tax and proration edge
//  cases we would otherwise get wrong.
//
//  Reachable by a locked studio, for the same reason as the checkout route —
//  a past_due studio fixes its card from here.
// ============================================================================

import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminStudioForBilling } from "@/lib/portal/access";
import { originForHost } from "@/lib/seo";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { createPlanBillingPortalSession } from "@/lib/plans/stripe";

export const runtime = "nodejs";

export async function POST() {
  const access = await getAdminStudioForBilling();
  if (access.error || !access.studioId || !access.userId) {
    return NextResponse.json({ error: access.error ?? "Not authorized" }, { status: 403 });
  }

  if (!checkRateLimit(rateLimitKey("plan-portal", access.userId), { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("studio_subscriptions")
      .select("stripe_customer_id")
      .eq("studio_id", access.studioId)
      .maybeSingle();

    const customerId = data?.stripe_customer_id as string | null | undefined;
    if (!customerId) {
      // No Customer means they have never been through Checkout — there is
      // nothing to manage. Deliberately NOT created here: an empty portal is a
      // worse answer than "subscribe first".
      return NextResponse.json(
        { error: "No billing account yet. Choose a plan first." },
        { status: 409 },
      );
    }

    const origin = originForHost((await headers()).get("host"));
    const session = await createPlanBillingPortalSession({ customerId, origin });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[plan-portal]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
