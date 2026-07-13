import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";

/** Structurally compatible with both PaymentIntent and Subscription transfer_data. */
export type TransferData = { destination: string };

export type StripeConnectAccountRow = {
  id: string;
  studio_id: string;
  stripe_account_id: string;
  charges_enabled: boolean;
  payouts_enabled: boolean;
  details_submitted: boolean;
  disabled_reason: string | null;
  connected_by: string | null;
  onboarding_started_at: string | null;
  onboarding_completed_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Studio's Connect account row, or null if they've never started onboarding. */
export async function loadStudioStripeAccount(
  supabase: SupabaseClient,
  studioId: string,
): Promise<StripeConnectAccountRow | null> {
  const { data } = await supabase
    .from("stripe_connect_accounts")
    .select("*")
    .eq("studio_id", studioId)
    .maybeSingle();
  return (data as StripeConnectAccountRow | null) ?? null;
}

export function isChargeable(row: StripeConnectAccountRow | null): boolean {
  return row?.charges_enabled === true;
}

/**
 * Destination-charge transfer target for a studio, or undefined when the
 * studio has no chargeable connected account yet — in which case callers
 * fall back to the platform account exactly as before Connect existed.
 * This is what makes the migration incremental: every charge-creation site
 * stays correct whether or not the studio has onboarded.
 */
export async function resolveTransferData(
  supabase: SupabaseClient,
  studioId: string,
): Promise<TransferData | undefined> {
  const account = await loadStudioStripeAccount(supabase, studioId);
  if (!isChargeable(account)) return undefined;
  return { destination: account!.stripe_account_id };
}

/** Snapshot an Express account's status into stripe_connect_accounts. */
export async function syncStripeAccountStatus(
  supabase: SupabaseClient,
  stripeAccountId: string,
): Promise<StripeConnectAccountRow | null> {
  const { data: existing } = await supabase
    .from("stripe_connect_accounts")
    .select("onboarding_completed_at")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();

  const account = await stripe.accounts.retrieve(stripeAccountId);
  const disabledReason = account.requirements?.disabled_reason ?? null;
  const now = new Date().toISOString();
  const justCompleted =
    !existing?.onboarding_completed_at && account.details_submitted && account.charges_enabled;

  const { data } = await supabase
    .from("stripe_connect_accounts")
    .update({
      charges_enabled: account.charges_enabled ?? false,
      payouts_enabled: account.payouts_enabled ?? false,
      details_submitted: account.details_submitted ?? false,
      disabled_reason: disabledReason,
      last_synced_at: now,
      updated_at: now,
      ...(justCompleted ? { onboarding_completed_at: now } : {}),
    })
    .eq("stripe_account_id", stripeAccountId)
    .select("*")
    .maybeSingle();

  return (data as StripeConnectAccountRow | null) ?? null;
}
