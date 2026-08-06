// ============================================================================
//  Server-authoritative class pricing for parent enrollment / auto-pay.
//  Never trust client-supplied priceCents — always load from the server.
//
//  Since the billing catalogue (0105) the price lives on the linked
//  billing_products row, not on classes.price_cents. The column is still read
//  as a fallback for classes that predate the backfill or were created without
//  a product — it is deprecated, not yet dropped, because class_capacity and
//  the Stripe price sync still reference it.
//
//  The returned ledger codes and tax treatment are what callers freeze onto
//  invoice_line_items, extending the 0082/0083 rule (a later reassignment must
//  never rewrite an already-sent invoice) from account codes to price and tax.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { hoursBetween } from "@/lib/billing/pricing";
import type { TaxTreatment } from "@/lib/billing/types";

export type ClassPriceRow = {
  id: string;
  name: string;
  priceCents: number;
  studioId: string;
  recurringGroupId: string | null;
  productId: string | null;
  accountCode: string | null;
  itemCode: string | null;
  taxTreatment: TaxTreatment;
  taxRateBp: number;
  /** Weekly hours, for studios pricing on an hours ladder. 0 with no end time. */
  hours: number;
};

const CLASS_PRICE_COLUMNS = `
  id, name, price_cents, studio_id, recurring_group_id, start_time, end_time,
  xero_account_code, xero_item_code, product_id,
  product:billing_products ( id, unit_amount_cents, account_code, item_code, tax_treatment, tax_rate_bp, active )
`;

type ClassProduct = {
  id: string;
  unit_amount_cents: number;
  account_code: string | null;
  item_code: string | null;
  tax_treatment: string | null;
  tax_rate_bp: number | null;
  active: boolean | null;
};

function mapClassRow(row: Record<string, unknown>): ClassPriceRow {
  // An archived product keeps its price for classes already pointing at it —
  // archiving is a "stop offering this" signal, not a licence to bill $0.
  const product = (row.product as unknown as ClassProduct | null) ?? null;

  return {
    id: row.id as string,
    name: (row.name as string) ?? "",
    priceCents: product ? Number(product.unit_amount_cents ?? 0) : Number(row.price_cents ?? 0),
    studioId: row.studio_id as string,
    recurringGroupId: (row.recurring_group_id as string | null) ?? null,
    productId: product?.id ?? null,
    accountCode: product?.account_code ?? (row.xero_account_code as string | null) ?? null,
    itemCode: product?.item_code ?? (row.xero_item_code as string | null) ?? null,
    taxTreatment: ((product?.tax_treatment as TaxTreatment | null) ?? "standard") as TaxTreatment,
    taxRateBp: Number(product?.tax_rate_bp ?? 1500),
    // classes.end_time is nullable, and a class without one can't be measured.
    // Counting it as zero is the honest answer; the Products screen warns a
    // studio how many of these they have before they switch to hours pricing.
    hours:
      row.start_time && row.end_time
        ? hoursBetween(row.start_time as string, row.end_time as string)
        : 0,
  };
}

/**
 * Load class fee + name from the DB, scoped to the caller's studio.
 * Returns null when the class is missing or belongs to another studio.
 */
export async function loadStudioClassPrice(
  supabase: SupabaseClient,
  studioId: string,
  classId: string,
): Promise<ClassPriceRow | null> {
  const { data } = await supabase
    .from("classes")
    .select(CLASS_PRICE_COLUMNS)
    .eq("id", classId)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!data) return null;

  return mapClassRow(data as Record<string, unknown>);
}

/** Batch variant — returns a map keyed by class id (missing ids omitted). */
export async function loadStudioClassPrices(
  supabase: SupabaseClient,
  studioId: string,
  classIds: string[],
): Promise<Map<string, ClassPriceRow>> {
  const result = new Map<string, ClassPriceRow>();
  if (!classIds.length) return result;

  const { data } = await supabase
    .from("classes")
    .select(CLASS_PRICE_COLUMNS)
    .eq("studio_id", studioId)
    .in("id", classIds);

  for (const row of data ?? []) {
    const mapped = mapClassRow(row as Record<string, unknown>);
    result.set(mapped.id, mapped);
  }

  return result;
}
