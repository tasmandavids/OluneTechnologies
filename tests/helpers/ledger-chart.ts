// Build an in-memory Olune Books chart from a real jurisdiction pack, the same
// way ledger_provision would, so posting tests exercise production data.

import { buildChart } from "@/lib/ledger/chart";
import { getJurisdiction, getRegion, ratesFor } from "@/lib/ledger/jurisdictions";
import { ChartIndex } from "@/lib/ledger/posting";
import type { LedgerAccount, TaxRate } from "@/lib/ledger/types";

export function packChart(code: string, regionCode: string | null = null, taxRegistered = true) {
  const j = getJurisdiction(code)!;
  const region = getRegion(j, regionCode);
  const rates: TaxRate[] = ratesFor(j, region).map((r, i) => ({
    id: `rate-${r.code}`,
    code: r.code,
    name: r.name,
    rateBp: r.rateBp,
    appliesTo: r.appliesTo,
    reportCategory: r.reportCategory,
    components: r.components ?? [],
    isSystem: true,
    isArchived: false,
    sortOrder: i,
  }));
  const accounts: LedgerAccount[] = buildChart(j, region).map((a) => ({
    id: `acct-${a.code}`,
    code: a.code,
    name: a.name,
    type: a.type,
    subtype: a.subtype,
    systemKey: a.systemKey,
    description: null,
    defaultTaxRateId: a.defaultTaxCode ? `rate-${a.defaultTaxCode}` : null,
    bankKind: a.bankKind,
    bankNumber: null,
    isArchived: false,
    autoCreated: false,
  }));
  const chart = new ChartIndex(accounts, rates, {
    taxRegistered,
    defaultSalesCode: region?.defaultSalesCode ?? j.defaultSalesCode,
    zeroSalesCode: j.zeroSalesCode,
    exemptSalesCode: j.exemptSalesCode,
  });
  return { j, region, rates, accounts, chart };
}
