// ============================================================================
//  Loading whichever tuition model a studio charges on.
//
//  Server-only counterpart to lib/billing/tuition-quote.ts, which is pure and
//  takes all of this as input. Same split as catalog.ts / pricing.ts: this file
//  fetches, that one decides.
//
//  Everything here is member-readable under RLS — studios (0002),
//  billing_products and billing_hour_bands (0105, 0110) — so a parent's
//  enrolment quote can load it under their own session. Prices still never
//  come from the client; only the studio's own rows.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStudioProducts } from "./catalog";
import { normaliseLadder, type HoursLadder } from "./hours-ladder";
import type { ComboDefinition } from "./combo-match";
import {
  TUITION_PRICING_MODELS,
  type TuitionPricingModel,
} from "./tuition-quote";
import type { BillingProduct } from "./types";

export type StudioTuitionContext = {
  model: TuitionPricingModel;
  ladder: HoursLadder | null;
  /** Carries the single hours line's name, GST treatment and ledger codes. */
  ladderProduct: BillingProduct | null;
  combos: ComboDefinition[];
};

export const DEFAULT_TUITION_MODEL: TuitionPricingModel = "per_class";

function isModel(value: unknown): value is TuitionPricingModel {
  return TUITION_PRICING_MODELS.includes(value as TuitionPricingModel);
}

/** Turn an auto-applying package product into something the matcher can use. */
export function comboFromProduct(product: BillingProduct): ComboDefinition {
  return {
    productId: product.id,
    code: product.code,
    name: product.name,
    priceCents: product.unitAmountCents,
    components: product.components.map((c) => ({
      productId: c.componentProductId,
      quantity: c.quantity,
    })),
  };
}

export function ladderFromProduct(product: BillingProduct): HoursLadder {
  return normaliseLadder(
    product.hourBands.map((b) => ({ minHours: b.minHours, totalCents: b.totalCents })),
    product.overflowRateCents,
  );
}

/**
 * The studio's pricing model and everything it needs to price with.
 *
 * Loads the whole active catalogue rather than two filtered queries: callers
 * (the enrol flow, the Products tab) want the products anyway, and one round
 * trip beats three.
 */
export async function loadStudioTuitionContext(
  supabase: SupabaseClient,
  studioId: string,
): Promise<StudioTuitionContext> {
  const [{ data: studio }, products] = await Promise.all([
    supabase.from("studios").select("tuition_pricing_model").eq("id", studioId).maybeSingle(),
    loadStudioProducts(supabase, studioId),
  ]);

  const raw = (studio as { tuition_pricing_model?: unknown } | null)?.tuition_pricing_model;
  const model = isModel(raw) ? raw : DEFAULT_TUITION_MODEL;

  const ladderProduct =
    products.find((p) => p.pricingModel === "hours_ladder" && p.active) ?? null;

  return {
    model,
    ladderProduct,
    ladder: ladderProduct ? ladderFromProduct(ladderProduct) : null,
    combos: products
      .filter((p) => p.pricingModel === "package" && p.autoApply && p.active)
      .map(comboFromProduct),
  };
}

/**
 * Reasons a studio shouldn't switch models today.
 *
 * `blocking` stops the switch; `warnings` don't. The distinction matters:
 * classes missing a finish time is something a studio fixes over an afternoon
 * and shouldn't lock them out of configuring pricing, whereas auto-pay plans
 * billing per class alongside an hours ladder would double-charge a family.
 */
export type TuitionModelPreflight = {
  classesWithoutEndTime: number;
  activeSubscriptions: number;
};

export async function tuitionModelPreflight(
  supabase: SupabaseClient,
  studioId: string,
): Promise<TuitionModelPreflight> {
  const [{ count: noEndTime }, { count: subs }] = await Promise.all([
    supabase
      .from("classes")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .is("end_time", null),
    supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("status", "active"),
  ]);

  return {
    classesWithoutEndTime: noEndTime ?? 0,
    activeSubscriptions: subs ?? 0,
  };
}
