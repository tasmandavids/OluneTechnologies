import { validNzIrd } from "../tax-numbers";
import { box, dayOfMonthAfter, manualBox, nilRate, parseIso, rate } from "./helpers";
import type { Jurisdiction } from "./types";

export const NZ: Jurisdiction = {
  code: "NZ",
  name: "New Zealand",
  flag: "🇳🇿",
  currency: "NZD",
  locale: "en-NZ",
  chartLanguage: "en",
  taxName: "GST",
  taxAuthority: "Inland Revenue (IRD)",
  taxAuthorityUrl: "https://www.ird.govt.nz/gst",
  taxNumber: {
    label: "IRD / GST number",
    placeholder: "123-456-789",
    validate: validNzIrd,
    hint: "8 or 9 digits. Checked against IRD's check-digit rule.",
  },
  registrationThreshold: { amount: 60_000, currency: "NZD", label: "Turnover over any 12 months" },
  defaultRegistered: true,
  pricesIncludeTax: true,
  fiscalYearStart: { month: 4, day: 1 },
  filing: { frequencies: ["monthly", "bimonthly", "six_monthly"], default: "bimonthly", defaultAnchorMonth: 2 },
  bases: [
    { id: "payments", label: "Payments basis", sales: "cash", purchases: "cash", hint: "Available when turnover is under $2m. Most studios use this." },
    { id: "invoice", label: "Invoice basis", sales: "accrual", purchases: "accrual" },
    { id: "hybrid", label: "Hybrid basis", sales: "accrual", purchases: "cash", hint: "Sales on invoice, purchases on payments." },
  ],
  taxRates: [
    rate({ code: "GST15", name: "15% GST on income", rateBp: 1500, appliesTo: "sales", category: "standard", componentName: "GST" }),
    nilRate("ZERO", "Zero rated", "zero", "sales"),
    nilRate("EXEMPT", "GST exempt", "exempt"),
    nilRate("NOGST", "No GST", "out_of_scope"),
    rate({ code: "GST15-P", name: "15% GST on expenses", rateBp: 1500, appliesTo: "purchases", category: "standard", componentName: "GST" }),
    rate({ code: "GST-IMP", name: "GST on imports", rateBp: 1500, appliesTo: "purchases", category: "import", componentName: "GST" }),
  ],
  defaultSalesCode: "GST15",
  defaultPurchaseCode: "GST15-P",
  zeroSalesCode: "ZERO",
  exemptSalesCode: "EXEMPT",
  exemptPurchaseCode: "EXEMPT",
  separateTaxAccounts: false,
  chartTerms: {
    taxOutput: "GST",
    payrollTax: "PAYE payable",
    retirement: "KiwiSaver employer contributions",
    retirementPayable: "KiwiSaver payable",
    musicLicensing: "OneMusic licence",
  },
  returnForm: {
    code: "GST101A",
    name: "GST return (GST101A)",
    authority: "Inland Revenue",
    authorityUrl: "https://www.ird.govt.nz/gst/filing-and-paying-gst-and-refunds",
    boxes: [
      box("5", "Total sales and income (including GST and zero-rated supplies)", (q) => q.gross("sales", ["standard", "zero", "export"]), { section: "Goods and services tax on your sales and income" }),
      box("6", "Zero-rated supplies included in Box 5", (q) => q.net("sales", ["zero", "export"])),
      box("7", "Box 5 minus Box 6", (q) => q.box("5") - q.box("6")),
      box("8", "Box 7 × 3 ÷ 23", (q) => Math.round((q.box("7") * 3) / 23)),
      manualBox("9", "Adjustments from your calculation sheet"),
      box("10", "Total GST collected on sales and income (Box 8 + Box 9)", (q) => q.box("8") + q.box("9"), { total: true }),
      box("11", "Total purchases and expenses (including GST), excluding imported goods", (q) => q.gross("purchases", ["standard", "capital"]), { section: "Goods and services tax on your purchases and expenses" }),
      box("12", "Box 11 × 3 ÷ 23", (q) => Math.round((q.box("11") * 3) / 23)),
      box("13", "Credit adjustments (including GST paid on imports)", (q) => q.tax("purchases", ["import"])),
      box("14", "Total GST credit for purchases and expenses (Box 12 + Box 13)", (q) => q.box("12") + q.box("13"), { total: true }),
      box("15", "Difference between Box 10 and Box 14 — GST to pay (refund if negative)", (q) => q.box("10") - q.box("14"), { total: true }),
    ],
    net: (q) => q.box("15"),
    dueDate: (periodEnd) => {
      const { y, m } = parseIso(periodEnd);
      if (m === 3) return `${y}-05-07`;
      if (m === 11) return `${y + 1}-01-15`;
      return dayOfMonthAfter(periodEnd, 1, 28);
    },
    notes: [
      "Boxes 8 and 12 use IRD's 3/23 fraction of the GST-inclusive totals, exactly as the form does, so they can differ by a few cents from the GST recorded line by line.",
    ],
  },
  notes: [
    "You must register for GST once your turnover exceeds, or is expected to exceed, $60,000 in 12 months. Below that, registering is optional.",
    "Olune Books prepares the GST101A figures; you still file them in myIR (or your agent does).",
  ],
  reviewedAt: "2026-10-01",
};
