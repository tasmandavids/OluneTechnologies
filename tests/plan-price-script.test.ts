// ============================================================================
//  scripts/setup-plan-prices.mjs carries its own copy of the plan prices,
//  because it is plain ESM run by node and cannot import the TypeScript
//  catalogue. That copy is what actually reaches Stripe.
//
//  A Stripe Price is immutable once created and is what a studio's card gets
//  charged against, so a drift between the two tables does not surface as a
//  wrong number on a page — it surfaces as a studio being billed an amount
//  nobody currently intends, with no way to edit it after the fact. This test
//  is the reason the duplication is allowed to exist.
// ============================================================================

import { describe, it, expect } from "vitest";
import { PLANS, PLAN_KEYS, type PlanKey } from "@/lib/plans/catalog";
import { CURRENCY } from "@/lib/currency";
import { PLAN_PRICING, CURRENCY as SCRIPT_CURRENCY, lookupKey } from "../scripts/setup-plan-prices.mjs";

type ScriptPlan = {
  key: PlanKey;
  name: string;
  description: string;
  monthlyCents: number;
  annualCents: number;
};

const scriptPlans = PLAN_PRICING as ScriptPlan[];

describe("setup-plan-prices.mjs agrees with the plan catalogue", () => {
  it("covers every plan, and invents none", () => {
    expect(scriptPlans.map((p) => p.key).sort()).toEqual([...PLAN_KEYS].sort());
  });

  it.each(PLAN_KEYS)("charges the catalogue price for %s", (key) => {
    const script = scriptPlans.find((p) => p.key === key);
    expect(script, `no entry for ${key} in setup-plan-prices.mjs`).toBeDefined();

    expect(script!.monthlyCents).toBe(PLANS[key].monthlyCents);
    expect(script!.annualCents).toBe(PLANS[key].annualCents);
  });

  it("bills annually at ten months, the way /pricing advertises it", () => {
    // The pricing page promises "two months free" on every tier. If a monthly
    // price moves and the annual one doesn't, that promise silently becomes a
    // lie on a public page — and in Stripe, on a real invoice.
    for (const plan of scriptPlans) {
      expect(plan.annualCents, `${plan.key}: annual is not 10× monthly`).toBe(plan.monthlyCents * 10);
    }
  });

  it("prices in the same currency the rest of the app charges in", () => {
    expect(SCRIPT_CURRENCY).toBe(CURRENCY);
  });

  it("builds a distinct, stable lookup key per plan and interval", () => {
    const keys = PLAN_KEYS.flatMap((k) => ["month", "year"].map((i) => lookupKey(k, i)));

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("olune_solo_month");
    expect(keys).toContain("olune_scale_year");
  });

  it("gives every plan a name and description for the Stripe dashboard", () => {
    for (const plan of scriptPlans) {
      expect(plan.name.length, `${plan.key} has no name`).toBeGreaterThan(0);
      expect(plan.description.length, `${plan.key} has no description`).toBeGreaterThan(0);
    }
  });
});
