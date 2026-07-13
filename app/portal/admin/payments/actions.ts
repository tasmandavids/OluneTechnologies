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
    revalidatePath("/portal/admin/payments");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Refresh failed" };
  }
}

/** One-time login link into the studio's own Express dashboard. */
export async function getStripeExpressLoginLink(): Promise<
  { ok: true; url: string } | { ok: false; error: string }
> {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId) return { ok: false, error: ctx.error ?? "Not authorized" };

  const account = await loadStudioStripeAccount(ctx.supabase, ctx.studioId);
  if (!account) return { ok: false, error: "Stripe is not connected for this studio" };

  try {
    const link = await stripe.accounts.createLoginLink(account.stripe_account_id);
    return { ok: true, url: link.url };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not open the Stripe dashboard",
    };
  }
}
