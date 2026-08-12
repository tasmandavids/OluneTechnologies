// ============================================================================
//  POST /api/plans/checkout
//
//  Starts a Stripe Checkout Session for the studio's own Olune subscription.
//  Returns { url } for the client to redirect to.
//
//  Deliberately reachable by a LOCKED studio — getAdminStudioForBilling()
//  bypasses the paywall, because the one screen that fixes a lapsed
//  subscription cannot be behind the lock it fixes.
//
//  Requires env: STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY
//  Requires data: platform_plan_prices rows for this environment (0119)
// ============================================================================

import { headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminStudioForBilling } from "@/lib/portal/access";
import { originForHost } from "@/lib/seo";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { isBillingInterval, isPlanKey } from "@/lib/plans/catalog";
import { createPlanCheckoutSession, resolvePriceId } from "@/lib/plans/stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const access = await getAdminStudioForBilling();
  if (access.error || !access.studioId || !access.userId) {
    return NextResponse.json({ error: access.error ?? "Not authorized" }, { status: 403 });
  }

  // Each attempt creates a Stripe Customer on first use and a Session every
  // time. Cheap to call, not free to Stripe.
  if (!checkRateLimit(rateLimitKey("plan-checkout", access.userId), { limit: 8, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many attempts. Try again shortly." }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { plan, interval } = (body ?? {}) as { plan?: unknown; interval?: unknown };
  if (!isPlanKey(plan)) {
    return NextResponse.json({ error: "Unknown plan" }, { status: 400 });
  }
  if (!isBillingInterval(interval)) {
    return NextResponse.json({ error: "Unknown billing interval" }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const priceId = await resolvePriceId(admin, plan, interval);

    if (!priceId) {
      // An operator has not filled platform_plan_prices in for this
      // environment. Failing loudly beats falling back to another plan's
      // price and charging the wrong amount.
      console.error(`[plan-checkout] no Stripe price configured for ${plan}/${interval}`);
      return NextResponse.json(
        { error: "This plan isn't available yet. Please contact support." },
        { status: 503 },
      );
    }

    const origin = originForHost((await headers()).get("host"));
    const session = await createPlanCheckoutSession({
      admin,
      studioId: access.studioId,
      planKey: plan,
      interval,
      priceId,
      origin,
    });

    if (!session.url) {
      return NextResponse.json({ error: "Stripe returned no checkout URL" }, { status: 502 });
    }
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("[plan-checkout]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 },
    );
  }
}
