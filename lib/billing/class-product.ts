// ============================================================================
//  The catalogue product behind a class.
//
//  A class is something a studio sells, so it has to exist in two places:
//  `classes` says when it runs, who teaches it and who's in it; a
//  billing_products row (0105) says what it costs, how it's taxed and where the
//  revenue lands. 0106 backfilled a product for every priced class that existed
//  at cutover, but nothing stopped the app creating more classes without one —
//  and a class with no product silently falls back to the deprecated
//  price_cents column, with no tax treatment and no ledger code.
//
//  Every path that creates a class (the admin modal, the setup wizard's bulk
//  import) resolves its billing through here, so that gap can't reopen.
//
//  Prices are never read from the caller once a product exists: the product's
//  unit_amount_cents is the price, exactly as lib/enrollment-class-price.ts
//  already assumes.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricingModel, RecurringInterval } from "./types";

/**
 * The pricing models a class fee can sensibly use. A class is billed per term,
 * on a recurring cycle, per session or as a one-off — never as a multi-use pass
 * or an hourly hire.
 */
export const CLASS_PRICING_MODELS = ["term", "recurring", "per_session", "one_off"] as const;
export type ClassPricingModel = (typeof CLASS_PRICING_MODELS)[number];

export function isClassPricingModel(model: PricingModel): model is ClassPricingModel {
  return (CLASS_PRICING_MODELS as readonly string[]).includes(model);
}

/** What the admin typed for a brand-new product, before defaults are applied. */
export type ClassProductDraft = {
  /** Defaults to the class name — one product per class is the common case. */
  name?: string;
  /** Studio SKU. Derived from the name when absent, de-duplicated on write. */
  code?: string;
  priceCents: number;
  pricingModel?: ClassPricingModel;
  accountCode?: string | null;
  itemCode?: string | null;
};

export type ClassProductDefaults = {
  pricingModel: ClassPricingModel;
  recurringInterval: RecurringInterval | null;
  unitLabel: string | null;
  accountCode: string | null;
};

/** `Ballet Junior · Grade 2` → `BALLET-JUNIOR-GRADE-2`. */
export function slugifyProductCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
}

/**
 * How this studio charges, so a new class product arrives pre-shaped instead of
 * making the admin answer a question the studio already answered in Settings.
 * Termly studios get a `term` product; everyone else a monthly recurring one —
 * the same rule 0106's backfill used.
 */
export async function loadClassProductDefaults(
  supabase: SupabaseClient,
  studioId: string,
): Promise<ClassProductDefaults> {
  const [studioRes, connectionRes] = await Promise.all([
    supabase.from("studios").select("billing_period").eq("id", studioId).maybeSingle(),
    supabase.from("xero_connections").select("settings").eq("studio_id", studioId).maybeSingle(),
  ]);

  const termly = (studioRes.data?.billing_period as string | null) === "termly";
  // Only default a ledger code when a ledger is actually connected; inventing
  // "200" for a studio with no accounting integration would be noise.
  const accountCode = connectionRes.data
    ? (((connectionRes.data.settings ?? {}) as { sales_account_code?: string }).sales_account_code ??
      "200")
    : null;

  return {
    pricingModel: termly ? "term" : "recurring",
    recurringInterval: termly ? null : "month",
    unitLabel: termly ? "term" : "month",
    accountCode,
  };
}

