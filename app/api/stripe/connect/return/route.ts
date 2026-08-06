// ============================================================================
//  GET /api/stripe/connect/return
//
//  Stripe sends the admin back here once they finish (or exit) the hosted
//  Express onboarding flow. Re-verify the signed state, re-verify the admin's
//  session/role/studio fresh from the DB, then pull the account's current
//  status straight from Stripe (onboarding can be "complete" from the user's
//  side but still restricted pending verification).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loadStudioStripeAccount, syncStripeAccountStatus } from "@/lib/stripe/connect";
import { verifyStripeConnectState } from "@/lib/stripe/connect-state";
import { verifyAdminOAuthCallback } from "@/lib/oauth/verify-admin-callback";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

const BASE = CONNECTIONS_PATH;

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
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(BASE)}`, req.url));
  }

  const authz = await verifyAdminOAuthCallback(supabase, user, payload);
  if (!authz.ok) {
    return NextResponse.redirect(
      new URL(`${BASE}?error=${encodeURIComponent(authz.reason)}`, req.url),
    );
  }

  const account = await loadStudioStripeAccount(supabase, payload.studioId);
  if (!account) {
    return NextResponse.redirect(new URL(`${BASE}?error=No+Stripe+account+found`, req.url));
  }

  try {
    const updated = await syncStripeAccountStatus(supabase, account.stripe_account_id);
    // Onboarding can return without charges enabled (Stripe still reviewing, or
    // the studio bailed out). The hub's Stripe card shows the live status either
    // way, so only say "connected" when it actually is.
    if (updated?.charges_enabled) {
      return NextResponse.redirect(new URL(`${BASE}?connected=stripe`, req.url));
    }
    return NextResponse.redirect(
      new URL(`${BASE}?error=Stripe+onboarding+isn%27t+finished+yet`, req.url),
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to verify Stripe account";
    return NextResponse.redirect(new URL(`${BASE}?error=${encodeURIComponent(msg)}`, req.url));
  }
}
