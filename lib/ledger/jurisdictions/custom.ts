import { validGeneric } from "../tax-numbers";
import { endOfMonthAfter, genericBoxes, nilRate, rate } from "./helpers";
import type { Jurisdiction } from "./types";

export type CustomJurisdictionInput = {
  countryName: string;
  currency: string;
  taxName: string;
  standardRateBp: number;
  reducedRateBp?: number | null;
};

/**
 * Anywhere without a pack: one standard rate (and optionally a reduced one)
 * named by the studio, a generic sales/purchases/net return, English chart.
 * Honest about what it is — the UI says no local rules were applied.
 */
export function customJurisdiction(input: CustomJurisdictionInput): Jurisdiction {
  const tax = input.taxName.trim() || "Tax";
  const pct = (bp: number) => `${bp / 100}%`;
  const reduced = input.reducedRateBp && input.reducedRateBp > 0 ? input.reducedRateBp : null;
  return {
    code: "XX",
    name: input.countryName.trim() || "Other country",
    flag: "🌐",
    currency: input.currency.toUpperCase(),
    locale: "en",
    chartLanguage: "en",
    taxName: tax,
    taxAuthority: "Your tax authority",
    taxAuthorityUrl: "",
    taxNumber: { label: "Tax registration number", placeholder: "", validate: validGeneric },
    defaultRegistered: true,
    pricesIncludeTax: true,
    fiscalYearStart: { month: 1, day: 1 },
    filing: { frequencies: ["monthly", "bimonthly", "quarterly", "six_monthly", "annual"], default: "quarterly", defaultAnchorMonth: 1 },
    bases: [
      { id: "accrual", label: "Accrual (invoice) basis", sales: "accrual", purchases: "accrual" },
      { id: "cash", label: "Cash (payments) basis", sales: "cash", purchases: "cash" },
    ],
    taxRates: [
      rate({ code: "STD", name: `${tax} ${pct(input.standardRateBp)} on sales`, rateBp: input.standardRateBp, appliesTo: "sales", category: "standard", componentName: tax }),
      ...(reduced
        ? [rate({ code: "RED", name: `${tax} ${pct(reduced)} on sales`, rateBp: reduced, appliesTo: "sales", category: "reduced", componentName: tax })]
        : []),
      nilRate("ZERO", "Zero rated", "zero", "sales"),
      nilRate("EXEMPT", "Exempt", "exempt"),
      nilRate("NONE", `No ${tax}`, "out_of_scope"),
      rate({ code: "STD-P", name: `${tax} ${pct(input.standardRateBp)} on purchases`, rateBp: input.standardRateBp, appliesTo: "purchases", category: "standard", componentName: tax }),
      ...(reduced
        ? [rate({ code: "RED-P", name: `${tax} ${pct(reduced)} on purchases`, rateBp: reduced, appliesTo: "purchases", category: "reduced", componentName: tax })]
        : []),
    ],
    defaultSalesCode: "STD",
    defaultPurchaseCode: "STD-P",
    zeroSalesCode: "ZERO",
    exemptSalesCode: "EXEMPT",
    exemptPurchaseCode: "EXEMPT",
    separateTaxAccounts: false,
    chartTerms: {
      taxOutput: `${tax} payable`,
      payrollTax: "Payroll taxes payable",
      retirement: "Employer retirement contributions",
      retirementPayable: "Retirement contributions payable",
      musicLicensing: "Music licensing",
    },
    returnForm: {
      code: "TAX",
      name: `${tax} summary`,
      authority: "Your tax authority",
      authorityUrl: "",
      boxes: genericBoxes({
        sales: "Total sales (excluding tax)",
        salesTax: `${tax} on sales`,
        purchases: "Total purchases (excluding tax)",
        purchasesTax: `${tax} on purchases`,
        net: `Net ${tax} payable (refundable if negative)`,
      }),
      net: (q) => q.box("N"),
      dueDate: (periodEnd) => endOfMonthAfter(periodEnd, 1),
    },
    notes: [
      "No country-specific rules were applied. Check your rates, filing frequency and return layout with a local accountant.",
    ],
    reviewedAt: "2026-10-01",
  };
}
