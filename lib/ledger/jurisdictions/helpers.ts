import type { SystemKey, TaxReportCategory } from "../types";
import type { ReturnBox, ReturnQuery, TaxRateTemplate } from "./types";

// ─── Dates (ISO yyyy-mm-dd, UTC, no time zones involved) ────────────────────

export function parseIso(iso: string): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

export function iso(y: number, m: number, d: number): string {
  // Normalise month overflow (m may be 13, 0, -1…).
  const date = new Date(Date.UTC(y, m - 1, 1));
  const yy = date.getUTCFullYear();
  const mm = date.getUTCMonth() + 1;
  const last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  return `${yy}-${String(mm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

export function lastDayOfMonth(y: number, m: number): string {
  return iso(y, m, 31);
}

/** The `day`th of the month `monthsAfter` months after `periodEnd`'s month. */
export function dayOfMonthAfter(periodEnd: string, monthsAfter: number, day: number): string {
  const { y, m } = parseIso(periodEnd);
  return iso(y, m + monthsAfter, day);
}

/** Last day of the month `monthsAfter` months after `periodEnd`'s month. */
export function endOfMonthAfter(periodEnd: string, monthsAfter: number): string {
  const { y, m } = parseIso(periodEnd);
  return lastDayOfMonth(y, m + monthsAfter);
}

/**
 * HMRC's "one calendar month and seven days": tax periods end on a month end,
 * so it's the last day of the following month plus the days (30 June → 7 Aug).
 */
export function monthsAndDaysAfter(periodEnd: string, months: number, days: number): string {
  const { y, m, d } = parseIso(endOfMonthAfter(periodEnd, months));
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// ─── Rates ───────────────────────────────────────────────────────────────────

type RateOpts = {
  code: string;
  name: string;
  rateBp: number;
  appliesTo: "sales" | "purchases" | "both";
  category: TaxReportCategory;
  componentName?: string;
  salesKey?: SystemKey;
  purchaseKey?: SystemKey | null;
};

/** A one-component rate posting to tax_collected / tax_paid unless told otherwise. */
export function rate(o: RateOpts): TaxRateTemplate {
  return {
    code: o.code,
    name: o.name,
    rateBp: o.rateBp,
    appliesTo: o.appliesTo,
    reportCategory: o.category,
    components:
      o.rateBp > 0
        ? [
            {
              name: o.componentName ?? o.name,
              rateBp: o.rateBp,
              salesAccountKey: o.salesKey ?? "tax_collected",
              purchaseAccountKey: o.purchaseKey === undefined ? "tax_paid" : o.purchaseKey,
            },
          ]
        : [],
  };
}

/** A 0% rate (zero-rated, exempt, out of scope…) — no components, no tax posted. */
export function nilRate(
  code: string,
  name: string,
  category: TaxReportCategory,
  appliesTo: "sales" | "purchases" | "both" = "both",
): TaxRateTemplate {
  return { code, name, rateBp: 0, appliesTo, reportCategory: category, components: [] };
}

// ─── Boxes ───────────────────────────────────────────────────────────────────

export const box = (
  id: string,
  label: string,
  compute: (q: ReturnQuery) => number,
  extra: Partial<Omit<ReturnBox, "id" | "label" | "compute">> = {},
): ReturnBox => ({ id, label, compute, ...extra });

export const manualBox = (id: string, label: string, section?: string): ReturnBox => ({
  id,
  label,
  section,
  manual: true,
  compute: () => 0,
});

/** Everything that is reported at all (out-of-scope never reaches a return). */
export const IN_SCOPE: TaxReportCategory[] = [
  "standard", "reduced", "second_reduced", "super_reduced", "zero", "exempt", "export", "capital", "import", "reverse_charge",
];
export const TAXED: TaxReportCategory[] = ["standard", "reduced", "second_reduced", "super_reduced", "capital", "import"];

/** Minimal sales/purchases/net form for jurisdictions without a mapped official layout. */
export function genericBoxes(t: {
  sales: string;
  salesTax: string;
  purchases: string;
  purchasesTax: string;
  net: string;
}): ReturnBox[] {
  return [
    box("S", t.sales, (q) => q.net("sales", IN_SCOPE)),
    box("ST", t.salesTax, (q) => q.tax("sales")),
    box("P", t.purchases, (q) => q.net("purchases", IN_SCOPE)),
    box("PT", t.purchasesTax, (q) => q.tax("purchases")),
    box("N", t.net, (q) => q.box("ST") - q.box("PT"), { total: true }),
  ];
}
