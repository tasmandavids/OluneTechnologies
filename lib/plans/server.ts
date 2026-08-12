// ============================================================================
//  Server-side reads for the plan gate.
//
//  Kept apart from gate.ts so the decision function stays pure and free of
//  Supabase imports — the whole point of that split is that the logic which
//  locks a studio out can be tested exhaustively without a database.
//
//  Deliberately imports nothing from lib/portal: lib/portal/access.ts is what
//  calls this, and a cycle between the two would be a runtime landmine on a
//  path every admin action goes through.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { isPlanKey, isBillingInterval, DEFAULT_PLAN } from "./catalog";
import { planAccessState, type PlanAccess, type StudioSubscription } from "./gate";

type SubscriptionRow = {
  studio_id: string;
  plan_key: string;
  billing_interval: string;
  status: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  comped: boolean;
};

const SUBSCRIPTION_COLUMNS =
  "studio_id, plan_key, billing_interval, status, trial_ends_at, stripe_customer_id, " +
  "stripe_subscription_id, current_period_end, cancel_at_period_end, comped";

const STATUSES = ["trialing", "active", "past_due", "canceled", "comped"] as const;

function toSubscription(row: SubscriptionRow | null): StudioSubscription | null {
  if (!row) return null;
  const status = (STATUSES as readonly string[]).includes(row.status)
    ? (row.status as StudioSubscription["status"])
    : null;
  // An unrecognised status means the database is ahead of this deploy. Treat it
  // as no evidence rather than guessing — planAccessState fails open on null.
  if (!status) return null;

  return {
    studioId: row.studio_id,
    planKey: isPlanKey(row.plan_key) ? row.plan_key : DEFAULT_PLAN,
    billingInterval: isBillingInterval(row.billing_interval) ? row.billing_interval : "month",
    status,
    trialEndsAt: row.trial_ends_at,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    currentPeriodEnd: row.current_period_end,
    cancelAtPeriodEnd: !!row.cancel_at_period_end,
    comped: !!row.comped,
  };
}

/**
 * One studio's subscription row, or null if there isn't one / it can't be read.
 *
 * Callers must not distinguish those two cases: both mean "no evidence to lock
 * on", which is the fail-open contract planAccessState depends on.
 */
export async function loadStudioSubscription(
  supabase: SupabaseClient,
  studioId: string,
): Promise<StudioSubscription | null> {
  const { data, error } = await supabase
    .from("studio_subscriptions")
    .select(SUBSCRIPTION_COLUMNS)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (error) {
    console.warn(`[plans] subscription read failed for ${studioId}:`, error.message);
    return null;
  }
  return toSubscription(data as SubscriptionRow | null);
}

/**
 * Resolve the gate, given the operator status the caller already has in hand.
 * Callers inside the portal have usually loaded the `studios` row anyway.
 */
export function planAccessFor(
  sub: StudioSubscription | null,
  studioStatus: string | null,
): PlanAccess {
  return planAccessState(sub, studioStatus, new Date());
}

/** Both reads plus the decision, for callers holding neither row. */
export async function loadPlanAccessForStudio(
  supabase: SupabaseClient,
  studioId: string,
): Promise<PlanAccess> {
  const [studioRes, sub] = await Promise.all([
    supabase.from("studios").select("status").eq("id", studioId).single(),
    loadStudioSubscription(supabase, studioId),
  ]);
  return planAccessFor(sub, (studioRes.data?.status as string | null) ?? null);
}
