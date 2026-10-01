// ============================================================================
//  Olune Books — shared shapes.
//
//  Client-safe: the setup wizard, the reports and the server actions all need
//  these, so nothing here may import "server-only" or a Supabase client.
//  Schema: supabase/migrations/20261001120000_olune_books.sql.
// ============================================================================

export const ACCOUNT_TYPES = ["asset", "liability", "equity", "revenue", "expense"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_SUBTYPES = {
  asset: ["bank", "current_asset", "receivable", "inventory", "fixed_asset", "non_current_asset"],
  liability: ["current_liability", "payable", "tax", "non_current_liability"],
  equity: ["equity", "retained_earnings"],
  revenue: ["revenue", "other_income"],
  expense: ["direct_cost", "expense", "depreciation", "other_expense"],
} as const satisfies Record<AccountType, readonly string[]>;

export type AccountSubtype = (typeof ACCOUNT_SUBTYPES)[AccountType][number];

export function accountTypeOf(subtype: AccountSubtype): AccountType {
  for (const type of ACCOUNT_TYPES) {
    if ((ACCOUNT_SUBTYPES[type] as readonly string[]).includes(subtype)) return type;
  }
  throw new Error(`Unknown account subtype: ${subtype}`);
}

/** Debit-normal accounts grow with debits; the rest grow with credits. */
export function isDebitNormal(type: AccountType): boolean {
  return type === "asset" || type === "expense";
}

export const BANK_KINDS = ["bank", "clearing", "cash", "credit_card"] as const;
export type BankKind = (typeof BANK_KINDS)[number];

/**
 * Accounts the posting engine addresses by role rather than by code, so a
 * studio can renumber or rename its chart without breaking auto-posting.
 */
export const SYSTEM_KEYS = [
  "bank",
  "stripe_clearing",
  "undeposited",
  "ar",
  "ap",
  "tax_collected",
  "tax_paid",
  "tax_collected_2",
  "tax_paid_2",
  "tax_settlement",
  "sales",
  "class_passes",
  "retained_earnings",
  "opening_balance",
  "owner_funds",
  "bank_fees",
  "rounding",
  "suspense",
] as const;
export type SystemKey = (typeof SYSTEM_KEYS)[number];

/** When a system key isn't on the chart, which one stands in for it. */
export const SYSTEM_KEY_FALLBACKS: Partial<Record<SystemKey, SystemKey[]>> = {
  tax_paid: ["tax_collected"],
  tax_settlement: ["tax_collected"],
  tax_collected_2: ["tax_collected"],
  // A recoverable second tax (Québec QST) offsets its own payable account.
  tax_paid_2: ["tax_collected_2", "tax_paid", "tax_collected"],
  stripe_clearing: ["bank"],
  undeposited: ["bank"],
  opening_balance: ["retained_earnings"],
  rounding: ["suspense"],
  class_passes: ["sales"],
};

/**
 * Account codes Olune itself stamps on invoice lines when a product has none
 * (DEFAULT_XERO_SETTINGS' "200", class passes' "200-01"). A chart that numbers
 * differently (PCG, SKR03…) still routes them to the right account.
 */
export const OLUNE_CODE_ALIASES: Record<string, SystemKey> = {
  "200": "sales",
  "200-01": "class_passes",
};

export const FILING_FREQUENCIES = ["monthly", "bimonthly", "quarterly", "six_monthly", "annual"] as const;
export type FilingFrequency = (typeof FILING_FREQUENCIES)[number];

export const FREQUENCY_MONTHS: Record<FilingFrequency, number> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  six_monthly: 6,
  annual: 12,
};

export const TAX_BASES = ["accrual", "cash"] as const;
export type TaxBasis = (typeof TAX_BASES)[number];

export const TAX_REPORT_CATEGORIES = [
  "standard",
  "reduced",
  "second_reduced",
  "super_reduced",
  "zero",
  "exempt",
  "export",
  "capital",
  "import",
  "out_of_scope",
  "reverse_charge",
] as const;
export type TaxReportCategory = (typeof TAX_REPORT_CATEGORIES)[number];

