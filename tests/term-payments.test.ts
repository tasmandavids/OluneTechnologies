import { describe, it, expect } from "vitest";
import {
  splitTermInstallments,
  nextInstallmentAmountCents,
  TERM_INSTALLMENT_COUNT,
  autoPayMonthlyCents,
} from "@/lib/term-payments";

describe("splitTermInstallments", () => {
  it("splits $300 term into three $100 instalments", () => {
    expect(splitTermInstallments(30000, 3)).toEqual([10000, 10000, 10000]);
  });

  it("puts remainder cents on the final instalment", () => {
    expect(splitTermInstallments(10000, 3)).toEqual([3333, 3333, 3334]);
  });

  it("defaults to 3 instalments", () => {
    expect(splitTermInstallments(9000)).toHaveLength(TERM_INSTALLMENT_COUNT);
  });
});

describe("nextInstallmentAmountCents", () => {
  it("returns the next slice", () => {
    expect(nextInstallmentAmountCents([3333, 3333, 3334], 1)).toBe(3333);
  });

  it("returns null when complete", () => {
    expect(nextInstallmentAmountCents([100, 100, 100], 3)).toBeNull();
  });
});

describe("autoPayMonthlyCents (audit B-08)", () => {
  const base = { priceCents: 9000, pricingModel: "recurring", recurringInterval: "month", recurringIntervalCount: 1 };

  it("charges the full monthly price for a monthly product", () => {
    expect(autoPayMonthlyCents(base)).toBe(9000);
  });

  it("converts weekly and fortnightly products to a monthly equivalent", () => {
    expect(autoPayMonthlyCents({ ...base, priceCents: 2000, recurringInterval: "week" })).toBe(8667);
    expect(autoPayMonthlyCents({ ...base, priceCents: 4000, recurringInterval: "fortnight" })).toBe(8667);
  });

  it("spreads a term product over the three instalments", () => {
    expect(autoPayMonthlyCents({ ...base, pricingModel: "term", recurringInterval: null })).toBe(3000);
  });

  it("keeps the term rule for a legacy class with no product", () => {
    expect(autoPayMonthlyCents({ ...base, pricingModel: null, recurringInterval: null })).toBe(3000);
  });

  it("refuses one-off and per-session fees", () => {
    expect(autoPayMonthlyCents({ ...base, pricingModel: "one_off" })).toBeNull();
    expect(autoPayMonthlyCents({ ...base, pricingModel: "per_session" })).toBeNull();
  });
});
