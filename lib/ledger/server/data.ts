import "server-only";

// ============================================================================
//  Olune Books — data access.
//
//  Thin mappers between ledger_* rows and lib/ledger/types. Every query is
//  studio-scoped explicitly as well as by RLS, so the same functions are safe
//  from the service-role cron (no RLS) and from an admin's session.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { getRegion, resolveJurisdiction } from "../jurisdictions";
import type { Jurisdiction, RegionPack } from "../jurisdictions/types";
import { ChartIndex } from "../posting";
import type {
  AccountMovement,
  LedgerAccount,
  LedgerSettings,
  TaxRate,
  TaxSummaryRow,
} from "../types";

type Row = Record<string, unknown>;

export function mapSettings(r: Row): LedgerSettings {
  return {
    studioId: r.studio_id as string,
    jurisdiction: r.jurisdiction as string,
    region: (r.region as string | null) ?? null,
    baseCurrency: r.base_currency as string,
    customCountryName: (r.custom_country_name as string | null) ?? null,
    customTaxName: (r.custom_tax_name as string | null) ?? null,
    taxRegistered: r.tax_registered as boolean,
    taxNumber: (r.tax_number as string | null) ?? null,
    taxScheme: (r.tax_scheme as string | null) ?? null,
    salesTaxBasis: r.sales_tax_basis as LedgerSettings["salesTaxBasis"],
    purchasesTaxBasis: r.purchases_tax_basis as LedgerSettings["purchasesTaxBasis"],
    filingFrequency: r.filing_frequency as LedgerSettings["filingFrequency"],
    taxPeriodAnchorMonth: Number(r.tax_period_anchor_month),
    fiscalYearStartMonth: Number(r.fiscal_year_start_month),
    fiscalYearStartDay: Number(r.fiscal_year_start_day),
    conversionDate: r.conversion_date as string,
    lockDate: (r.lock_date as string | null) ?? null,
    pricesIncludeTax: r.prices_include_tax as boolean,
    autoPost: r.auto_post as boolean,
    packVersion: Number(r.pack_version),
    lastSyncedAt: (r.last_synced_at as string | null) ?? null,
    lastSyncError: (r.last_sync_error as string | null) ?? null,
  };
}

export function mapAccount(r: Row): LedgerAccount {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    type: r.type as LedgerAccount["type"],
    subtype: r.subtype as LedgerAccount["subtype"],
    systemKey: (r.system_key as LedgerAccount["systemKey"]) ?? null,
    description: (r.description as string | null) ?? null,
    defaultTaxRateId: (r.default_tax_rate_id as string | null) ?? null,
    bankKind: (r.bank_kind as LedgerAccount["bankKind"]) ?? null,
    bankNumber: (r.bank_number as string | null) ?? null,
    isArchived: !!r.is_archived,
    autoCreated: !!r.auto_created,
  };
}

export function mapTaxRate(r: Row): TaxRate {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    rateBp: Number(r.rate_bp),
    appliesTo: r.applies_to as TaxRate["appliesTo"],
    reportCategory: r.report_category as TaxRate["reportCategory"],
    components: ((r.components as TaxRate["components"]) ?? []).map((c) => ({ ...c, rateBp: Number(c.rateBp) })),
    isSystem: !!r.is_system,
    isArchived: !!r.is_archived,
    sortOrder: Number(r.sort_order ?? 0),
  };
}

const SETTINGS_COLS =
  "studio_id, jurisdiction, region, base_currency, custom_country_name, custom_tax_name, tax_registered, tax_number, tax_scheme, sales_tax_basis, purchases_tax_basis, filing_frequency, tax_period_anchor_month, fiscal_year_start_month, fiscal_year_start_day, conversion_date, lock_date, prices_include_tax, auto_post, pack_version, last_synced_at, last_sync_error";

export const ACCOUNT_COLS =
  "id, code, name, type, subtype, system_key, description, default_tax_rate_id, bank_kind, bank_number, is_archived, auto_created";

export const RATE_COLS = "id, code, name, rate_bp, applies_to, report_category, components, is_system, is_archived, sort_order";

export async function loadLedgerSettings(supabase: SupabaseClient, studioId: string): Promise<LedgerSettings | null> {
  const { data, error } = await supabase.from("ledger_settings").select(SETTINGS_COLS).eq("studio_id", studioId).maybeSingle();
  if (error) {
    // The table not existing yet (migration not applied) reads as "not set up".
    if (error.code === "42P01" || error.code === "PGRST205") return null;
    throw new Error(`Unable to load Olune Books settings: ${error.message}`);
  }
  return data ? mapSettings(data as Row) : null;
}

