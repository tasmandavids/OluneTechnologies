// ============================================================================
//  GET /api/stripe/connect
//
//  Starts (or resumes) Stripe Express onboarding for the signed-in admin's
//  studio, then redirects to Stripe's hosted onboarding flow.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getAdminStudio } from "@/lib/portal/access";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import { loadStudioStripeAccount } from "@/lib/stripe/connect";
import { signStripeConnectState } from "@/lib/stripe/connect-state";
import { resolveAppOriginFromHeaders } from "@/lib/xero/app-origin";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId || !ctx.userId) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent("/portal/admin/money?tab=payouts")}`, req.url),
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.redirect(
      new URL("/portal/admin/money?tab=payouts&error=Stripe+is+not+configured", req.url),
    );
  }

  try {
    const origin = await resolveAppOriginFromHeaders();
    const state = signStripeConnectState({
      studioId: ctx.studioId,
      userId: ctx.userId,
      exp: Date.now() + 10 * 60 * 1000,
    });

    let account = await loadStudioStripeAccount(ctx.supabase, ctx.studioId);
    if (!account) {
      const { data: profile } = await ctx.supabase
        .from("profiles")
        .select("email")
        .eq("id", ctx.userId)
        .single();

      const stripeAccount = await stripe.accounts.create({
        type: "express",
        country: "NZ",
        email: (profile?.email as string | null) ?? undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      const { data: inserted, error: insertErr } = await ctx.supabase
        .from("stripe_connect_accounts")
        .insert({
          studio_id: ctx.studioId,
          stripe_account_id: stripeAccount.id,
          connected_by: ctx.userId,
          onboarding_started_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (insertErr) throw new Error(insertErr.message);
      account = inserted;
    }

    if (!account) throw new Error("Could not create Stripe account");

    const accountLink = await stripe.accountLinks.create({
      account: account.stripe_account_id,
      refresh_url: `${origin}/api/stripe/connect/refresh?state=${encodeURIComponent(state)}`,
      return_url: `${origin}/api/stripe/connect/return?state=${encodeURIComponent(state)}`,
      type: "account_onboarding",
    });

    return NextResponse.redirect(accountLink.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start Stripe onboarding";
    return NextResponse.redirect(
      new URL(`/portal/admin/money?tab=payouts&error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
