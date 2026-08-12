// ============================================================================
//  Plan catalogue — what each Olune tier costs and what it unlocks.
//
//  TS rather than database rows, for the same reason the vertical packs are
//  (lib/verticals/types.ts): ModuleKey stays exhaustively typechecked, client
//  components import it with no round-trip, and a tier gaining a module is a
//  reviewable diff instead of a data migration.
//
//  The database holds only what genuinely varies per environment: the Stripe
//  Price ids, in platform_plan_prices (0119).
//
//  ── The pricing model is a positioning decision
//  Every tier is unlimited students. Jackrabbit prices on student count, so a
//  studio pays more every time it succeeds and says so in its reviews; the
//  competitive read (docs/competitive-plan-2026-08-07.md §3c) makes "we don't
//  charge you for growing" the lead. Tiers gate capability, never headcount.
// ============================================================================

import { MODULE_KEYS } from "@/lib/verticals/modules";
import type { ModuleKey } from "@/lib/verticals/types";

export type PlanKey = "solo" | "studio" | "scale";
export type BillingInterval = "month" | "year";

export const PLAN_KEYS: readonly PlanKey[] = ["solo", "studio", "scale"] as const;

export function isPlanKey(value: unknown): value is PlanKey {
  return typeof value === "string" && (PLAN_KEYS as readonly string[]).includes(value);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "month" || value === "year";
}

/**
 * What one plan sells.
 *
 * `modules` is the full allowed set, not a delta from the tier below —
 * enumerated in full so `planAllows` is a membership test with no inheritance
 * chain to reason about. `assertPlanTiersAreNested` in the tests is what keeps
 * the three sets actually nested.
 */
export type Plan = {
  key: PlanKey;
  /** Monthly price in cents, GST-inclusive (NZ retail convention). */
  monthlyCents: number;
  /** Annual price in cents. Two months free against the monthly rate. */
  annualCents: number;
  modules: readonly ModuleKey[];
};

/** Solo — one person, teaching and invoicing. The essentials, nothing else. */
const SOLO_MODULES: readonly ModuleKey[] = [
  "classes",
  "attendance",
  "billing",
  "messaging",
] as const;

/**
 * Studio — a team. Everything Solo has, plus the surfaces that only matter once
 * more than one person is involved (staff, availability, substitutes) or once
 * you're marketing to people who aren't enrolled yet (leads, forms, site).
 */
const STUDIO_MODULES: readonly ModuleKey[] = [
  ...SOLO_MODULES,
  "leads",
  "forms",
  "staff",
  "availability",
  "substitutes",
  "site",
  "shop",
  "passes",
] as const;

/** Scale — every module Olune has, including whatever a vertical pack adds. */
const SCALE_MODULES: readonly ModuleKey[] = MODULE_KEYS;

export const PLANS: Record<PlanKey, Plan> = {
  solo: {
    key: "solo",
    monthlyCents: 2900,
    annualCents: 29000,
    modules: SOLO_MODULES,
  },
  studio: {
    key: "studio",
    monthlyCents: 5900,
    annualCents: 59000,
    modules: STUDIO_MODULES,
  },
  scale: {
    key: "scale",
    monthlyCents: 12000,
    annualCents: 120000,
    modules: SCALE_MODULES,
  },
};

/** Display order — cheapest first, which is the order the pricing cards use. */
export const PLAN_ORDER: readonly PlanKey[] = ["solo", "studio", "scale"] as const;

/** The tier the pricing page badges as "most popular", and the trial default. */
export const DEFAULT_PLAN: PlanKey = "studio";

export function getPlan(key: string | null | undefined): Plan {
  return isPlanKey(key) ? PLANS[key] : PLANS[DEFAULT_PLAN];
}

export function planAmountCents(plan: Plan, interval: BillingInterval): number {
  return interval === "year" ? plan.annualCents : plan.monthlyCents;
}

/**
 * Does this plan include this module?
 *
 * A null plan allows everything. That is the fail-open case and it is
 * deliberate: `Entitlements.plan` is null whenever we could not resolve a
 * subscription row, and a database hiccup must not silently strip a paying
 * studio's features. Locking is the gate's job (lib/plans/gate.ts), and the
 * gate has its own fail-open rule for the same reason.
 */
export function planAllows(plan: PlanKey | null, moduleKey: ModuleKey): boolean {
  if (plan === null) return true;
  if (!isPlanKey(plan)) return true;
  return PLANS[plan].modules.includes(moduleKey);
}

/** Modules a studio would lose by moving from `from` down to `to`. */
export function modulesLostDowngrading(from: PlanKey, to: PlanKey): ModuleKey[] {
  const target = new Set(PLANS[to].modules);
  return PLANS[from].modules.filter((m) => !target.has(m));
}