export async function loadAccounts(supabase: SupabaseClient, studioId: string): Promise<LedgerAccount[]> {
  const { data, error } = await supabase.from("ledger_accounts").select(ACCOUNT_COLS).eq("studio_id", studioId).order("code");
  if (error) throw new Error(`Unable to load the chart of accounts: ${error.message}`);
  return (data ?? []).map((r) => mapAccount(r as Row));
}

export async function loadTaxRates(supabase: SupabaseClient, studioId: string): Promise<TaxRate[]> {
  const { data, error } = await supabase.from("ledger_tax_rates").select(RATE_COLS).eq("studio_id", studioId).order("sort_order");
  if (error) throw new Error(`Unable to load tax rates: ${error.message}`);
  return (data ?? []).map((r) => mapTaxRate(r as Row));
}

export type BooksContext = {
  settings: LedgerSettings;
  jurisdiction: Jurisdiction;
  region: RegionPack | null;
  accounts: LedgerAccount[];
  rates: TaxRate[];
  chart: ChartIndex;
};

export function jurisdictionFor(settings: LedgerSettings, rates: TaxRate[]): Jurisdiction {
  const std = rates.find((r) => r.code === "STD");
  const red = rates.find((r) => r.code === "RED");
  return resolveJurisdiction(settings.jurisdiction, {
    countryName: settings.customCountryName ?? "",
    currency: settings.baseCurrency,
    taxName: settings.customTaxName ?? "Tax",
    standardRateBp: std?.rateBp ?? 0,
    reducedRateBp: red?.rateBp ?? null,
  });
}

export function buildChartIndex(settings: LedgerSettings, j: Jurisdiction, region: RegionPack | null, accounts: LedgerAccount[], rates: TaxRate[]): ChartIndex {
  return new ChartIndex(accounts, rates, {
    taxRegistered: settings.taxRegistered,
    defaultSalesCode: region?.defaultSalesCode ?? j.defaultSalesCode,
    zeroSalesCode: j.zeroSalesCode,
    exemptSalesCode: j.exemptSalesCode,
  });
}

/** Everything a Books page needs about the studio's setup, or null if Books isn't on. */
/** Is Olune Books the studio's accounting choice (studios.accounting_provider)? */
export async function booksIsChosen(supabase: SupabaseClient, studioId: string): Promise<boolean> {
  const { data } = await supabase.from("studios").select("accounting_provider").eq("id", studioId).maybeSingle();
  return data?.accounting_provider === "olune";
}

/**
 * Books' working context — null unless Books is set up AND is the studio's
 * accounting choice. A studio that switched to Xero keeps its ledger rows
 * (journals are immutable, filed returns are history) but nothing may post to
 * them; `includePaused` is only for reading them back out (the CSV export).
 */
export async function loadBooksContext(
  supabase: SupabaseClient,
  studioId: string,
  opts: { includePaused?: boolean } = {},
): Promise<BooksContext | null> {
  const [settings, chosen] = await Promise.all([
    loadLedgerSettings(supabase, studioId),
    opts.includePaused ? Promise.resolve(true) : booksIsChosen(supabase, studioId),
  ]);
  if (!settings || !chosen) return null;
  const [accounts, rates] = await Promise.all([loadAccounts(supabase, studioId), loadTaxRates(supabase, studioId)]);
  const jurisdiction = jurisdictionFor(settings, rates);
  const region = getRegion(jurisdiction, settings.region);
  return { settings, jurisdiction, region, accounts, rates, chart: buildChartIndex(settings, jurisdiction, region, accounts, rates) };
}

export async function fetchMovements(supabase: SupabaseClient, studioId: string, from: string | null, to: string): Promise<AccountMovement[]> {
  const { data, error } = await supabase.rpc("ledger_account_balances", { p_studio_id: studioId, p_from: from, p_to: to });
  if (error) throw new Error(`Unable to load account balances: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    accountId: r.account_id as string,
    debitCents: Number(r.debit_cents),
    creditCents: Number(r.credit_cents),
  }));
}

export async function fetchTaxSummary(supabase: SupabaseClient, studioId: string, from: string, to: string): Promise<TaxSummaryRow[]> {
  const { data, error } = await supabase.rpc("ledger_tax_summary", { p_studio_id: studioId, p_from: from, p_to: to });
  if (error) throw new Error(`Unable to load the tax summary: ${error.message}`);
  return ((data ?? []) as Row[]).map((r) => ({
    basis: r.basis as TaxSummaryRow["basis"],
    direction: r.direction as TaxSummaryRow["direction"],
    taxRateId: r.tax_rate_id as string,
    netCents: Number(r.net_cents),
    taxCents: Number(r.tax_cents),
  }));
}

/** Page through a PostgREST query 1000 rows at a time (the API's row cap). */
export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  limit = 20_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < limit; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
