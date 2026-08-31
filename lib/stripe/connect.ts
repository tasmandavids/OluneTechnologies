// ============================================================================
//  Stripe Connect — studio accounts, on Accounts v2.
//
//  Stripe refuses Accounts v1 for new Connect integrations ("Stripe no longer
//  recommends Accounts v1… create connected accounts with POST
//  /v2/core/accounts"), so onboarding is built on v2 throughout.
//
//  ── The studio is the merchant of record
//  Accounts v2 makes this an explicit, creation-time decision that cannot be
//  changed later without re-onboarding, so it is worth stating plainly:
//
//    configuration.merchant + on_behalf_of  → the STUDIO is merchant of record.
//      It carries its own chargebacks, refunds and negative balances. Stripe's
//      fees come out of its own balance (fees_collector: "stripe").
//
//    configuration.recipient (no on_behalf_of) → OLUNE is merchant of record
//      and eats disputes for classes it does not run. Stripe will not allow
//      losses_collector: "stripe" in that mode — it is rejected at create time.
//
//  We use merchant. The cost is a heavier onboarding — roughly 50 requirement
//  entries rather than 9, i.e. the same verification a studio would face
//  signing up to Stripe directly — and it is why every charge site must pass
//  `on_behalf_of`. A destination charge WITHOUT it leaves Olune as merchant of
//  record no matter how the account is configured, which would quietly undo
//  the whole arrangement. resolveDestinationCharge() returns both halves
//  together so a call site cannot take one and forget the other.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";

/** Structurally compatible with both PaymentIntent and Subscription transfer_data. */
export type TransferData = { destination: string };

/**
 * The Connect half of a charge, ready to spread into a PaymentIntent or
 * Subscription create call. Empty when the studio has not onboarded yet, so
 * the charge falls back to the platform account exactly as before Connect
 * existed — that is what keeps the rollout incremental.
 */
export type DestinationCharge =
  | { transfer_data: TransferData; on_behalf_of: string }
  | Record<string, never>;

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

/**
 * What we ask Stripe for when creating a studio account, and what the hosted
 * onboarding flow must therefore collect. Shared by the create route and both
 * account-link routes so a resumed onboarding cannot ask for a different set
 * of things than the one that was started.
 */
export const STUDIO_ACCOUNT_CONFIGURATIONS = ["merchant"] as const;

export const STUDIO_ACCOUNT_DEFAULTS = {
  responsibilities: {
    // Both "stripe" — the studio's own account settles Stripe's fees and
    // absorbs losses. See the header note; this is the whole point.
    fees_collector: "stripe",
    losses_collector: "stripe",
  },
  currency: "nzd",
} as const;

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

export type StripeBalanceSummary = {
  availableCents: number;
  pendingCents: number;
  currency: string;
};

/**
 * Available + pending balance sitting on the studio's own connected account.
 *
 * Still the v1 Balance endpoint with a Stripe-Account header: v2 changed how
 * accounts are CREATED and configured, not how you read the balance of one.
 */
export async function loadStripeBalance(stripeAccountId: string): Promise<StripeBalanceSummary> {
  const balance = await stripe.balance.retrieve({}, { stripeAccount: stripeAccountId });
  const available = balance.available[0];
  const pending = balance.pending[0];
  return {
    availableCents: available?.amount ?? 0,
    pendingCents: pending?.amount ?? 0,
    currency: (available?.currency ?? pending?.currency ?? "nzd").toUpperCase(),
  };
}

export type StripePayoutRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  arrivalDate: string;
  createdAt: string;
  method: string;
};

/** Recent payouts to the studio's own bank account, most recent first. */
export async function listStripePayouts(
  stripeAccountId: string,
  limit = 20,
): Promise<StripePayoutRow[]> {
  const res = await stripe.payouts.list({ limit }, { stripeAccount: stripeAccountId });
  return res.data.map((p) => ({
    id: p.id,
    amountCents: p.amount,
    currency: p.currency.toUpperCase(),
    status: p.status,
    arrivalDate: new Date(p.arrival_date * 1000).toISOString(),
    createdAt: new Date(p.created * 1000).toISOString(),
    method: p.method,
  }));
}

