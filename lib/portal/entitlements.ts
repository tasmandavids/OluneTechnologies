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
import { isPlanKey, planAllows, type PlanKey } from "@/lib/plans/catalog";
import type { ModuleKey, VerticalKey, VerticalPack, Vocabulary } from "@/lib/verticals/types";

/**
 * The studio's paid tier. Null means unresolved, which allows everything —
 * see planAllows() in lib/plans/catalog.ts for why that direction is the safe
 * one.
 *
 * Read from `studios.plan_key`, a mirror of studio_subscriptions.plan_key kept
 * in sync by a trigger (0119). The mirror exists because this loader runs on
 * the ANON client — it also serves published studio sites, which have no
 * session — and the billing table is admin-only by design.
 */
export type { PlanKey } from "@/lib/plans/catalog";

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

  const [studioRes, planRes, moduleRes, flagRes, vocabRes] = await Promise.all([
    supabase.from("studios").select("vertical").eq("id", studioId).single(),
    // A SEPARATE select, not `select("vertical, plan_key")`, and the separation
    // is load-bearing. PostgREST rejects the WHOLE query when one column is
    // unknown, so folding plan_key into the line above means that on any
    // deploy where the code is live before 0119 has been applied — which is
    // every Vercel deploy, since the migration is a manual step afterwards —
    // `vertical` comes back null too and EVERY studio silently falls back to
    // the dance pack. Failing independently costs nothing (same round trip,
    // run in parallel) and turns a vertical-wide incident into a null plan,
    // which planAllows() already treats as "allow everything".
    supabase.from("studios").select("plan_key").eq("id", studioId).single(),
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

  // Null when the column is absent (pre-0119), unreadable, or holds something
  // this deploy doesn't know — planAllows() treats that as "allow", so a schema
  // surprise degrades to the pre-0119 behaviour rather than stripping a paying
  // studio's features.
  const plan: PlanKey | null = isPlanKey(planRes.data?.plan_key)
    ? planRes.data.plan_key
    : null;

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
    // The paid tier. Applied last and to everything above it, including a
    // forced studio flag — an operator turning on a module for a studio should
    // not also be a silent free upgrade to a tier they aren't paying for.
    if (!planAllows(plan, key)) continue;

    modules.add(key);
  }

  const vocabulary: Vocabulary = { ...pack.vocabulary };
  for (const row of vocabRes.data ?? []) {
    const termKey = row.term_key as keyof Vocabulary;
    if (termKey in vocabulary) {
      vocabulary[termKey] = { one: row.singular as string, other: row.plural as string };
    }
  }

  return { studioId, vertical, pack, modules, plan, vocabulary };
}

/** Invalidates one studio's entitlements. */
export const entitlementsTag = (studioId: string) => `entitlements-${studioId}`;

/**
 * Invalidates EVERY studio's entitlements at once.
 *
 * Needed because a global platform_feature_flags row (studio_id is null)
 * changes the answer for all tenants, and there is no way to enumerate the
 * per-studio tags to bust them individually. Every cache entry carries both
 * tags, so a global toggle revalidates this one.
 */
export const ENTITLEMENTS_ALL_TAG = "entitlements-all";

/**
 * unstable_cache round-trips its return value through JSON, which silently
 * drops a Set down to "{}" — so the cached shape carries modules as a plain
 * array and getEntitlementsCached rebuilds the real Set on the way out.
 */
type CachedEntitlements = Omit<Entitlements, "modules"> & { modules: ModuleKey[] };

async function loadEntitlementsCacheSafe(studioId: string): Promise<CachedEntitlements> {
  const ent = await loadEntitlements(studioId);
  return { ...ent, modules: [...ent.modules] };
}

/**
 * Request-scoped dedup wrapped around a tagged 5-minute cache — the same shape
 * as getBrandingCached (lib/branding.ts:149). Invalidate with
 * revalidateTag(entitlementsTag(studioId)) for a single studio, or
 * revalidateTag(ENTITLEMENTS_ALL_TAG) when a global flag changes.
 */
export const getEntitlementsCached = cache(async (studioId: string): Promise<Entitlements> => {
  const cached = await unstable_cache(
    () => loadEntitlementsCacheSafe(studioId),
    ["entitlements", studioId],
    { tags: [entitlementsTag(studioId), ENTITLEMENTS_ALL_TAG], revalidate: 300 },
  )();
  return { ...cached, modules: new Set(cached.modules) };
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