export type TaxComponent = {
  name: string;
  rateBp: number;
  salesAccountKey: SystemKey;
  /** Null: not recoverable on purchases, so it's added to the expense instead. */
  purchaseAccountKey: SystemKey | null;
};

export type TaxRate = {
  id: string;
  code: string;
  name: string;
  rateBp: number;
  appliesTo: "sales" | "purchases" | "both";
  reportCategory: TaxReportCategory;
  components: TaxComponent[];
  isSystem: boolean;
  isArchived: boolean;
  sortOrder: number;
};

export type LedgerAccount = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  subtype: AccountSubtype;
  systemKey: SystemKey | null;
  description: string | null;
  defaultTaxRateId: string | null;
  bankKind: BankKind | null;
  bankNumber: string | null;
  isArchived: boolean;
  autoCreated: boolean;
};

export type LedgerSettings = {
  studioId: string;
  jurisdiction: string;
  region: string | null;
  baseCurrency: string;
  customCountryName: string | null;
  customTaxName: string | null;
  taxRegistered: boolean;
  taxNumber: string | null;
  taxScheme: string | null;
  salesTaxBasis: TaxBasis;
  purchasesTaxBasis: TaxBasis;
  filingFrequency: FilingFrequency;
  taxPeriodAnchorMonth: number;
  fiscalYearStartMonth: number;
  fiscalYearStartDay: number;
  conversionDate: string;
  lockDate: string | null;
  pricesIncludeTax: boolean;
  autoPost: boolean;
  packVersion: number;
  lastSyncedAt: string | null;
  lastSyncError: string | null;
};

export const JOURNAL_SOURCE_TYPES = [
  "manual",
  "opening_balance",
  "invoice",
  "invoice_payment",
  "invoice_manual_payment",
  "refund",
  "order",
  "ticket",
  "bill",
  "bill_payment",
  "bank",
  "transfer",
  "tax_settlement",
  "reversal",
] as const;
export type JournalSourceType = (typeof JOURNAL_SOURCE_TYPES)[number];

export type TaxTiming = "accrual" | "cash" | "settlement" | "none";

/** A line as the posting engine builds it, before it has a database id. */
export type DraftLine = {
  accountId: string;
  description?: string | null;
  debitCents: number;
  creditCents: number;
  taxRateId?: string | null;
  taxCents?: number;
  isTaxLine?: boolean;
  contactName?: string | null;
};

export type DraftJournal = {
  date: string;
  narration: string;
  reference?: string | null;
  sourceType: JournalSourceType;
  sourceId?: string | null;
  sourceHash?: string | null;
  taxTiming: TaxTiming;
  grossCents?: number | null;
  settlesJournalId?: string | null;
  settlesAmountCents?: number | null;
  contactName?: string | null;
  lines: DraftLine[];
};

export type JournalLineRow = {
  id: string;
  lineNo: number;
  accountId: string;
  description: string | null;
  debitCents: number;
  creditCents: number;
  taxRateId: string | null;
  taxCents: number;
  isTaxLine: boolean;
  contactName: string | null;
  reconciledBankTxnId: string | null;
};

export type JournalRow = {
  id: string;
  journalNumber: number;
  date: string;
  narration: string;
  reference: string | null;
  sourceType: JournalSourceType;
  sourceId: string | null;
  taxTiming: TaxTiming;
  status: "posted" | "voided";
  supersededBy: string | null;
  reversesJournalId: string | null;
  contactName: string | null;
  voidReason: string | null;
  createdAt: string;
  totalCents: number;
};

/** One row of ledger_account_balances. */
export type AccountMovement = {
  accountId: string;
  debitCents: number;
  creditCents: number;
};

/** One row of ledger_tax_summary. */
export type TaxSummaryRow = {
  basis: TaxBasis;
  direction: "sales" | "purchases";
  taxRateId: string;
  netCents: number;
  taxCents: number;
};
