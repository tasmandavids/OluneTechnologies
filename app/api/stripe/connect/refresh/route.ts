// ============================================================================
//  GET /api/stripe/connect/refresh
//
//  Stripe Account Links expire after a few minutes. If an admin's onboarding
//  session lapses, Stripe sends them back here to mint a fresh link for the
//  same (already-created) Express account.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { loadStudioStripeAccount } from "@/lib/stripe/connect";
import { signStripeConnectState, verifyStripeConnectState } from "@/lib/stripe/connect-state";
import { verifyAdminOAuthCallback } from "@/lib/oauth/verify-admin-callback";
import { resolveAppOriginFromHeaders } from "@/lib/xero/app-origin";

export const runtime = "nodejs";

const BASE = "/portal/admin/payments";

export async function GET(req: NextRequest) {
  const stateParam = req.nextUrl.searchParams.get("state");
  if (!stateParam) {
    return NextResponse.redirect(new URL(`${BASE}?error=Missing+state`, req.url));
  }

  const payload = verifyStripeConnectState(stateParam);
  if (!payload) {
    return NextResponse.redirect(new URL(`${BASE}?error=Invalid+or+expired+link`, req.url));
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== payload.userId) {
    return NextResponse.redirect(new URL(`/login?next=${BASE}`, req.url));
  }

  const authz = await verifyAdminOAuthCallback(supabase, user, payload);
  if (!authz.ok) {
    return NextResponse.redirect(
      new URL(`${BASE}?error=${encodeURIComponent(authz.reason)}`, req.url),
    );
  }

  const account = await loadStudioStripeAccount(supabase, payload.studioId);
  if (!account) {
    return NextResponse.redirect(new URL(`${BASE}?error=No+Stripe+account+to+resume`, req.url));
  }

  try {
    const origin = await resolveAppOriginFromHeaders();
    const state = signStripeConnectState({
      studioId: payload.studioId,
      userId: user.id,
      exp: Date.now() + 10 * 60 * 1000,
    });

    const accountLink = await stripe.accountLinks.create({
      account: account.stripe_account_id,
      refresh_url: `${origin}/api/stripe/connect/refresh?state=${encodeURIComponent(state)}`,
      return_url: `${origin}/api/stripe/connect/return?state=${encodeURIComponent(state)}`,
      type: "account_onboarding",
    });

    return NextResponse.redirect(accountLink.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to resume Stripe onboarding";
    return NextResponse.redirect(new URL(`${BASE}?error=${encodeURIComponent(msg)}`, req.url));
  }
}
