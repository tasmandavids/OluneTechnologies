"use server";

// ============================================================================
//  Money → Products server actions.
//
//  Every write re-checks studio + admin role in app code rather than leaning on
//  RLS alone (the belt-and-braces convention the rest of the admin actions
//  follow), and every product id that arrives from the client is re-read
//  tenant-scoped before it is used.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";
import { loadProduct } from "@/lib/billing/catalog";
import { STARTER_CATALOG } from "@/lib/billing/starter-catalog";
import {
  LEDGER_PROVIDERS,
  PRICING_MODELS,
  PRODUCT_CATEGORIES,
  RECURRING_INTERVALS,
  TAX_TREATMENTS,
} from "@/lib/billing/types";

export type ProductActionResult = { ok: true } | { ok: false; error: string };

async function getAdminStudio() {
  const ctx = await getAdminStudioAccess();
  return { error: ctx.error, supabase: ctx.supabase, studioId: ctx.studioId };
}

/** SKUs are stored as typed but compared case-insensitively (0105 unique index). */
function normaliseCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "-").slice(0, 40);
}

const ProductSchema = z.object({
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().min(1).max(40),
  description: z.string().trim().max(300).optional(),
  category: z.enum(PRODUCT_CATEGORIES),
  pricingModel: z.enum(PRICING_MODELS),
  unitAmountCents: z.number().int().nonnegative().max(100_000_00),
  unitLabel: z.string().trim().max(30).optional(),
  minUnits: z.number().positive().max(999).optional(),
  incrementUnits: z.number().positive().max(999).optional(),
  creditCount: z.number().int().positive().max(999).optional(),
  creditExpiryDays: z.number().int().positive().max(3650).optional(),
  recurringInterval: z.enum(RECURRING_INTERVALS).optional(),
  recurringIntervalCount: z.number().int().positive().max(52).default(1),
  termId: z.string().uuid().optional(),
  taxTreatment: z.enum(TAX_TREATMENTS).default("standard"),
  taxRateBp: z.number().int().min(0).max(10_000).default(1500),
  accountCode: z.string().trim().max(40).optional(),
  itemCode: z.string().trim().max(40).optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

export type ProductInput = z.infer<typeof ProductSchema>;

function toRow(studioId: string, input: ProductInput) {
  return {
    studio_id: studioId,
    name: input.name,
    code: normaliseCode(input.code),
    description: input.description || null,
    category: input.category,
    pricing_model: input.pricingModel,
    unit_amount_cents: input.unitAmountCents,
    unit_label: input.unitLabel || null,
    // Model-specific columns are cleared when they don't apply, so switching a
    // product from hourly to one-off can't leave a stale minimum behind.
    min_units: input.pricingModel === "hourly" ? input.minUnits ?? null : null,
    increment_units: input.pricingModel === "hourly" ? input.incrementUnits ?? null : null,
    credit_count: input.pricingModel === "pass" ? input.creditCount ?? null : null,
    credit_expiry_days: input.pricingModel === "pass" ? input.creditExpiryDays ?? null : null,
    recurring_interval: input.pricingModel === "recurring" ? input.recurringInterval ?? null : null,
    recurring_interval_count:
      input.pricingModel === "recurring" ? input.recurringIntervalCount : 1,
    term_id: input.pricingModel === "term" ? input.termId ?? null : null,
    tax_treatment: input.taxTreatment,
    tax_rate_bp: input.taxRateBp,
    account_code: input.accountCode || null,
    item_code: input.itemCode || null,
    sort_order: input.sortOrder,
  };
}

function duplicateCodeError(message: string): boolean {
  return /billing_products_studio_code_key|duplicate key/i.test(message);
}

export async function createProduct(
  input: ProductInput,
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the product details and try again." };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data, error: insErr } = await supabase
    .from("billing_products")
    .insert(toRow(studioId, parsed.data))
    .select("id")
    .single();

  if (insErr || !data) {
    return {
      ok: false,
      error: duplicateCodeError(insErr?.message ?? "")
        ? "That code is already used by another product."
        : insErr?.message ?? "Could not create product.",
    };
  }

  revalidatePath("/portal/admin/money");
  return { ok: true, productId: data.id as string };
}

export async function updateProduct(
  productId: string,
  input: ProductInput,
): Promise<ProductActionResult> {
  if (!z.string().uuid().safeParse(productId).success) {
    return { ok: false, error: "Invalid product." };
  }
  const parsed = ProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the product details and try again." };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { studio_id: _studioId, ...row } = toRow(studioId, parsed.data);

  const { error: updErr } = await supabase
    .from("billing_products")
    .update(row)
    .eq("id", productId)
    .eq("studio_id", studioId);

  if (updErr) {
    return {
      ok: false,
      error: duplicateCodeError(updErr.message)
        ? "That code is already used by another product."
        : updErr.message,
    };
  }

  // Classes bill from the product, but classes.price_cents is still read by the
  // class_capacity view and the Stripe price sync, so re-pricing a product has
  // to carry through to every class that bills against it. Without this the two
  // silently disagree the moment a studio changes a fee.
  await supabase
    .from("classes")
    .update({ price_cents: parsed.data.unitAmountCents })
    .eq("product_id", productId)
    .eq("studio_id", studioId);

  revalidatePath("/portal/admin/money");
  revalidatePath("/portal/admin/classes");
  return { ok: true };
}

/**
 * Archive rather than delete. Classes, passes and sent invoices reference
 * products, and a pass row's price is validated against its product by RLS
 * (0107) — deleting one would orphan live records.
 */
export async function setProductActive(
  productId: string,
  active: boolean,
): Promise<ProductActionResult> {
  if (!z.string().uuid().safeParse(productId).success) {
    return { ok: false, error: "Invalid product." };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: updErr } = await supabase
    .from("billing_products")
    .update({ active })
    .eq("id", productId)
    .eq("studio_id", studioId);

  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath("/portal/admin/money");
  return { ok: true };
}

export async function reorderProducts(orderedIds: string[]): Promise<ProductActionResult> {
  const parsed = z.array(z.string().uuid()).max(500).safeParse(orderedIds);
  if (!parsed.success) return { ok: false, error: "Invalid order." };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  for (const [index, id] of parsed.data.entries()) {
    await supabase
      .from("billing_products")
      .update({ sort_order: index })
      .eq("id", id)
      .eq("studio_id", studioId);
  }

  revalidatePath("/portal/admin/money");
  return { ok: true };
}

// ─── Volume tiers ────────────────────────────────────────────────────────────

const TierSchema = z
  .object({
    minQuantity: z.number().positive().max(999),
    unitAmountCents: z.number().int().nonnegative().max(100_000_00).optional(),
    discountBp: z.number().int().positive().max(10_000).optional(),
  })
  // Mirrors the DB check constraint: a tier states a price or a discount.
  .refine((t) => (t.unitAmountCents === undefined) !== (t.discountBp === undefined), {
    message: "Each tier needs either a price or a discount, not both.",
  });

export async function saveProductTiers(
  productId: string,
  tiers: z.infer<typeof TierSchema>[],
): Promise<ProductActionResult> {
  const parsed = z.array(TierSchema).max(10).safeParse(tiers);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid tiers." };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const product = await loadProduct(supabase, studioId, productId);
  if (!product) return { ok: false, error: "Product not found." };

  await supabase.from("billing_price_tiers").delete().eq("product_id", productId);

  if (parsed.data.length) {
    const { error: insErr } = await supabase.from("billing_price_tiers").insert(
      parsed.data
        .slice()
        .sort((a, b) => a.minQuantity - b.minQuantity)
        .map((t, idx) => ({
          product_id: productId,
          min_quantity: t.minQuantity,
          unit_amount_cents: t.unitAmountCents ?? null,
          discount_bp: t.discountBp ?? null,
          sort_order: idx,
        })),
    );
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/portal/admin/money");
  return { ok: true };
}

// ─── Package components ──────────────────────────────────────────────────────

const ComponentSchema = z.object({
  componentProductId: z.string().uuid(),
  quantity: z.number().positive().max(999),
});

export async function saveProductComponents(
  packageProductId: string,
  components: z.infer<typeof ComponentSchema>[],
): Promise<ProductActionResult> {
  const parsed = z.array(ComponentSchema).max(50).safeParse(components);
  if (!parsed.success) return { ok: false, error: "Invalid package contents." };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const pkg = await loadProduct(supabase, studioId, packageProductId);
  if (!pkg) return { ok: false, error: "Product not found." };

  // Every component must belong to this studio too, or a crafted payload could
  // pull another tenant's product into the package.
  const seen = new Set<string>();
  for (const component of parsed.data) {
    if (component.componentProductId === packageProductId) {
      return { ok: false, error: "A package can't contain itself." };
    }
    if (seen.has(component.componentProductId)) {
      return { ok: false, error: "That product is already in the package." };
    }
    seen.add(component.componentProductId);

    const child = await loadProduct(supabase, studioId, component.componentProductId);
    if (!child) return { ok: false, error: "One of the included products no longer exists." };
  }

  await supabase
    .from("billing_product_components")
    .delete()
    .eq("package_product_id", packageProductId);

  if (parsed.data.length) {
    const { error: insErr } = await supabase.from("billing_product_components").insert(
      parsed.data.map((component, idx) => ({
        package_product_id: packageProductId,
        component_product_id: component.componentProductId,
        quantity: component.quantity,
        sort_order: idx,
      })),
    );
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/portal/admin/money");
  return { ok: true };
}

// ─── Per-ledger code overrides ───────────────────────────────────────────────

const LedgerCodeSchema = z.object({
  provider: z.enum(LEDGER_PROVIDERS),
  accountCode: z.string().trim().max(40).optional(),
  itemCode: z.string().trim().max(40).optional(),
  taxCode: z.string().trim().max(40).optional(),
  trackingOption: z.string().trim().max(80).optional(),
});

export async function saveProductLedgerCodes(
  productId: string,
  overrides: z.infer<typeof LedgerCodeSchema>[],
): Promise<ProductActionResult> {
  const parsed = z.array(LedgerCodeSchema).max(3).safeParse(overrides);
  if (!parsed.success) return { ok: false, error: "Invalid ledger codes." };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const product = await loadProduct(supabase, studioId, productId);
  if (!product) return { ok: false, error: "Product not found." };

  await supabase.from("billing_product_ledger_codes").delete().eq("product_id", productId);

  // An override row that sets nothing is the same as no override at all —
  // drop it so the product default keeps applying.
  const rows = parsed.data
    .filter((o) => o.accountCode || o.itemCode || o.taxCode || o.trackingOption)
    .map((o) => ({
      product_id: productId,
      provider: o.provider,
      account_code: o.accountCode || null,
      item_code: o.itemCode || null,
      tax_code: o.taxCode || null,
      tracking_option: o.trackingOption || null,
    }));

  if (rows.length) {
    const { error: insErr } = await supabase.from("billing_product_ledger_codes").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  revalidatePath("/portal/admin/money");
  return { ok: true };
}

// ─── Starter catalogue ───────────────────────────────────────────────────────

/**
 * Seeds the ten starter products, skipping any code the studio already has.
 * Safe to run twice — the second run is a no-op rather than a duplicate-key
 * error, which matters because studios click this while exploring.
 */
export async function seedStarterCatalog(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: existing } = await supabase
    .from("billing_products")
    .select("id, code")
    .eq("studio_id", studioId);

  const byCode = new Map(
    (existing ?? []).map((p) => [String(p.code).toUpperCase(), p.id as string]),
  );

  // Studios usually have a Xero sales account configured; use it so seeded
  // products arrive already coded instead of flagged as missing.
  const { data: connection } = await supabase
    .from("xero_connections")
    .select("settings")
    .eq("studio_id", studioId)
    .maybeSingle();
  const salesAccountCode =
    ((connection?.settings ?? {}) as { sales_account_code?: string }).sales_account_code ?? "200";

  const missing = STARTER_CATALOG.filter((p) => !byCode.has(p.code.toUpperCase()));
  if (missing.length === 0) return { ok: true, created: 0 };

  const { data: inserted, error: insErr } = await supabase
    .from("billing_products")
    .insert(
      missing.map((p, idx) => ({
        studio_id: studioId,
        name: p.name,
        code: p.code,
        description: p.description,
        category: p.category,
        pricing_model: p.pricingModel,
        unit_amount_cents: p.unitAmountCents,
        unit_label: p.unitLabel ?? null,
        min_units: p.minUnits ?? null,
        increment_units: p.incrementUnits ?? null,
        credit_count: p.creditCount ?? null,
        credit_expiry_days: p.creditExpiryDays ?? null,
        recurring_interval: p.recurringInterval ?? null,
        account_code: salesAccountCode,
        sort_order: idx,
      })),
    )
    .select("id, code");

  if (insErr) return { ok: false, error: insErr.message };

  for (const row of inserted ?? []) {
    byCode.set(String(row.code).toUpperCase(), row.id as string);
  }

  // Package contents reference products by code, so they can only be wired up
  // once every product above exists.
  const componentRows = missing
    .flatMap((p) =>
      (p.components ?? []).map((component, idx) => ({
        package_product_id: byCode.get(p.code.toUpperCase()),
        component_product_id: byCode.get(component.code.toUpperCase()),
        quantity: component.quantity,
        sort_order: idx,
      })),
    )
    .filter((r) => Boolean(r.package_product_id) && Boolean(r.component_product_id));

  if (componentRows.length) {
    await supabase.from("billing_product_components").insert(componentRows);
  }

  revalidatePath("/portal/admin/money");
  return { ok: true, created: missing.length };
}
