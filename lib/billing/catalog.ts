// ============================================================================
//  Loading the billing catalogue (supabase/migrations/0105).
//
//  Server-authoritative by construction: every read is filtered by studio_id
//  and prices are never accepted from a caller — the same rule
//  lib/enrollment-class-price.ts already sets for class fees. A client can ask
//  "bill product X, quantity 2"; it can never say what X costs.
//
//  Pure pricing maths lives in lib/billing/pricing.ts so it can be tested and
//  reused in the browser; this file only fetches and maps.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  BillingProduct,
  LedgerCodeOverride,
  LedgerProvider,
  PackageComponent,
  PriceTier,
  PricingModel,
  ProductCategory,
  RecurringInterval,
  TaxTreatment,
} from "./types";

const PRODUCT_COLUMNS = `
  id, studio_id, name, code, description, category, pricing_model,
  unit_amount_cents, unit_label, min_units, increment_units,
  credit_count, credit_expiry_days, recurring_interval, recurring_interval_count,
  term_id, tax_treatment, tax_rate_bp, account_code, item_code,
  active, sort_order,
  billing_price_tiers ( id, min_quantity, unit_amount_cents, discount_bp, sort_order ),
  billing_product_components ( id, component_product_id, quantity, sort_order ),
  billing_product_ledger_codes ( provider, account_code, item_code, tax_code, tracking_option )
`;

type RawProduct = Record<string, unknown>;

function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function nullableNum(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapTiers(raw: unknown): PriceTier[] {
  return ((raw ?? []) as RawProduct[])
    .map((t) => ({
      id: String(t.id),
      minQuantity: num(t.min_quantity, 0),
      unitAmountCents: nullableNum(t.unit_amount_cents),
      discountBp: nullableNum(t.discount_bp),
      sortOrder: num(t.sort_order, 0),
    }))
    .sort((a, b) => a.minQuantity - b.minQuantity);
}

function mapComponents(raw: unknown): PackageComponent[] {
  return ((raw ?? []) as RawProduct[])
    .map((c) => ({
      id: String(c.id),
      componentProductId: String(c.component_product_id),
      componentName: null,
      quantity: num(c.quantity, 1),
      sortOrder: num(c.sort_order, 0),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapLedgerCodes(raw: unknown): LedgerCodeOverride[] {
  return ((raw ?? []) as RawProduct[]).map((l) => ({
    provider: l.provider as LedgerProvider,
    accountCode: (l.account_code as string | null) ?? null,
    itemCode: (l.item_code as string | null) ?? null,
    taxCode: (l.tax_code as string | null) ?? null,
    trackingOption: (l.tracking_option as string | null) ?? null,
  }));
}

export function mapProduct(row: RawProduct): BillingProduct {
  return {
    id: String(row.id),
    studioId: String(row.studio_id),
    name: (row.name as string) ?? "",
    code: (row.code as string) ?? "",
    description: (row.description as string | null) ?? null,
    category: ((row.category as string) ?? "other") as ProductCategory,
    pricingModel: ((row.pricing_model as string) ?? "one_off") as PricingModel,
    unitAmountCents: num(row.unit_amount_cents, 0),
    unitLabel: (row.unit_label as string | null) ?? null,
    minUnits: nullableNum(row.min_units),
    incrementUnits: nullableNum(row.increment_units),
    creditCount: nullableNum(row.credit_count),
    creditExpiryDays: nullableNum(row.credit_expiry_days),
    recurringInterval: (row.recurring_interval as RecurringInterval | null) ?? null,
    recurringIntervalCount: num(row.recurring_interval_count, 1),
    termId: (row.term_id as string | null) ?? null,
    taxTreatment: ((row.tax_treatment as string) ?? "standard") as TaxTreatment,
    taxRateBp: num(row.tax_rate_bp, 1500),
    accountCode: (row.account_code as string | null) ?? null,
    itemCode: (row.item_code as string | null) ?? null,
    active: row.active !== false,
    sortOrder: num(row.sort_order, 0),
    tiers: mapTiers(row.billing_price_tiers),
    components: mapComponents(row.billing_product_components),
    ledgerCodes: mapLedgerCodes(row.billing_product_ledger_codes),
  };
}

/** Fills in componentName so package detail lines read properly. */
function nameComponents(products: BillingProduct[]): BillingProduct[] {
  const byId = new Map(products.map((p) => [p.id, p.name]));
  for (const product of products) {
    for (const component of product.components) {
      component.componentName = byId.get(component.componentProductId) ?? null;
    }
  }
  return products;
}

export async function loadStudioProducts(
  supabase: SupabaseClient,
  studioId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<BillingProduct[]> {
  let query = supabase.from("billing_products").select(PRODUCT_COLUMNS).eq("studio_id", studioId);
  if (!opts.includeArchived) query = query.eq("active", true);

  const { data } = await query;
  const products = ((data ?? []) as RawProduct[]).map(mapProduct);
  products.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  return nameComponents(products);
}

/** Single product, tenant-scoped. Returns null when it belongs to another studio. */
export async function loadProduct(
  supabase: SupabaseClient,
  studioId: string,
  productId: string,
): Promise<BillingProduct | null> {
  const { data } = await supabase
    .from("billing_products")
    .select(PRODUCT_COLUMNS)
    .eq("id", productId)
    .eq("studio_id", studioId)
    .maybeSingle();

  return data ? mapProduct(data as RawProduct) : null;
}

/** Look a product up by its studio SKU — how the seeded PASS-DROPIN etc. are found. */
export async function loadProductByCode(
  supabase: SupabaseClient,
  studioId: string,
  code: string,
): Promise<BillingProduct | null> {
  const { data } = await supabase
    .from("billing_products")
    .select(PRODUCT_COLUMNS)
    .eq("studio_id", studioId)
    .ilike("code", code)
    .eq("active", true)
    .maybeSingle();

  return data ? mapProduct(data as RawProduct) : null;
}

/** Batch load, keyed by id. Missing or cross-tenant ids are simply absent. */
export async function loadProducts(
  supabase: SupabaseClient,
  studioId: string,
  productIds: string[],
): Promise<Map<string, BillingProduct>> {
  const result = new Map<string, BillingProduct>();
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return result;

  const { data } = await supabase
    .from("billing_products")
    .select(PRODUCT_COLUMNS)
    .eq("studio_id", studioId)
    .in("id", ids);

  const products = nameComponents(((data ?? []) as RawProduct[]).map(mapProduct));
  for (const product of products) result.set(product.id, product);
  return result;
}

export type StudioTaxSettings = {
  /** Drives invoice-level lineAmountTypes; see 0105's header for why it's studio-wide. */
  pricesIncludeTax: boolean;
  gstRegistered: boolean;
  gstNumber: string | null;
};

export const DEFAULT_TAX_SETTINGS: StudioTaxSettings = {
  pricesIncludeTax: true,
  gstRegistered: true,
  gstNumber: null,
};

export async function loadStudioTaxSettings(
  supabase: SupabaseClient,
  studioId: string,
): Promise<StudioTaxSettings> {
  const { data } = await supabase
    .from("studios")
    .select("prices_include_tax, gst_registered, gst_number")
    .eq("id", studioId)
    .maybeSingle();

  if (!data) return DEFAULT_TAX_SETTINGS;
  return {
    pricesIncludeTax: (data as RawProduct).prices_include_tax !== false,
    gstRegistered: (data as RawProduct).gst_registered !== false,
    gstNumber: ((data as RawProduct).gst_number as string | null) ?? null,
  };
}
