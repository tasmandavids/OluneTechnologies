// ============================================================================
//  What a jurisdiction pack declares.
//
//  A pack is everything Olune Books needs to set a studio up so its books are
//  usable for that country's tax system on day one: currency, the tax's name
//  and rates, how the tax number is checked, when returns are due, which
//  accounting bases are allowed, a chart of accounts in the local idiom, and
//  the official return form's boxes.
//
//  Packs are DATA, applied once at setup and copied into the studio's own
//  rows. Changing a pack later never rewrites a studio's books — a rate change
//  is a new rate the studio adopts, not an edit to history.
//
//  Honesty rules for pack authors:
//    • Every figure here is "as at" `reviewedAt`. Rates and thresholds change;
//      the UI says so and links to the authority.
//    • A box we can't compute from the ledger (imports, reverse charge,
//      adjustments) is still listed so the form looks like the real one, with
//      `manual: true` — the studio fills it in. Never invent a number.
// ============================================================================

import type {
  FilingFrequency,
  SystemKey,
  TaxBasis,
  TaxComponent,
  TaxReportCategory,
} from "../types";

export type TaxRateTemplate = {
  code: string;
  name: string;
  rateBp: number;
  appliesTo: "sales" | "purchases" | "both";
  reportCategory: TaxReportCategory;
  /** Omit for a single component posting to tax_collected / tax_paid. */
  components?: TaxComponent[];
};

export type ChartLanguage = "en" | "fr" | "de" | "es" | "it" | "nl" | "ja" | "ko";

export type BasisOption = {
  id: string;
  label: string;
  sales: TaxBasis;
  purchases: TaxBasis;
  hint?: string;
};

export type TaxReturnEntry = {
  direction: "sales" | "purchases";
  category: TaxReportCategory;
  rateCode: string;
  rateBp: number;
  netCents: number;
  taxCents: number;
  /** The tax split by component name, for rates with more than one. */
  componentTax: Record<string, number>;
};

/** Read-side helpers handed to each box's `compute`. */
export type ReturnQuery = {
  entries: TaxReturnEntry[];
  net(direction: "sales" | "purchases", categories?: TaxReportCategory[]): number;
  tax(direction: "sales" | "purchases", categories?: TaxReportCategory[]): number;
  gross(direction: "sales" | "purchases", categories?: TaxReportCategory[]): number;
  netAtRate(direction: "sales" | "purchases", rateBp: number): number;
  taxAtRate(direction: "sales" | "purchases", rateBp: number): number;
  componentTax(direction: "sales" | "purchases", componentNames: string[]): number;
  /** Values of boxes computed earlier in the form, by id. */
  box(id: string): number;
};

export type ReturnBox = {
  id: string;
  label: string;
  /** Section heading this box sits under on the official form. */
  section?: string;
  /** Not derivable from the ledger; shown as 0 with a "enter manually" hint. */
  manual?: boolean;
  /** A total/result line — rendered emphasised. */
  total?: boolean;
  compute: (q: ReturnQuery) => number;
};

export type ReturnForm = {
  code: string;
  name: string;
  authority: string;
  authorityUrl: string;
  boxes: ReturnBox[];
  /** Amount payable (positive) or refundable (negative) for the period. */
  net: (q: ReturnQuery) => number;
  /** ISO date the return for a period ending `periodEnd` is due (best estimate). */
  dueDate: (periodEnd: string, frequency: FilingFrequency) => string;
  notes?: string[];
};

export type RegionPack = {
  code: string;
  name: string;
  /** Replaces the national sales rate list when this region is chosen. */
  taxRates: TaxRateTemplate[];
  defaultSalesCode: string;
  serviceSalesCode?: string;
  defaultPurchaseCode: string;
  /** Extra liability accounts, e.g. provincial sales tax payable. */
  extraTaxAccount?: { name: string; key: SystemKey };
  note?: string;
};

export type TaxNumberSpec = {
  label: string;
  placeholder: string;
  /** True when the number is well formed and its check digit (if any) holds. */
  validate: (raw: string) => boolean;
  normalise?: (raw: string) => string;
  hint?: string;
};

export type Threshold = {
  amount: number;
  currency: string;
  label: string;
};

export type Jurisdiction = {
  code: string;
  name: string;
  flag: string;
  currency: string;
  /** BCP-47 locale for number/date formatting in reports. */
  locale: string;
  chartLanguage: ChartLanguage;
  /** "GST", "VAT", "Sales tax", "TVA", "MwSt", "消費税"… */
  taxName: string;
  taxAuthority: string;
  taxAuthorityUrl: string;
  taxNumber: TaxNumberSpec;
  registrationThreshold?: Threshold;
  /** Studios here usually aren't registered (US: lessons rarely taxable). */
  defaultRegistered: boolean;
  pricesIncludeTax: boolean;
  fiscalYearStart: { month: number; day: number };
  filing: {
    frequencies: FilingFrequency[];
    default: FilingFrequency;
    /** Month the default cycle's first period starts in. */
    defaultAnchorMonth?: number;
  };
  bases: BasisOption[];
  taxRates: TaxRateTemplate[];
  defaultSalesCode: string;
  /** Tuition and lessons, where they're treated differently from goods (US, KR). */
  serviceSalesCode?: string;
  defaultPurchaseCode: string;
  zeroSalesCode: string;
  exemptSalesCode: string;
  exemptPurchaseCode: string;
  /** Separate output/input tax accounts plus a settlement account (EU style). */
  separateTaxAccounts: boolean;
  /** Local names for tax and payroll accounts in the generated chart. */
  chartTerms: {
    taxOutput: string;
    taxInput?: string;
    taxSettlement?: string;
    /** Second output/input accounts, where a second rate posts separately (DE 7%). */
    taxOutput2?: string;
    taxInput2?: string;
    payrollTax: string;
    retirement: string;
    retirementPayable: string;
    musicLicensing: string;
  };
  regionLabel?: string;
  regions?: RegionPack[];
  returnForm: ReturnForm;
  /** Things a studio owner should know before relying on the setup. */
  notes: string[];
  reviewedAt: string;
};
