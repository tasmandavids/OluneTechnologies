// ============================================================================
//  Vertical registry — the one place packs are looked up.
//
//  public.verticals holds the registry rows (so the operator console can
//  dark-launch a vertical without a deploy); this file holds the packs those
//  rows point at.
// ============================================================================

import type { TaxonomyOption, VerticalKey, VerticalPack } from "./types";
import { dancePack } from "./packs/dance";
import { swimPack } from "./packs/swim";

export const DEFAULT_VERTICAL: VerticalKey = "dance";

/**
 * Authored packs.
 *
 * Partial by design — the remaining six are authored in Phase 2, and getPack()
 * degrades to dance rather than throwing for anything not yet written.
 *
 * ⚠️ That fallback has a consequence worth understanding: an unauthored
 * vertical resolves to the DANCE pack, so it inherits `production` and
 * `costumes` and nothing is gated off. Module gating only becomes observable
 * once a pack omits a module — which is why swim is authored here rather than
 * waiting for Phase 2. It is the fixture Gate G1 runs against.
 */
export const PACKS: Partial<Record<VerticalKey, VerticalPack>> = {
  dance: dancePack,
  swim: swimPack,
};

const VERTICAL_KEYS: VerticalKey[] = [
  "dance",
  "gymnastics",
  "sports-club",
  "swim",
  "martial-arts",
  "music",
  "cheer",
  "tutoring",
];

export function isVerticalKey(value: unknown): value is VerticalKey {
  return typeof value === "string" && (VERTICAL_KEYS as string[]).includes(value);
}

/** Resolve a pack, degrading to dance for anything not yet authored. */
export function getPack(key: string | null | undefined): VerticalPack {
  if (!isVerticalKey(key)) return dancePack;
  return PACKS[key] ?? dancePack;
}

/** Every vertical, in display order — the signup picker shows all of them. */
export function allVerticals(): VerticalKey[] {
  return [...VERTICAL_KEYS];
}

/** Verticals with an authored pack — the ones a studio can actually run on. */
export function authoredVerticals(): VerticalKey[] {
  return VERTICAL_KEYS.filter((k) => PACKS[k]);
}

/**
 * Whether a pack has been written for this vertical.
 *
 * Authored is NOT the same as ready for the public — an operator can assign an
 * authored-but-beta vertical to a studio for testing, but signup should not
 * offer it. Use isSignupReady() for that.
 */
export function isAuthored(key: string | null | undefined): key is VerticalKey {
  return isVerticalKey(key) && !!PACKS[key];
}

/**
 * Whether signup may create a workspace on this vertical today.
 *
 * Requires an authored pack AND `status: "ga"`. A beta pack (swim) has working
 * modules and taxonomy but has not been through copy vocabularisation, so a
 * tenant on it would still read "dancer" throughout the portal. Offering that
 * at signup would be a worse experience than the waitlist.
 */
export function isSignupReady(key: string | null | undefined): key is VerticalKey {
  return isAuthored(key) && PACKS[key]!.status === "ga";
}

/**
 * Every discipline across every authored pack, de-duplicated by key.
 *
 * The Olune Network instructor marketplace is deliberately NOT scoped to one
 * vertical — a coach may teach ballet and gymnastics — so it filters on this
 * union rather than on the studio's own pack.
 * See components/network/InstructorDirectory.tsx.
 */
export function allDisciplines(): TaxonomyOption[] {
  const seen = new Map<string, TaxonomyOption>();
  for (const key of VERTICAL_KEYS) {
    for (const option of PACKS[key]?.taxonomy.disciplines ?? []) {
      if (!seen.has(option.key)) seen.set(option.key, option);
    }
  }
  return [...seen.values()];
}
