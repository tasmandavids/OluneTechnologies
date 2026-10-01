import { validCaBn } from "../tax-numbers";
import { box, dayOfMonthAfter, manualBox, nilRate, rate } from "./helpers";
import type { Jurisdiction, RegionPack, TaxRateTemplate } from "./types";

const ZERO_EXEMPT: TaxRateTemplate[] = [
  nilRate("ZERO", "Zero-rated supplies", "zero"),
  nilRate("EXEMPT", "Exempt supplies", "exempt"),
  nilRate("NOTAX", "No tax (outside GST/HST)", "out_of_scope"),
];

const gst = () =>
  rate({ code: "GST", name: "GST 5%", rateBp: 500, appliesTo: "both", category: "standard", componentName: "GST" });

const hst = (pct: number) =>
  rate({ code: `HST${pct}`, name: `HST ${pct}%`, rateBp: pct * 100, appliesTo: "both", category: "standard", componentName: "HST" });

/**
 * GST plus a provincial tax, as one compound rate with two components so each
 * lands in its own liability account. PST/RST isn't recoverable on purchases
 * (purchaseAccountKey null puts it into the expense); QST is.
 */
function gstPlus(code: string, label: string, provBp: number, recoverable: boolean): TaxRateTemplate {
  return {
    code,
    name: `GST 5% + ${label} ${provBp / 100}%`,
    rateBp: 500 + provBp,
    appliesTo: "both",
    reportCategory: "standard",
    components: [
      { name: "GST", rateBp: 500, salesAccountKey: "tax_collected", purchaseAccountKey: "tax_paid" },
      { name: label, rateBp: provBp, salesAccountKey: "tax_collected_2", purchaseAccountKey: recoverable ? "tax_paid_2" : null },
    ],
  };
}

const gstOnly = (code: string, name: string): RegionPack => ({
  code,
  name,
  taxRates: [gst(), ...ZERO_EXEMPT],
  defaultSalesCode: "GST",
  defaultPurchaseCode: "GST",
});

const hstProvince = (code: string, name: string, pct: number): RegionPack => ({
  code,
  name,
  taxRates: [hst(pct), ...ZERO_EXEMPT],
  defaultSalesCode: `HST${pct}`,
  defaultPurchaseCode: `HST${pct}`,
});

const REGIONS: RegionPack[] = [
  gstOnly("AB", "Alberta"),
  {
    code: "BC",
    name: "British Columbia",
    taxRates: [gst(), gstPlus("GST+PST", "PST", 700, false), ...ZERO_EXEMPT],
    defaultSalesCode: "GST",
    defaultPurchaseCode: "GST+PST",
    extraTaxAccount: { name: "PST payable (BC)", key: "tax_collected_2" },
    note: "Most services, including lessons, are GST-only in BC; PST applies to goods such as costumes.",
  },
  {
    code: "MB",
    name: "Manitoba",
    taxRates: [gst(), gstPlus("GST+RST", "RST", 700, false), ...ZERO_EXEMPT],
    defaultSalesCode: "GST",
    defaultPurchaseCode: "GST+RST",
    extraTaxAccount: { name: "RST payable (MB)", key: "tax_collected_2" },
  },
  hstProvince("NB", "New Brunswick", 15),
  hstProvince("NL", "Newfoundland and Labrador", 15),
  gstOnly("NT", "Northwest Territories"),
  {
    ...hstProvince("NS", "Nova Scotia", 14),
    note: "Nova Scotia's HST fell from 15% to 14% on 1 April 2025.",
  },
  gstOnly("NU", "Nunavut"),
  hstProvince("ON", "Ontario", 13),
  hstProvince("PE", "Prince Edward Island", 15),
  {
    code: "QC",
    name: "Québec",
    taxRates: [gst(), gstPlus("GST+QST", "QST", 997.5, true), ...ZERO_EXEMPT],
    defaultSalesCode: "GST+QST",
    defaultPurchaseCode: "GST+QST",
    extraTaxAccount: { name: "QST payable", key: "tax_collected_2" },
    note: "QST is filed separately with Revenu Québec; its figures are shown below the GST/HST return.",
  },
  {
    code: "SK",
    name: "Saskatchewan",
    taxRates: [gst(), gstPlus("GST+PST", "PST", 600, false), ...ZERO_EXEMPT],
    defaultSalesCode: "GST",
    defaultPurchaseCode: "GST+PST",
    extraTaxAccount: { name: "PST payable (SK)", key: "tax_collected_2" },
  },
  gstOnly("YT", "Yukon"),
];

