// ============================================================================
//  GET /api/stripe/connect
//
//  Starts (or resumes) Stripe onboarding for the signed-in admin's studio,
//  then redirects to Stripe's hosted onboarding flow.
//
//  Accounts v2. The studio is the merchant of record — see lib/stripe/connect.ts
//  for why, and for what that obliges every charge site to pass.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getAdminStudio } from "@/lib/portal/access";
import { stripe, isStripeConfigured } from "@/lib/stripe";
import {
  loadStudioStripeAccount,
  STUDIO_ACCOUNT_CONFIGURATIONS,
  STUDIO_ACCOUNT_DEFAULTS,
} from "@/lib/stripe/connect";
import { signStripeConnectState } from "@/lib/stripe/connect-state";
import { resolveAppOriginFromHeaders } from "@/lib/xero/app-origin";
import { CONNECTIONS_PATH } from "@/lib/integrations/routes";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId || !ctx.userId) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent(CONNECTIONS_PATH)}`, req.url),
    );
  }

  if (!isStripeConfigured()) {
    return NextResponse.redirect(
      new URL(`${CONNECTIONS_PATH}?error=Stripe+is+not+configured`, req.url),
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

      const { data: studio } = await ctx.supabase
        .from("studios")
        .select("name")
        .eq("id", ctx.studioId)
        .maybeSingle();

      // display_name is what a parent sees on their card statement and on
      // Stripe's own emails, so it is the studio's name rather than Olune's.
      const stripeAccount = await stripe.v2.core.accounts.create({
        display_name: (studio?.name as string | null) ?? undefined,
        contact_email: (profile?.email as string | null) ?? undefined,
        identity: { country: "NZ" },
        dashboard: "full",
        defaults: STUDIO_ACCOUNT_DEFAULTS,
        configuration: {
          merchant: { capabilities: { card_payments: { requested: true } } },
        },
        metadata: { olune_studio_id: ctx.studioId },
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

    const accountLink = await stripe.v2.core.accountLinks.create({
      account: account.stripe_account_id,
      use_case: {
        type: "account_onboarding",
        account_onboarding: {
          configurations: [...STUDIO_ACCOUNT_CONFIGURATIONS],
          refresh_url: `${origin}/api/stripe/connect/refresh?state=${encodeURIComponent(state)}`,
          return_url: `${origin}/api/stripe/connect/return?state=${encodeURIComponent(state)}`,
        },
      },
    });

    return NextResponse.redirect(accountLink.url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start Stripe onboarding";
    return NextResponse.redirect(
      new URL(`${CONNECTIONS_PATH}?error=${encodeURIComponent(msg)}`, req.url),
    );
  }
}