export function isChargeable(row: StripeConnectAccountRow | null): boolean {
  return row?.charges_enabled === true;
}

/**
 * The Connect half of a charge for a studio, or `{}` when it has no chargeable
 * account yet.
 *
 * Returns transfer_data AND on_behalf_of together, deliberately. They are two
 * separate top-level parameters on the Stripe call, and passing only the first
 * produces a charge that works, settles to the studio, and still leaves Olune
 * as merchant of record — a silent failure with real liability attached. Spread
 * the whole result:
 *
 *   ...(await resolveDestinationCharge(supabase, studioId)),
 */
export async function resolveDestinationCharge(
  supabase: SupabaseClient,
  studioId: string,
): Promise<DestinationCharge> {
  const account = await loadStudioStripeAccount(supabase, studioId);
  if (!isChargeable(account)) return {};
  return {
    transfer_data: { destination: account!.stripe_account_id },
    on_behalf_of: account!.stripe_account_id,
  };
}

/**
 * v2 has no single `charges_enabled` / `details_submitted` boolean the way v1
 * did — status lives per capability, and outstanding work lives in
 * `requirements.entries`. These map that back onto the columns 0090 already
 * has, so the table and every reader of it stay unchanged.
 */
type V2Account = Stripe.V2.Core.Account;

export function chargesEnabledFrom(account: V2Account): boolean {
  return account.configuration?.merchant?.capabilities?.card_payments?.status === "active";
}

export function payoutsEnabledFrom(account: V2Account): boolean {
  return (
    account.configuration?.merchant?.capabilities?.stripe_balance?.payouts?.status === "active"
  );
}

/**
 * v1's `details_submitted` meant "the account holder has finished the form".
 * The v2 equivalent is that nothing is still waiting on them — Stripe can
 * still be reviewing, which is why this checks who the action sits with rather
 * than whether the list is empty.
 */
export function detailsSubmittedFrom(account: V2Account): boolean {
  const entries = account.requirements?.entries ?? [];
  return !entries.some((e) => e.awaiting_action_from === "user");
}

/**
 * A short reason a studio cannot take payments yet, or null when it can.
 * Taken from the capability's own status_details so the message reflects what
 * Stripe is actually blocking on.
 */
export function disabledReasonFrom(account: V2Account): string | null {
  const card = account.configuration?.merchant?.capabilities?.card_payments;
  if (!card || card.status === "active") return null;
  const code = card.status_details?.[0]?.code;
  return code ? `${card.status}: ${code}` : card.status;
}

/** Snapshot a studio's v2 account status into stripe_connect_accounts. */
export async function syncStripeAccountStatus(
  supabase: SupabaseClient,
  stripeAccountId: string,
): Promise<StripeConnectAccountRow | null> {
  const { data: existing } = await supabase
    .from("stripe_connect_accounts")
    .select("onboarding_completed_at")
    .eq("stripe_account_id", stripeAccountId)
    .maybeSingle();

  const account = await stripe.v2.core.accounts.retrieve(stripeAccountId, {
    include: ["configuration.merchant", "requirements"],
  });

  const chargesEnabled = chargesEnabledFrom(account);
  const detailsSubmitted = detailsSubmittedFrom(account);
  const now = new Date().toISOString();
  const justCompleted = !existing?.onboarding_completed_at && detailsSubmitted && chargesEnabled;

  const { data } = await supabase
    .from("stripe_connect_accounts")
    .update({
      charges_enabled: chargesEnabled,
      payouts_enabled: payoutsEnabledFrom(account),
      details_submitted: detailsSubmitted,
      disabled_reason: disabledReasonFrom(account),
      last_synced_at: now,
      updated_at: now,
      ...(justCompleted ? { onboarding_completed_at: now } : {}),
    })
    .eq("stripe_account_id", stripeAccountId)
    .select("*")
    .maybeSingle();

  return (data as StripeConnectAccountRow | null) ?? null;
}
