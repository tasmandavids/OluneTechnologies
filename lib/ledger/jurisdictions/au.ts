import { validAuAbn } from "../tax-numbers";
import { box, dayOfMonthAfter, nilRate, parseIso, rate } from "./helpers";
import type { Jurisdiction } from "./types";

export const AU: Jurisdiction = {
  code: "AU",
  name: "Australia",
  flag: "🇦🇺",
  currency: "AUD",
  locale: "en-AU",
  chartLanguage: "en",
  taxName: "GST",
  taxAuthority: "Australian Taxation Office (ATO)",
  taxAuthorityUrl: "https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst",
  taxNumber: {
    label: "ABN",
    placeholder: "51 824 753 556",
    validate: validAuAbn,
    hint: "11 digits. Checked with the ATO's ABN algorithm.",
  },
  registrationThreshold: { amount: 75_000, currency: "AUD", label: "GST turnover per year" },
  defaultRegistered: true,
  pricesIncludeTax: true,
  fiscalYearStart: { month: 7, day: 1 },
  filing: { frequencies: ["monthly", "quarterly", "annual"], default: "quarterly", defaultAnchorMonth: 7 },
  bases: [
    { id: "cash", label: "Cash basis", sales: "cash", purchases: "cash", hint: "Available to businesses with turnover under $10m." },
    { id: "accrual", label: "Accrual basis", sales: "accrual", purchases: "accrual" },
  ],
  taxRates: [
    rate({ code: "GST", name: "GST on income", rateBp: 1000, appliesTo: "sales", category: "standard", componentName: "GST" }),
    nilRate("FRE", "GST free income", "zero", "sales"),
    nilRate("EXP", "GST free exports", "export", "sales"),
    nilRate("ITS", "Input taxed sales", "exempt", "sales"),
    rate({ code: "GST-P", name: "GST on expenses", rateBp: 1000, appliesTo: "purchases", category: "standard", componentName: "GST" }),
    rate({ code: "CAP", name: "GST on capital purchases", rateBp: 1000, appliesTo: "purchases", category: "capital", componentName: "GST" }),
    nilRate("FRE-P", "GST free expenses", "zero", "purchases"),
    nilRate("ITP", "Input taxed purchases", "exempt", "purchases"),
    nilRate("BASX", "BAS excluded", "out_of_scope"),
  ],
  defaultSalesCode: "GST",
  defaultPurchaseCode: "GST-P",
  zeroSalesCode: "FRE",
  exemptSalesCode: "ITS",
  exemptPurchaseCode: "ITP",
  separateTaxAccounts: false,
  chartTerms: {
    taxOutput: "GST",
    payrollTax: "PAYG withholding payable",
    retirement: "Superannuation",
    retirementPayable: "Superannuation payable",
    musicLicensing: "OneMusic Australia licence",
  },
  returnForm: {
    code: "BAS",
    name: "Business activity statement (GST)",
    authority: "Australian Taxation Office",
    authorityUrl: "https://www.ato.gov.au/businesses-and-organisations/preparing-lodging-and-paying/business-activity-statements-bas",
    boxes: [
      box("G1", "Total sales (including any GST)", (q) => q.gross("sales", ["standard", "zero", "export", "exempt"]), { section: "GST on sales" }),
      box("G2", "Export sales", (q) => q.net("sales", ["export"])),
      box("G3", "Other GST-free sales", (q) => q.net("sales", ["zero"])),
      box("1A", "GST on sales", (q) => q.tax("sales"), { total: true }),
      box("G10", "Capital purchases (including any GST)", (q) => q.gross("purchases", ["capital"]), { section: "GST on purchases" }),
      box("G11", "Non-capital purchases (including any GST)", (q) => q.gross("purchases", ["standard", "zero", "exempt", "import"])),
      box("1B", "GST on purchases", (q) => q.tax("purchases"), { total: true }),
      box("NET", "GST payable (refundable if negative): 1A − 1B", (q) => q.box("1A") - q.box("1B"), { total: true }),
    ],
    net: (q) => q.box("NET"),
    dueDate: (periodEnd, frequency) => {
      const { y, m } = parseIso(periodEnd);
      if (frequency === "monthly") return dayOfMonthAfter(periodEnd, 1, 21);
      if (frequency === "annual") return `${y}-10-31`;
      if (m === 12) return `${y + 1}-02-28`;
      return dayOfMonthAfter(periodEnd, 1, 28);
    },
    notes: ["Small businesses on simpler BAS report only G1, 1A and 1B; the other labels are shown for completeness."],
  },
  notes: [
    "Registration is required once GST turnover reaches $75,000 a year.",
    "Recreational dance classes are generally taxable. Some accredited education courses are GST-free, so check the ATO guidance if that applies to you.",
    "Olune Books prepares the BAS figures; you lodge them through Online services for business or your BAS agent.",
  ],
  reviewedAt: "2026-10-01",
};
