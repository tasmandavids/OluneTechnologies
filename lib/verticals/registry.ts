// ============================================================================
//  Vertical registry — the one place packs are looked up.
//
//  public.verticals holds the registry rows (so the operator console can
//  dark-launch a vertical without a deploy); this file holds the packs those
//  rows point at.
// ============================================================================

import type { TaxonomyOption, VerticalKey, VerticalPack } from "./types";
import { dancePack } from "./packs/dance";

export const DEFAULT_VERTICAL: VerticalKey = "dance";

/**
 * Authored packs.
 *
 * Partial by design: Phase 0 ships dance only, as a faithful transcription of
 * pre-vertical behaviour. The remaining seven are authored in Phase 2. Until
 * then the gap is unreachable — migration 0097 seeds every studio to 'dance'
 * and the onboarding vertical picker does not ship until Phase 2 — but
 * getPack() degrades to dance rather than throwing if one slips through.
 */
export const PACKS: Partial<Record<VerticalKey, VerticalPack>> = {
  dance: dancePack,
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
 * Whether a vertical can be signed up for today.
 *
 * The signup picker offers all eight; choosing an unauthored one captures a
 * waitlist row (public.vertical_waitlist) rather than creating a workspace
 * that would silently fall back to the dance pack.
 */
export function isAuthored(key: string | null | undefined): key is VerticalKey {
  return isVerticalKey(key) && !!PACKS[key];
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
