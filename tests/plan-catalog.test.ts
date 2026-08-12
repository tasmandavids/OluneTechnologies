import { describe, it, expect } from "vitest";
import {
  PLANS,
  PLAN_ORDER,
  PLAN_KEYS,
  DEFAULT_PLAN,
  getPlan,
  isPlanKey,
  planAllows,
  planAmountCents,
  modulesLostDowngrading,
} from "@/lib/plans/catalog";
import { MODULE_KEYS } from "@/lib/verticals/modules";

describe("plan catalogue shape", () => {
  it("prices every plan on both intervals", () => {
    for (const key of PLAN_KEYS) {
      expect(planAmountCents(PLANS[key], "month")).toBeGreaterThan(0);
      expect(planAmountCents(PLANS[key], "year")).toBeGreaterThan(0);
    }
  });

  it("prices annual below twelve months of monthly", () => {
    // "Two months free" is the marketing claim. If a tier ever prices annual at
    // or above 12× monthly, the pricing page is lying to people.
    for (const key of PLAN_KEYS) {
      const plan = PLANS[key];
      expect(plan.annualCents).toBeLessThan(plan.monthlyCents * 12);
      expect(plan.annualCents).toBe(plan.monthlyCents * 10);
    }
  });

  it("orders tiers cheapest first", () => {
    const prices = PLAN_ORDER.map((k) => PLANS[k].monthlyCents);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);
  });

  it("badges a real tier as the default", () => {
    expect(isPlanKey(DEFAULT_PLAN)).toBe(true);
    expect(PLAN_ORDER).toContain(DEFAULT_PLAN);
  });
});

describe("tier module sets", () => {
  it("nests each tier inside the one above it", () => {
    // Enumerated in full rather than as deltas, so this is what actually keeps
    // them nested — without it, a module could be added to `solo` and silently
    // not exist on `studio`, and paying more would take a feature away.
    for (let i = 1; i < PLAN_ORDER.length; i++) {
      const lower = new Set(PLANS[PLAN_ORDER[i - 1]].modules);
      const higher = new Set(PLANS[PLAN_ORDER[i]].modules);
      for (const key of lower) {
        expect(higher.has(key)).toBe(true);
      }
    }
  });

  it("sells every module Olune has on the top tier", () => {
    const top = new Set(PLANS[PLAN_ORDER[PLAN_ORDER.length - 1]].modules);
    for (const key of MODULE_KEYS) {
      expect(top.has(key)).toBe(true);
    }
  });

  it("has no duplicate entries in any tier", () => {
    for (const key of PLAN_KEYS) {
      const modules = PLANS[key].modules;
      expect(new Set(modules).size).toBe(modules.length);
    }
  });

  it("reports what a downgrade would cost", () => {
    const lost = modulesLostDowngrading("scale", "solo");
    expect(lost).toContain("site");
    expect(lost).not.toContain("classes");
    expect(modulesLostDowngrading("solo", "scale")).toEqual([]);
  });
});

describe("planAllows", () => {
  it("gates a module the tier does not include", () => {
    expect(planAllows("solo", "classes")).toBe(true);
    expect(planAllows("solo", "site")).toBe(false);
    expect(planAllows("studio", "site")).toBe(true);
  });

  it("allows everything when the plan is unresolved", () => {
    // Fail open. A null plan means the mirror column was unreadable or held a
    // value this deploy doesn't know — neither is grounds for stripping a
    // paying studio's features.
    for (const key of MODULE_KEYS) {
      expect(planAllows(null, key)).toBe(true);
      expect(planAllows("enterprise" as never, key)).toBe(true);
    }
  });
});

describe("getPlan", () => {
  it("falls back to the default rather than throwing", () => {
    expect(getPlan(null).key).toBe(DEFAULT_PLAN);
    expect(getPlan("nonsense").key).toBe(DEFAULT_PLAN);
    expect(getPlan("solo").key).toBe("solo");
  });
});
