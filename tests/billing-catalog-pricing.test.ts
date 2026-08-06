import { describe, expect, it } from "vitest";
import {
  applyUnitRules,
  defaultUnitLabel,
  expandPackage,
  hoursBetween,
  priceProductLine,
  resolveTierPrice,
} from "@/lib/billing/pricing";
import type { BillingProduct } from "@/lib/billing/types";

function product(overrides: Partial<BillingProduct> = {}): BillingProduct {
  return {
    id: "p1",
    studioId: "s1",
    name: "Private lesson",
    code: "PRIVATE-HR",
    description: null,
    category: "tuition",
    pricingModel: "hourly",
    unitAmountCents: 6000,
    unitLabel: "hour",
    minUnits: 1,
    incrementUnits: 0.25,
    creditCount: null,
    creditExpiryDays: null,
    recurringInterval: null,
    recurringIntervalCount: 1,
    termId: null,
    taxTreatment: "standard",
    taxRateBp: 1500,
    accountCode: "200",
    itemCode: null,
    active: true,
    sortOrder: 0,
    tiers: [],
    components: [],
    ledgerCodes: [],
    ...overrides,
  };
}

describe("applyUnitRules", () => {
  it("bills the minimum for a short lesson", () => {
    expect(applyUnitRules(0.4, { minUnits: 1, incrementUnits: 0.25 })).toBe(1);
  });

  it("rounds up to the next increment, never down", () => {
    expect(applyUnitRules(1.6, { minUnits: 1, incrementUnits: 0.25 })).toBe(1.75);
    expect(applyUnitRules(1.26, { minUnits: 1, incrementUnits: 0.25 })).toBe(1.5);
  });

  it("leaves an exact multiple alone", () => {
    expect(applyUnitRules(1.5, { minUnits: 1, incrementUnits: 0.25 })).toBe(1.5);
    expect(applyUnitRules(2, { minUnits: 1, incrementUnits: 0.5 })).toBe(2);
  });

  it("passes the quantity through when no rules are set", () => {
    expect(applyUnitRules(1.37, {})).toBe(1.37);
  });
});

describe("resolveTierPrice", () => {
  const tiered = product({
    pricingModel: "term",
    unitAmountCents: 22000,
    tiers: [
      { id: "t1", minQuantity: 2, unitAmountCents: null, discountBp: 1000, sortOrder: 0 },
      { id: "t2", minQuantity: 4, unitAmountCents: null, discountBp: 2000, sortOrder: 1 },
    ],
  });

  it("uses the base price below the first tier", () => {
    expect(resolveTierPrice(tiered, 1)).toBe(22000);
  });

  it("applies the highest tier the quantity reaches", () => {
    expect(resolveTierPrice(tiered, 2)).toBe(19800);
    expect(resolveTierPrice(tiered, 3)).toBe(19800);
    expect(resolveTierPrice(tiered, 4)).toBe(17600);
    expect(resolveTierPrice(tiered, 10)).toBe(17600);
  });

  it("honours an absolute tier price over a discount", () => {
    const flat = product({
      unitAmountCents: 2500,
      tiers: [{ id: "t1", minQuantity: 5, unitAmountCents: 2000, discountBp: null, sortOrder: 0 }],
    });
    expect(resolveTierPrice(flat, 5)).toBe(2000);
  });
});

