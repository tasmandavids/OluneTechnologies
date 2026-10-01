// Consistency sweep over every jurisdiction pack (and every region). A pack is
// data that ships to real studios' books, so a dangling tax code or a chart
// missing the receivables account must fail here, not at someone's setup.

import { describe, expect, it } from "vitest";
import { buildChart } from "@/lib/ledger/chart";
import { JURISDICTIONS, customJurisdiction, ratesFor } from "@/lib/ledger/jurisdictions";
import type { Jurisdiction, RegionPack } from "@/lib/ledger/jurisdictions/types";
import { computeReturn } from "@/lib/ledger/tax-return";
import { FILING_FREQUENCIES, SYSTEM_KEY_FALLBACKS, type SystemKey } from "@/lib/ledger/types";

const REQUIRED_KEYS: SystemKey[] = ["bank", "stripe_clearing", "undeposited", "ar", "ap", "tax_collected", "sales", "class_passes", "retained_earnings", "opening_balance", "rounding", "suspense", "owner_funds", "bank_fees"];

type Case = [string, Jurisdiction, RegionPack | null];
const cases: Case[] = [
  ...JURISDICTIONS.flatMap((j): Case[] => (j.regions?.length ? j.regions.map((r): Case => [`${j.code}-${r.code}`, j, r]) : [[j.code, j, null]])),
  ["XX", customJurisdiction({ countryName: "Elsewhere", currency: "MXN", taxName: "IVA", standardRateBp: 1600, reducedRateBp: 800 }), null],
];

describe.each(cases)("%s", (_id, j, region) => {
  const rates = ratesFor(j, region);
  const codes = new Set(rates.map((r) => r.code));
  const chart = buildChart(j, region);
  const keys = new Set(chart.map((a) => a.systemKey).filter(Boolean));

  it("tax codes the pack refers to exist", () => {
    for (const code of [region?.defaultSalesCode ?? j.defaultSalesCode, region?.defaultPurchaseCode ?? j.defaultPurchaseCode, j.zeroSalesCode, j.exemptSalesCode, j.exemptPurchaseCode, region?.serviceSalesCode ?? j.serviceSalesCode].filter(Boolean)) {
      expect(codes, `missing tax code ${code}`).toContain(code);
    }
  });

  it("rate codes are unique and components sum to the rate", () => {
    expect(codes.size).toBe(rates.length);
    for (const r of rates) {
      const comps = r.components ?? [];
      if (r.rateBp > 0) expect(comps.reduce((s, c) => s + c.rateBp, 0)).toBeCloseTo(r.rateBp, 6);
      else expect(comps).toHaveLength(0);
    }
  });

  it("every component's account key is on the chart (directly or by fallback)", () => {
    const resolvable = (k: SystemKey) => keys.has(k) || (SYSTEM_KEY_FALLBACKS[k] ?? []).some((f) => keys.has(f));
    for (const r of rates) {
      for (const c of r.components ?? []) {
        expect(resolvable(c.salesAccountKey), `${r.code} → ${c.salesAccountKey}`).toBe(true);
        if (c.purchaseAccountKey) expect(resolvable(c.purchaseAccountKey), `${r.code} → ${c.purchaseAccountKey}`).toBe(true);
      }
    }
  });

  it("chart has every system account, unique codes and valid tax defaults", () => {
    for (const k of REQUIRED_KEYS) expect(keys, `missing ${k}`).toContain(k);
    const accountCodes = chart.map((a) => a.code);
    expect(new Set(accountCodes).size).toBe(accountCodes.length);
    for (const a of chart) {
      if (a.defaultTaxCode) expect(codes, `${a.code} default ${a.defaultTaxCode}`).toContain(a.defaultTaxCode);
      expect(a.name).not.toMatch(/\{\w+\}/);
      expect(a.code.length).toBeLessThanOrEqual(20);
    }
    if (j.separateTaxAccounts) for (const k of ["tax_paid", "tax_settlement"] as const) expect(keys).toContain(k);
  });

  it("filing setup and bases are coherent", () => {
    expect(j.filing.frequencies).toContain(j.filing.default);
    for (const f of j.filing.frequencies) expect(FILING_FREQUENCIES).toContain(f);
    expect(j.bases.length).toBeGreaterThan(0);
    expect(j.currency).toMatch(/^[A-Z]{3}$/);
    expect(() => new Intl.NumberFormat(j.locale, { style: "currency", currency: j.currency })).not.toThrow();
  });

  it("the return form evaluates on an empty period and gives valid due dates", () => {
    const r = computeReturn(j, []);
    expect(r.netPayableCents).toBe(0);
    expect(new Set(r.boxes.map((b) => b.id)).size).toBe(r.boxes.length);
    for (const f of j.filing.frequencies) {
      const due = j.returnForm.dueDate("2026-06-30", f);
      expect(due).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(due > "2026-06-30").toBe(true);
    }
  });
});
