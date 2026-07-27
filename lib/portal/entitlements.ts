// ============================================================================
//  Entitlements — what a studio is allowed to see.
//
//  Composes four sources, most-specific-wins:
//
//    enabled(m) = pack.modules.includes(m)                    ← hard gate
//               || (pack.optionalModules.includes(m) && studioOptIn(m))
//               || flagForce(m)                               ← operator valve
//      AND      planAllows(m)                                 ← null plan = all
//      AND      flagAllows(m)                                 ← studio > global
//
//  Two deliberate asymmetries:
//    · pack.modules is a HARD gate — no flag turns on `costumes` for a swim
//      school by accident.
//    · flagForce (a studio-scoped flag row with metadata->>'force' = 'true')
//      overrides the pack gate. That is the operator's release valve for the
//      cheer club that genuinely wants the production wizard, and it is free
//      because the flags are already in the batch.
//
//  Module gating is a COMMERCIAL concern, not a security one. RLS is unchanged
//  and remains the security boundary.
// ============================================================================

import { cache } from "react";
import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getPack, DEFAULT_VERTICAL } from "@/lib/verticals/registry";
import type { ModuleKey, VerticalKey, VerticalPack, Vocabulary } from "@/lib/verticals/types";

/**
 * Reserved. Plan-based entitlement is a separate workstream — there is no
 * plan column, no tiers and no application_fee_amount today. The slot exists
 * so wiring it later is one line in `allows()` rather than a refactor.
 */
export type PlanKey = string;

export type Entitlements = {
  studioId: string;
  vertical: VerticalKey;
  pack: VerticalPack;
  modules: Set<ModuleKey>;
  plan: PlanKey | null;
  vocabulary: Vocabulary;
};

type FlagRow = { feature_key: string; enabled: boolean; studio_id: string | null; metadata: unknown };

function forced(metadata: unknown): boolean {
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    (metadata as Record<string, unknown>).force === true
  );
}

/**
 * One batched read. Three small selects in parallel, cached for 5 minutes —
 * the amortised per-render cost is zero.
 */
async function loadEntitlements(studioId: string): Promise<Entitlements> {
  const supabase = createPublicClient();

  const [studioRes, moduleRes, flagRes, vocabRes] = await Promise.all([
    supabase.from("studios").select("vertical").eq("id", studioId).single(),
    supabase.from("studio_modules").select("module_key, enabled").eq("studio_id", studioId),
    supabase
      .from("platform_feature_flags")
      .select("feature_key, enabled, studio_id, metadata")
      .or(`studio_id.eq.${studioId},studio_id.is.null`),
    supabase
      .from("studio_vocabulary_overrides")
      .select("term_key, singular, plural")
      .eq("studio_id", studioId)
      .eq("locale", "en"),
  ]);

  const vertical = (studioRes.data?.vertical as VerticalKey | undefined) ?? DEFAULT_VERTICAL;
  const pack = getPack(vertical);

  const optIn = new Map<string, boolean>(
    (moduleRes.data ?? []).map((r) => [r.module_key as string, r.enabled as boolean]),
  );

  const flags = (flagRes.data ?? []) as FlagRow[];
  const studioFlag = new Map<string, FlagRow>();
  const globalFlag = new Map<string, FlagRow>();
  for (const row of flags) {
    (row.studio_id ? studioFlag : globalFlag).set(row.feature_key, row);
  }

  const modules = new Set<ModuleKey>();
  const candidates = new Set<ModuleKey>([...pack.modules, ...pack.optionalModules]);
  // A forced studio flag can introduce a module the pack never declared.
  for (const [key, row] of studioFlag) {
    if (row.enabled && forced(row.metadata)) candidates.add(key as ModuleKey);
  }

  for (const key of candidates) {
    const inPack = pack.modules.includes(key);
    const optional = pack.optionalModules.includes(key);
    const flag = studioFlag.get(key) ?? globalFlag.get(key);

    const granted =
      inPack ||
      (optional && optIn.get(key) === true) ||
      (!!flag?.enabled && forced(flag.metadata));

    if (!granted) continue;

    // An explicit studio_modules row can switch a granted module back off.
    if (optIn.get(key) === false) continue;
    // A flag row can withhold it: studio row beats global row, absent = allow.
    if (flag && !flag.enabled && !forced(flag.metadata)) continue;

    modules.add(key);
  }

  const vocabulary: Vocabulary = { ...pack.vocabulary };
  for (const row of vocabRes.data ?? []) {
    const termKey = row.term_key as keyof Vocabulary;
    if (termKey in vocabulary) {
      vocabulary[termKey] = { one: row.singular as string, other: row.plural as string };
    }
  }

  return { studioId, vertical, pack, modules, plan: null, vocabulary };
}

/**
 * Request-scoped dedup wrapped around a tagged 5-minute cache — the same shape
 * as getBrandingCached (lib/branding.ts:149). Invalidate with
 * revalidateTag(`entitlements-${studioId}`) from the operator flag-toggle
 * action and the admin module-toggle action.
 */
export const getEntitlementsCached = cache(async (studioId: string): Promise<Entitlements> => {
  return unstable_cache(
    () => loadEntitlements(studioId),
    ["entitlements", studioId],
    { tags: [`entitlements-${studioId}`], revalidate: 300 },
  )();
});

/** Entitlements for a studio with no overrides — used by tests and fallbacks. */
export function packEntitlements(studioId: string, vertical: VerticalKey): Entitlements {
  const pack = getPack(vertical);
  return {
    studioId,
    vertical,
    pack,
    modules: new Set(pack.modules),
    plan: null,
    vocabulary: { ...pack.vocabulary },
  };
}

export function hasModule(ent: Entitlements, key: ModuleKey): boolean {
  return ent.modules.has(key);
}