export const CA: Jurisdiction = {
  code: "CA",
  name: "Canada",
  flag: "🇨🇦",
  currency: "CAD",
  locale: "en-CA",
  chartLanguage: "en",
  taxName: "GST/HST",
  taxAuthority: "Canada Revenue Agency (CRA)",
  taxAuthorityUrl: "https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses.html",
  taxNumber: {
    label: "Business number (GST/HST account)",
    placeholder: "123456789 RT0001",
    validate: validCaBn,
    hint: "9-digit BN, optionally followed by RT0001. The BN check digit is verified.",
  },
  registrationThreshold: { amount: 30_000, currency: "CAD", label: "Taxable supplies over four consecutive quarters" },
  defaultRegistered: true,
  pricesIncludeTax: false,
  fiscalYearStart: { month: 1, day: 1 },
  filing: { frequencies: ["annual", "quarterly", "monthly"], default: "annual", defaultAnchorMonth: 1 },
  bases: [{ id: "regular", label: "Regular method", sales: "accrual", purchases: "accrual" }],
  taxRates: [gst(), ...ZERO_EXEMPT],
  defaultSalesCode: "GST",
  defaultPurchaseCode: "GST",
  zeroSalesCode: "ZERO",
  exemptSalesCode: "EXEMPT",
  exemptPurchaseCode: "EXEMPT",
  separateTaxAccounts: false,
  chartTerms: {
    taxOutput: "GST/HST payable",
    payrollTax: "Source deductions payable",
    retirement: "Employer CPP & EI contributions",
    retirementPayable: "CPP & EI payable",
    musicLicensing: "SOCAN / Re:Sound licences",
  },
  regionLabel: "Province or territory",
  regions: REGIONS,
  returnForm: {
    code: "GST34",
    name: "GST/HST return",
    authority: "Canada Revenue Agency",
    authorityUrl: "https://www.canada.ca/en/revenue-agency/services/e-services/digital-services-businesses/gst-hst-netfile.html",
    boxes: [
      box("101", "Sales and other revenue", (q) => q.net("sales", ["standard", "zero", "exempt", "export"]), { section: "GST/HST" }),
      box("103", "GST/HST collected or collectible", (q) => q.componentTax("sales", ["GST", "HST"])),
      manualBox("104", "Adjustments"),
      box("105", "Total GST/HST and adjustments for the period (103 + 104)", (q) => q.box("103") + q.box("104"), { total: true }),
      box("106", "Input tax credits (ITCs) for the current period", (q) => q.componentTax("purchases", ["GST", "HST"])),
      manualBox("107", "Adjustments"),
      box("108", "Total ITCs and adjustments (106 + 107)", (q) => q.box("106") + q.box("107"), { total: true }),
      box("109", "Net tax (105 − 108)", (q) => q.box("105") - q.box("108"), { total: true }),
      box("PST", "Provincial sales tax collected (PST/RST/QST — separate return)", (q) => q.componentTax("sales", ["PST", "RST", "QST"]), { section: "Provincial (filed separately)" }),
      box("QST-ITR", "QST input tax refunds (Québec)", (q) => q.componentTax("purchases", ["QST"])),
    ],
    net: (q) => q.box("109"),
    dueDate: (periodEnd, frequency) =>
      frequency === "annual" ? dayOfMonthAfter(periodEnd, 3, 31) : dayOfMonthAfter(periodEnd, 1, 31),
    notes: ["Compound rates are split between GST/HST and provincial tax in proportion to their rates, so a line can differ from the per-invoice figure by a cent."],
  },
  notes: [
    "You must register once taxable supplies exceed $30,000 over four consecutive calendar quarters.",
    "The Quick Method of accounting isn't modelled; returns are prepared on the regular method.",
  ],
  reviewedAt: "2026-10-01",
};
