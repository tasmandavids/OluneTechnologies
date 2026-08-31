"use server";

import { revalidatePath } from "next/cache";
import { getAdminStudio } from "@/lib/portal/access";
import { stripe } from "@/lib/stripe";
import { loadStudioStripeAccount, syncStripeAccountStatus } from "@/lib/stripe/connect";

export type ActionResult = { ok: true } | { ok: false; error: string };

/** Re-pull charges_enabled/payouts_enabled/disabled_reason from Stripe. */
export async function refreshStripeConnectStatus(): Promise<ActionResult> {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId) return { ok: false, error: ctx.error ?? "Not authorized" };

  const account = await loadStudioStripeAccount(ctx.supabase, ctx.studioId);
  if (!account) return { ok: false, error: "Stripe is not connected for this studio" };

  try {
    await syncStripeAccountStatus(ctx.supabase, account.stripe_account_id);
    revalidatePath("/portal/admin/money");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Refresh failed" };
  }
}

/** One-time login link into the studio's own Express dashboard. */
/**
 * Where a studio admin goes to see their own Stripe account.
 *
 * Not an Express login link any more. `accounts.createLoginLink` only works for
 * accounts Olune hosts a dashboard for (`dashboard: "express"` or `"none"`);
 * studio accounts are created with `dashboard: "full"`, which means the studio
 * holds its own Stripe login and its own relationship with Stripe. That is the
 * point of the merchant-of-record arrangement — there is no session for us to
 * mint on their behalf, and asking Stripe for one returns an error.
 *
 * Kept async and result-shaped rather than collapsed to a constant so the
 * caller keeps its existing error handling, and so this can go back to minting
 * a real link if the account model ever changes.
 */
export async function getStripeDashboardLink(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId) return { ok: false, error: ctx.error ?? "Not authorized" };

  const account = await loadStudioStripeAccount(ctx.supabase, ctx.studioId);
  if (!account) return { ok: false, error: "Stripe is not connected for this studio" };

  return { ok: true, url: "https://dashboard.stripe.com/" };
}