/** Picks a SKU that isn't taken yet within the studio (0105's unique index is case-insensitive). */
async function freeCode(
  supabase: SupabaseClient,
  studioId: string,
  base: string,
): Promise<string> {
  const root = base || "CLASS";
  const { data } = await supabase
    .from("billing_products")
    .select("code")
    .eq("studio_id", studioId)
    .ilike("code", `${root}%`);

  const taken = new Set((data ?? []).map((r) => String(r.code).toUpperCase()));
  if (!taken.has(root)) return root;

  for (let n = 2; n < 100; n += 1) {
    const candidate = `${root}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function isDuplicateCode(message: string | undefined): boolean {
  return /billing_products_studio_code_key|duplicate key/i.test(message ?? "");
}

export type CreatedClassProduct = { productId: string; unitAmountCents: number };

/**
 * Create the product a new class bills against.
 *
 * Returns the id and the price as stored, which is what the caller writes to
 * classes.price_cents — the column is still read by the class_capacity view and
 * the Stripe price sync, so it is kept in step rather than left to drift.
 */
export async function createClassProduct(
  supabase: SupabaseClient,
  studioId: string,
  className: string,
  draft: ClassProductDraft,
  defaults?: ClassProductDefaults,
): Promise<{ ok: true; product: CreatedClassProduct } | { ok: false; error: string }> {
  const resolved = defaults ?? (await loadClassProductDefaults(supabase, studioId));
  const name = (draft.name ?? "").trim() || className.trim();
  const pricingModel = draft.pricingModel ?? resolved.pricingModel;
  const recurring = pricingModel === "recurring";

  const base = slugifyProductCode(draft.code?.trim() || name || "CLASS");

  // Retry on a duplicate SKU: two admins adding "Ballet Junior" at the same
  // moment both pass the pre-check, and one of them loses the unique index.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = await freeCode(supabase, studioId, base);

    const { data, error } = await supabase
      .from("billing_products")
      .insert({
        studio_id: studioId,
        name,
        code,
        description: null,
        category: "tuition",
        pricing_model: pricingModel,
        unit_amount_cents: Math.max(0, Math.round(draft.priceCents)),
        unit_label: recurring ? resolved.unitLabel : pricingModel === "term" ? "term" : null,
        recurring_interval: recurring ? (resolved.recurringInterval ?? "month") : null,
        account_code: draft.accountCode?.trim() || resolved.accountCode,
        item_code: draft.itemCode?.trim() || null,
      })
      .select("id, unit_amount_cents")
      .single();

    if (!error && data) {
      return {
        ok: true,
        product: {
          productId: data.id as string,
          unitAmountCents: Number(data.unit_amount_cents ?? 0),
        },
      };
    }

    if (!isDuplicateCode(error?.message)) {
      return { ok: false, error: error?.message ?? "Could not create the class product." };
    }
  }

  return { ok: false, error: "Could not find a free product code — set one manually." };
}

function feeProductName(priceCents: number, pricingModel: ClassPricingModel): string {
  if (priceCents <= 0) return "Free class";
  const amount = (priceCents / 100).toFixed(2);
  if (pricingModel === "term") return `Term tuition — $${amount}`;
  if (pricingModel === "per_session") return `Class fee — $${amount}`;
  if (pricingModel === "one_off") return `Class fee — $${amount}`;
  return `Monthly tuition — $${amount}`;
}

/**
 * Products for a bulk class import, one per distinct price rather than one per
 * class — the same shape 0106's backfill produced, so a studio importing 60
 * classes at three price points ends up with three catalogue entries, not 60.
 *
 * An existing tuition product at exactly that price is reused; the point is
 * that no class arrives without a product, not that every import mints new ones.
 *
 * Returns a map of priceCents → product id. A price that could not be created
 * is simply absent, so the caller can decide whether that's fatal.
 */
export async function ensureClassFeeProducts(
  supabase: SupabaseClient,
  studioId: string,
  priceCentsList: number[],
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const prices = [...new Set(priceCentsList.map((p) => Math.max(0, Math.round(p))))];
  if (prices.length === 0) return result;

  const defaults = await loadClassProductDefaults(supabase, studioId);

  const { data: existing } = await supabase
    .from("billing_products")
    .select("id, unit_amount_cents")
    .eq("studio_id", studioId)
    .eq("category", "tuition")
    .eq("active", true)
    .in("unit_amount_cents", prices);

  for (const row of existing ?? []) {
    const price = Number(row.unit_amount_cents ?? 0);
    if (!result.has(price)) result.set(price, row.id as string);
  }

  for (const price of prices) {
    if (result.has(price)) continue;
    const name = feeProductName(price, defaults.pricingModel);
    const created = await createClassProduct(
      supabase,
      studioId,
      name,
      { name, code: price > 0 ? `CLASS-${price}` : "CLASS-FREE", priceCents: price },
      defaults,
    );
    if (created.ok) result.set(price, created.product.productId);
  }

  return result;
}
