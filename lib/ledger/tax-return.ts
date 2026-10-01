// ============================================================================
//  Tax returns: ledger_tax_summary rows → the jurisdiction's official boxes.
//
//  The RPC returns both bases at once; the studio's settings pick one per
//  direction (NZ hybrid: sales accrual, purchases cash). The pack's box
//  functions then read the chosen entries through a small query API, in form
//  order, so later boxes can reference earlier ones ("Box 5 − Box 6").
// ============================================================================

import type { Jurisdiction, ReturnBox, ReturnQuery, TaxReturnEntry } from "./jurisdictions/types";
import type { TaxBasis, TaxRate, TaxReportCategory, TaxSummaryRow } from "./types";

export function buildReturnEntries(
  rows: TaxSummaryRow[],
  rates: TaxRate[],
  basis: { sales: TaxBasis; purchases: TaxBasis },
): TaxReturnEntry[] {
  const byId = new Map(rates.map((r) => [r.id, r]));
  const entries: TaxReturnEntry[] = [];

  for (const row of rows) {
    if (row.basis !== basis[row.direction]) continue;
    const rate = byId.get(row.taxRateId);
    if (!rate) continue;

    // Purchases only carry tax for recoverable components (non-recoverable PST
    // went into the expense), so split across those alone.
    const comps = row.direction === "purchases" ? rate.components.filter((c) => c.purchaseAccountKey) : rate.components;
    const compTotal = comps.reduce((s, c) => s + c.rateBp, 0);
    const componentTax: Record<string, number> = {};
    let allocated = 0;
    comps.forEach((c, i) => {
      const share = i === comps.length - 1 ? row.taxCents - allocated : Math.round((row.taxCents * c.rateBp) / (compTotal || 1));
      allocated += share;
      componentTax[c.name] = (componentTax[c.name] ?? 0) + share;
    });

    entries.push({
      direction: row.direction,
      category: rate.reportCategory,
      rateCode: rate.code,
      rateBp: rate.rateBp,
      netCents: row.netCents,
      taxCents: row.taxCents,
      componentTax,
    });
  }
  return entries;
}

function makeQuery(entries: TaxReturnEntry[], computed: Map<string, number>): ReturnQuery {
  const pick = (direction: "sales" | "purchases", categories?: TaxReportCategory[]) =>
    entries.filter((e) => e.direction === direction && (!categories || categories.includes(e.category)) && e.category !== "out_of_scope");
  const sum = (xs: TaxReturnEntry[], f: (e: TaxReturnEntry) => number) => xs.reduce((s, e) => s + f(e), 0);
  return {
    entries,
    net: (d, c) => sum(pick(d, c), (e) => e.netCents),
    tax: (d, c) => sum(pick(d, c), (e) => e.taxCents),
    gross: (d, c) => sum(pick(d, c), (e) => e.netCents + e.taxCents),
    netAtRate: (d, bp) => sum(pick(d).filter((e) => e.rateBp === bp), (e) => e.netCents),
    taxAtRate: (d, bp) => sum(pick(d).filter((e) => e.rateBp === bp), (e) => e.taxCents),
    componentTax: (d, names) => sum(pick(d), (e) => names.reduce((s, n) => s + (e.componentTax[n] ?? 0), 0)),
    box: (id) => computed.get(id) ?? 0,
  };
}

export type ComputedBox = Omit<ReturnBox, "compute"> & { valueCents: number };

export type ComputedReturn = {
  formCode: string;
  formName: string;
  boxes: ComputedBox[];
  netPayableCents: number;
  /** Tax per the ledger, line by line, for comparison with form arithmetic (NZ 3/23). */
  ledgerOutputTaxCents: number;
  ledgerInputTaxCents: number;
};

/** Evaluate the pack's form. `manualValues` overrides boxes the studio typed in. */
export function computeReturn(j: Jurisdiction, entries: TaxReturnEntry[], manualValues: Record<string, number> = {}): ComputedReturn {
  const computed = new Map<string, number>();
  const q = makeQuery(entries, computed);
  const boxes: ComputedBox[] = [];
  for (const b of j.returnForm.boxes) {
    const value = b.manual && b.id in manualValues ? Math.round(manualValues[b.id]) : Math.round(b.compute(q));
    computed.set(b.id, value);
    const { compute: _compute, ...rest } = b;
    void _compute;
    boxes.push({ ...rest, valueCents: value });
  }
  return {
    formCode: j.returnForm.code,
    formName: j.returnForm.name,
    boxes,
    netPayableCents: Math.round(j.returnForm.net(q)),
    ledgerOutputTaxCents: q.tax("sales"),
    ledgerInputTaxCents: q.tax("purchases"),
  };
}

/** Per-rate breakdown table shown under the form (what Xero calls the GST audit report summary). */
export function rateBreakdown(entries: TaxReturnEntry[]) {
  const map = new Map<string, { rateCode: string; direction: "sales" | "purchases"; netCents: number; taxCents: number }>();
  for (const e of entries) {
    const key = `${e.direction}|${e.rateCode}`;
    const cur = map.get(key) ?? { rateCode: e.rateCode, direction: e.direction, netCents: 0, taxCents: 0 };
    cur.netCents += e.netCents;
    cur.taxCents += e.taxCents;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => (a.direction === b.direction ? a.rateCode.localeCompare(b.rateCode) : a.direction === "sales" ? -1 : 1));
}
