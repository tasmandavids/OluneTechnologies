// ============================================================================
//  /platform/plans — Stripe Price ids per plan and interval.
//
//  Exists because Stripe issues different Price ids in test mode and live mode
//  for the same plan, so they cannot be a constant in the repo, and six env
//  vars for three plans × two intervals would be worse than a table. Until
//  these rows are filled in for an environment, /api/plans/checkout returns 503
//  rather than guessing — charging the wrong amount is worse than an error.
//
//  What each plan COSTS and what it UNLOCKS is not editable here: that lives in
//  lib/plans/catalog.ts, typechecked against ModuleKey. This page only records
//  which Stripe Price corresponds to it.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { PlanPricesForm } from "@/components/platform/PlanPricesForm";
import { PLAN_ORDER, PLANS } from "@/lib/plans/catalog";

export default async function PlatformPlansPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("platform_plan_prices")
    .select("plan_key, billing_interval, stripe_price_id, active");

  const rows = (data ?? []).map((r) => ({
    planKey: r.plan_key as string,
    interval: r.billing_interval as "month" | "year",
    stripePriceId: r.stripe_price_id as string,
    active: r.active === true,
  }));

  return (
    <PlanPricesForm
      rows={rows}
      plans={PLAN_ORDER.map((key) => ({
        key,
        monthlyCents: PLANS[key].monthlyCents,
        annualCents: PLANS[key].annualCents,
        moduleCount: PLANS[key].modules.length,
      }))}
    />
  );
}
