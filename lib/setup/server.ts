// ============================================================================
//  Server-side setup state — resilient when migration columns are missing.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportSource, SetupPath, SetupStepId } from "@/lib/setup/constants";
import { SETUP_STEPS } from "@/lib/setup/constants";
import {
  TUITION_PRICING_MODELS,
  type TuitionPricingModel,
} from "@/lib/billing/tuition-quote";

export type StudioSetupState = {
  name: string;
  setupCompletedAt: string | null;
  setupSnoozedAt: string | null;
  setupStep: SetupStepId | null;
  setupPath: SetupPath | null;
  importSource: ImportSource | null;
  locationCity: string | null;
  locationRegion: string | null;
  locationCountry: string | null;
  about: string | null;
  danceStyles: string[];
  /** False when 0031 columns are not applied yet */
  schemaReady: boolean;
};

const BASE_SELECT =
  "name, setup_completed_at, setup_path, import_source, location_city, location_region, location_country, about, dance_styles";

const EXTENDED_SELECT = `${BASE_SELECT}, setup_snoozed_at, setup_step`;

const LEGACY_SELECT = "name, created_at";

function isMissingColumnError(message: string): boolean {
  return /column .* does not exist/i.test(message);
}

function parseStep(raw: string | null | undefined): SetupStepId | null {
  if (!raw) return null;
  return SETUP_STEPS.some((s) => s.id === raw) ? (raw as SetupStepId) : null;
}

function mapStudioRow(
  d: Record<string, unknown>,
  schemaReady: boolean,
): StudioSetupState {
  return {
    name: d.name as string,
    setupCompletedAt: (d.setup_completed_at as string | null) ?? null,
    setupSnoozedAt: (d.setup_snoozed_at as string | null | undefined) ?? null,
    setupStep: parseStep(d.setup_step as string | null | undefined),
    setupPath: (d.setup_path as SetupPath | null) ?? null,
    importSource: (d.import_source as ImportSource | null) ?? null,
    locationCity: (d.location_city as string | null) ?? null,
    locationRegion: (d.location_region as string | null) ?? null,
    locationCountry: (d.location_country as string | null) ?? "New Zealand",
    about: (d.about as string | null) ?? null,
    danceStyles: Array.isArray(d.dance_styles) ? (d.dance_styles as string[]) : [],
    schemaReady,
  };
}

export async function fetchStudioSetupState(
  supabase: SupabaseClient,
  studioId: string,
): Promise<{ state: StudioSetupState | null; error: string | null }> {
  for (const select of [EXTENDED_SELECT, BASE_SELECT]) {
    const res = await supabase.from("studios").select(select).eq("id", studioId).single();
    if (!res.error && res.data) {
      return {
        state: mapStudioRow(res.data as unknown as Record<string, unknown>, true),
        error: null,
      };
    }
    if (res.error && !isMissingColumnError(res.error.message)) {
      return { state: null, error: res.error.message };
    }
  }

  const legacy = await supabase.from("studios").select(LEGACY_SELECT).eq("id", studioId).single();
  if (legacy.error || !legacy.data) {
    return { state: null, error: legacy.error?.message ?? "Studio not found" };
  }
  return {
    state: {
      name: legacy.data.name,
      setupCompletedAt: legacy.data.created_at ?? null,
      setupSnoozedAt: null,
      setupStep: null,
      setupPath: null,
      importSource: null,
      locationCity: null,
      locationRegion: null,
      locationCountry: "New Zealand",
      about: null,
      danceStyles: [],
      schemaReady: false,
    },
    error: null,
  };
}

// ─── Pricing (0109 / 0110), loaded the same forgiving way ────────────────────

export type StudioTuitionSetup = {
  model: TuitionPricingModel;
  bands: { minHours: number; totalCents: number }[];
  overflowRateCents: number | null;
  /** False when the pricing migrations aren't applied — the step is skipped. */
  ready: boolean;
};

const NO_PRICING: StudioTuitionSetup = {
  model: "per_class",
  bands: [],
  overflowRateCents: null,
  ready: false,
};

/**
 * What the wizard's pricing step opens on.
 *
 * Two independent reads rather than loadStudioTuitionContext: a studio mid-setup
 * usually has no catalogue at all, and this has to survive a database where
 * 0109/0110 haven't been pushed yet (`ready: false` hides the step) rather than
 * throwing the whole wizard away over a column that isn't there.
 */
export async function fetchStudioTuitionSetup(
  supabase: SupabaseClient,
  studioId: string,
): Promise<StudioTuitionSetup> {
  const { data: studio, error } = await supabase
    .from("studios")
    .select("tuition_pricing_model")
    .eq("id", studioId)
    .maybeSingle();

  if (error || !studio) return NO_PRICING;

  const raw = (studio as { tuition_pricing_model?: unknown }).tuition_pricing_model;
  const model = TUITION_PRICING_MODELS.includes(raw as TuitionPricingModel)
    ? (raw as TuitionPricingModel)
    : "per_class";

  const { data: product, error: productError } = await supabase
    .from("billing_products")
    .select("overflow_rate_cents, billing_hour_bands ( min_hours, total_cents )")
    .eq("studio_id", studioId)
    .eq("pricing_model", "hours_ladder")
    .eq("active", true)
    .maybeSingle();

  // The model column exists but the catalogue doesn't: the step still works,
  // it just opens on the starter rate card.
  if (productError) return { model, bands: [], overflowRateCents: null, ready: true };

  const rows = (product?.billing_hour_bands ?? []) as { min_hours: unknown; total_cents: unknown }[];

  return {
    model,
    bands: rows
      .map((b) => ({ minHours: Number(b.min_hours), totalCents: Number(b.total_cents) }))
      .filter((b) => Number.isFinite(b.minHours) && Number.isFinite(b.totalCents))
      .sort((a, b) => a.minHours - b.minHours),
    overflowRateCents:
      product?.overflow_rate_cents == null ? null : Number(product.overflow_rate_cents),
    ready: true,
  };
}

export function setupBlocksPortal(state: StudioSetupState): boolean {
  if (!state.schemaReady) return false;
  if (state.setupCompletedAt) return false;
  if (state.setupSnoozedAt) return false;
  return true;
}

export function setupNeedsBanner(state: StudioSetupState): boolean {
  if (!state.schemaReady) return false;
  return !state.setupCompletedAt;
}
