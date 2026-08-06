// ============================================================================
//  Shared shapes for the billing catalogue (supabase/migrations/0105).
//
//  Client-safe on purpose — the Products UI, the invoice line-item editor and
//  the server actions all need these, so nothing in here may import
//  "server-only" or reach for a Supabase client. Data loading lives in
//  lib/billing/catalog.ts, pure pricing maths in lib/billing/pricing.ts.
// ============================================================================

export const PRICING_MODELS = [
  "one_off",
  "hourly",
  "per_session",
  "pass",
  "recurring",
  "term",
  "package",
  "hours_ladder",
] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const PRODUCT_CATEGORIES = ["tuition", "fee", "pass", "hire", "retail", "other"] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];

export const TAX_TREATMENTS = ["standard", "zero_rated", "exempt"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export const RECURRING_INTERVALS = ["week", "fortnight", "month", "term", "year"] as const;
export type RecurringInterval = (typeof RECURRING_INTERVALS)[number];

export const LEDGER_PROVIDERS = ["xero", "quickbooks", "myob"] as const;
export type LedgerProvider = (typeof LEDGER_PROVIDERS)[number];

/** A volume break. Exactly one of unitAmountCents / discountBp is set (DB check). */
export type PriceTier = {
  id: string;
  minQuantity: number;
  unitAmountCents: number | null;
  discountBp: number | null;
  sortOrder: number;
};

/** One row of an `hours_ladder` rate card: from this many hours, this total. */
export type HourBandRow = {
  id: string;
  minHours: number;
  totalCents: number;
  sortOrder: number;
};

/** What a `package` product entitles the buyer to. */
export type PackageComponent = {
  id: string;
  componentProductId: string;
  componentName: string | null;
  quantity: number;
  sortOrder: number;
};

export type LedgerCodeOverride = {
  provider: LedgerProvider;
  accountCode: string | null;
  itemCode: string | null;
  taxCode: string | null;
  trackingOption: string | null;
};

export type BillingProduct = {
  id: string;
  studioId: string;
  name: string;
  /** Studio SKU. Doubles as the ledger item code when itemCode is null. */
  code: string;
  description: string | null;
  category: ProductCategory;
  pricingModel: PricingModel;
  unitAmountCents: number;
  unitLabel: string | null;
  minUnits: number | null;
  incrementUnits: number | null;
  creditCount: number | null;
  creditExpiryDays: number | null;
  recurringInterval: RecurringInterval | null;
  recurringIntervalCount: number;
  termId: string | null;
  taxTreatment: TaxTreatment;
  taxRateBp: number;
  accountCode: string | null;
  itemCode: string | null;
  /** hours_ladder: cost of each hour past the last band. Null caps at it. */
  overflowRateCents: number | null;
  /** package: fire automatically when a basket satisfies it. */
  autoApply: boolean;
  active: boolean;
  sortOrder: number;
  tiers: PriceTier[];
  hourBands: HourBandRow[];
  components: PackageComponent[];
  ledgerCodes: LedgerCodeOverride[];
};

/** One priced invoice line, ready to freeze onto invoice_line_items. */
export type PricedLine = {
  productId: string | null;
  description: string;
  quantity: number;
  unitCents: number;
  lineTotalCents: number;
  unitLabel: string | null;
  taxTreatment: TaxTreatment;
  taxRateBp: number;
  accountCode: string | null;
  itemCode: string | null;
};

/** Which extra fields a pricing model actually uses — drives the editor form. */
export const MODEL_FIELDS: Record<
  PricingModel,
  {
    units?: boolean;
    credits?: boolean;
    recurrence?: boolean;
    term?: boolean;
    components?: boolean;
    hourBands?: boolean;
  }
> = {
  one_off: {},
  hourly: { units: true },
  per_session: {},
  pass: { credits: true },
  recurring: { recurrence: true },
  term: { term: true },
  package: { components: true },
  // The rate card has its own editor on the Products tab rather than living in
  // the product slide-over — it's the studio's whole pricing model, not a field.
  hours_ladder: { hourBands: true },
};