describe("priceProductLine", () => {
  it("prices an hourly product against its rounding rules", () => {
    const line = priceProductLine(product(), 1.6);
    expect(line.quantity).toBe(1.75);
    expect(line.unitCents).toBe(6000);
    expect(line.lineTotalCents).toBe(10500);
    expect(line.unitLabel).toBe("hour");
  });

  it("charges the minimum for a lesson shorter than it", () => {
    const line = priceProductLine(product(), 0.4);
    expect(line.quantity).toBe(1);
    expect(line.lineTotalCents).toBe(6000);
  });

  it("freezes the product's ledger codes and tax treatment onto the line", () => {
    const line = priceProductLine(
      product({ accountCode: "210", itemCode: "TUITION", taxTreatment: "zero_rated", taxRateBp: 0 }),
      1,
    );
    expect(line.accountCode).toBe("210");
    expect(line.itemCode).toBe("TUITION");
    expect(line.taxTreatment).toBe("zero_rated");
    expect(line.taxRateBp).toBe(0);
  });

  it("never invents an item code from the SKU — Xero rejects unknown ones", () => {
    expect(priceProductLine(product({ itemCode: null }), 1).itemCode).toBeNull();
  });

  it("lets an explicit override replace the rate but not the coding", () => {
    const line = priceProductLine(product(), 2, { unitCentsOverride: 4500 });
    expect(line.unitCents).toBe(4500);
    expect(line.lineTotalCents).toBe(9000);
    expect(line.accountCode).toBe("200");
  });

  it("spells out the recurrence in a recurring line's description", () => {
    const line = priceProductLine(
      product({
        pricingModel: "recurring",
        name: "Weekly class fee",
        recurringInterval: "week",
        recurringIntervalCount: 2,
        unitLabel: null,
      }),
      1,
    );
    expect(line.description).toBe("Weekly class fee (per 2 weeks)");
  });

  it("applies volume tiers through the priced line", () => {
    const line = priceProductLine(
      product({
        pricingModel: "term",
        minUnits: null,
        incrementUnits: null,
        unitAmountCents: 22000,
        tiers: [{ id: "t1", minQuantity: 2, unitAmountCents: null, discountBp: 1000, sortOrder: 0 }],
      }),
      3,
    );
    expect(line.unitCents).toBe(19800);
    expect(line.lineTotalCents).toBe(59400);
  });
});

describe("expandPackage", () => {
  const term = product({ id: "term", name: "Term tuition", pricingModel: "term", unitAmountCents: 22000 });
  const pkg = product({
    id: "pkg",
    name: "Unlimited term",
    pricingModel: "package",
    unitAmountCents: 55000,
    minUnits: null,
    incrementUnits: null,
    components: [
      { id: "c1", componentProductId: "term", componentName: null, quantity: 3, sortOrder: 0 },
    ],
  });

  it("charges only the package price — components are informational", () => {
    const lines = expandPackage(pkg, new Map([["term", term]]));
    expect(lines).toHaveLength(2);
    expect(lines[0].lineTotalCents).toBe(55000);
    expect(lines[1].lineTotalCents).toBe(0);
    expect(lines.reduce((sum, l) => sum + l.lineTotalCents, 0)).toBe(55000);
  });

  it("names the included product in the detail line", () => {
    const lines = expandPackage(pkg, new Map([["term", term]]));
    expect(lines[1].description).toContain("Term tuition");
    expect(lines[1].description).toContain("3");
  });

  it("still renders when the component product can't be loaded", () => {
    const lines = expandPackage(pkg, new Map());
    expect(lines[1].description).toContain("Included");
  });
});

describe("hoursBetween", () => {
  it("converts a booked slot into hours", () => {
    expect(hoursBetween("16:00", "17:00")).toBe(1);
    expect(hoursBetween("16:00", "17:30")).toBe(1.5);
    expect(hoursBetween("16:00:00", "16:20:00")).toBe(0.333);
  });

  it("returns 0 rather than a negative for a malformed slot", () => {
    expect(hoursBetween("17:00", "16:00")).toBe(0);
  });
});

describe("defaultUnitLabel", () => {
  it("falls back to something sensible per model", () => {
    expect(defaultUnitLabel(product({ unitLabel: null, pricingModel: "hourly" }))).toBe("hour");
    expect(defaultUnitLabel(product({ unitLabel: null, pricingModel: "per_session" }))).toBe("session");
    expect(defaultUnitLabel(product({ unitLabel: null, pricingModel: "term" }))).toBe("term");
    expect(defaultUnitLabel(product({ unitLabel: null, pricingModel: "one_off" }))).toBeNull();
  });

  it("prefers the studio's own label", () => {
    expect(defaultUnitLabel(product({ unitLabel: "session", pricingModel: "hourly" }))).toBe("session");
  });
});
