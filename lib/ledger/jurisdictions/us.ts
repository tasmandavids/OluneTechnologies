import { validUsEin } from "../tax-numbers";
import { box, dayOfMonthAfter, nilRate, rate } from "./helpers";
import type { Jurisdiction, RegionPack, TaxRateTemplate } from "./types";

// State-level base rates only. Counties, cities and special districts add their
// own on top, and a studio must add those as extra rates for where it sells.
// UT and VA include their statewide mandatory local add-on.
const STATES: [code: string, name: string, pct: number][] = [
  ["AL", "Alabama", 4], ["AK", "Alaska", 0], ["AZ", "Arizona", 5.6], ["AR", "Arkansas", 6.5],
  ["CA", "California", 7.25], ["CO", "Colorado", 2.9], ["CT", "Connecticut", 6.35], ["DE", "Delaware", 0],
  ["DC", "District of Columbia", 6.5], ["FL", "Florida", 6], ["GA", "Georgia", 4], ["HI", "Hawaii (GET)", 4],
  ["ID", "Idaho", 6], ["IL", "Illinois", 6.25], ["IN", "Indiana", 7], ["IA", "Iowa", 6], ["KS", "Kansas", 6.5],
  ["KY", "Kentucky", 6], ["LA", "Louisiana", 5], ["ME", "Maine", 5.5], ["MD", "Maryland", 6],
  ["MA", "Massachusetts", 6.25], ["MI", "Michigan", 6], ["MN", "Minnesota", 6.875], ["MS", "Mississippi", 7],
  ["MO", "Missouri", 4.225], ["MT", "Montana", 0], ["NE", "Nebraska", 5.5], ["NV", "Nevada", 6.85],
  ["NH", "New Hampshire", 0], ["NJ", "New Jersey", 6.625], ["NM", "New Mexico (GRT)", 4.875], ["NY", "New York", 4],
  ["NC", "North Carolina", 4.75], ["ND", "North Dakota", 5], ["OH", "Ohio", 5.75], ["OK", "Oklahoma", 4.5],
  ["OR", "Oregon", 0], ["PA", "Pennsylvania", 6], ["RI", "Rhode Island", 7], ["SC", "South Carolina", 6],
  ["SD", "South Dakota", 4.2], ["TN", "Tennessee", 7], ["TX", "Texas", 6.25], ["UT", "Utah", 6.1],
  ["VT", "Vermont", 6], ["VA", "Virginia", 5.3], ["WA", "Washington", 6.5], ["WV", "West Virginia", 6],
  ["WI", "Wisconsin", 5], ["WY", "Wyoming", 4],
];

const COMMON: TaxRateTemplate[] = [
  nilRate("EXEMPT", "Non-taxable / exempt sales", "exempt", "sales"),
  nilRate("RESALE", "Sales for resale", "zero", "sales"),
  // Sales tax paid on purchases is a cost in the US, not a credit.
  nilRate("NOTAX", "No sales tax", "out_of_scope"),
];

const REGIONS: RegionPack[] = STATES.map(([code, name, pct]) => ({
  code,
  name,
  taxRates:
    pct > 0
      ? [
          rate({
            code: "ST",
            name: `${name} state sales tax ${pct}%`,
            rateBp: Math.round(pct * 100 * 1000) / 1000,
            appliesTo: "sales",
            category: "standard",
            componentName: `${code} sales tax`,
            purchaseKey: null,
          }),
          ...COMMON,
        ]
      : COMMON,
  defaultSalesCode: pct > 0 ? "ST" : "EXEMPT",
  serviceSalesCode: "EXEMPT",
  defaultPurchaseCode: "NOTAX",
  note:
    pct > 0
      ? `${name}'s state rate is ${pct}%. Add your county/city rate as an extra tax rate if you collect it.`
      : `${name} has no statewide sales tax${code === "AK" ? " (some Alaskan boroughs levy their own)" : ""}.`,
}));

export const US: Jurisdiction = {
  code: "US",
  name: "United States",
  flag: "🇺🇸",
  currency: "USD",
  locale: "en-US",
  chartLanguage: "en",
  taxName: "Sales tax",
  taxAuthority: "Your state department of revenue",
  taxAuthorityUrl: "https://www.streamlinedsalestax.org/",
  taxNumber: {
    label: "EIN",
    placeholder: "12-3456789",
    validate: validUsEin,
    hint: "Your federal Employer Identification Number. State sales tax permits have their own formats.",
  },
  // Lessons are a non-taxable service in most states; registration is driven
  // by selling goods (costumes, merchandise) or by economic nexus.
  defaultRegistered: false,
  pricesIncludeTax: false,
  fiscalYearStart: { month: 1, day: 1 },
  filing: { frequencies: ["monthly", "quarterly", "annual"], default: "quarterly", defaultAnchorMonth: 1 },
  bases: [
    { id: "accrual", label: "Accrual basis", sales: "accrual", purchases: "accrual" },
    { id: "cash", label: "Cash basis (where your state allows it)", sales: "cash", purchases: "cash" },
  ],
  taxRates: COMMON,
  defaultSalesCode: "EXEMPT",
  serviceSalesCode: "EXEMPT",
  defaultPurchaseCode: "NOTAX",
  zeroSalesCode: "RESALE",
  exemptSalesCode: "EXEMPT",
  exemptPurchaseCode: "NOTAX",
  separateTaxAccounts: false,
  chartTerms: {
    taxOutput: "Sales tax payable",
    payrollTax: "Payroll taxes payable",
    retirement: "Employer retirement contributions (401k)",
    retirementPayable: "Retirement contributions payable",
    musicLicensing: "ASCAP / BMI / SESAC music licences",
  },
  regionLabel: "State",
  regions: REGIONS,
  returnForm: {
    code: "SALES-TAX",
    name: "Sales & use tax return",
    authority: "State department of revenue",
    authorityUrl: "https://www.streamlinedsalestax.org/",
    boxes: [
      box("GROSS", "Gross sales", (q) => q.net("sales", ["standard", "zero", "exempt", "export"])),
      box("EXEMPT", "Exempt and non-taxable sales", (q) => q.net("sales", ["zero", "exempt", "export"])),
      box("TAXABLE", "Taxable sales", (q) => q.box("GROSS") - q.box("EXEMPT")),
      box("TAX", "Sales tax collected", (q) => q.tax("sales"), { total: true }),
    ],
    net: (q) => q.box("TAX"),
    dueDate: (periodEnd) => dayOfMonthAfter(periodEnd, 1, 20),
    notes: ["Due dates vary by state (commonly the 20th of the following month). Check your state's calendar."],
  },
  notes: [
    "Dance instruction is a non-taxable service in most states, but costume and merchandise sales usually are. Your state's rules decide, and they change.",
    "Only the state base rate is set up. Add your county, city and district rates to collect the full combined rate.",
    "Federal and state income tax returns aren't prepared here; your P&L and balance sheet are what your preparer needs.",
  ],
  reviewedAt: "2026-10-01",
};
