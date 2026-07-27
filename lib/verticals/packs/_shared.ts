// ============================================================================
//  Shared pack building blocks
//
//  Anything a pack would otherwise copy-paste lives here: the generic-core
//  module list, level schemes that recur across verticals, and the neutral
//  badge keys every vertical inherits.
// ============================================================================

import type { LevelScheme, ModuleKey, TaxonomyOption } from "../types";

/**
 * Modules every pack gets. A vertical opts *out* by omitting these from its
 * own `modules` array — nothing here is implicitly granted.
 */
export const CORE_MODULES: ModuleKey[] = [
  "classes",
  "attendance",
  "billing",
  "messaging",
  "leads",
  "forms",
  "staff",
  "availability",
  "substitutes",
  "privateLessons",
  "site",
  "shop",
  "passes",
  "badges",
  "progress",
];

/** Named skill bands. The dance default; also fits music and tutoring. */
export const NAMED_LEVELS: LevelScheme = {
  key: "named",
  kind: "named",
  levels: [
    { key: "beginner", name: "Beginner", ordinal: 1 },
    { key: "improver", name: "Improver", ordinal: 2 },
    { key: "intermediate", name: "Intermediate", ordinal: 3 },
    { key: "advanced", name: "Advanced", ordinal: 4 },
    { key: "preProfessional", name: "Pre-professional", ordinal: 5 },
  ],
};

/** Numbered levels 1–10. Gymnastics and swim schools both work this way. */
export const ORDINAL_LEVELS_10: LevelScheme = {
  key: "ordinal10",
  kind: "ordinal",
  levels: Array.from({ length: 10 }, (_, i) => ({
    key: `level${i + 1}`,
    name: `Level ${i + 1}`,
    ordinal: i + 1,
  })),
};

/** Age bands offered on instructor profiles and class setup. */
export const AGE_GROUPS: string[] = [
  "Early childhood (0–5)",
  "Primary (5–12)",
  "Secondary (13–18)",
  "Adult",
  "Vocational / pre-professional",
];

/** Engagement types on the Olune Network instructor marketplace. */
export const ENGAGEMENT_TYPES: string[] = [
  "One-off cover",
  "Workshop",
  "Week intensive",
  "Summer school",
  "Residency",
];

/**
 * Badges that carry no vertical-specific vocabulary — attendance streaks,
 * milestones, community. Seeded with `vertical is null` in 0089/0102 so every
 * pack inherits them without authoring its own catalogue.
 */
export const NEUTRAL_BADGE_KEYS: string[] = [
  "club_100",
  "club_500",
  "club_1000",
  "perfect_attendance",
  "consistency_champion",
  "community_champion",
  "fundraising_star",
  "never_give_up",
  "supportive_family",
  "first_year_complete",
];

/** Import sources that are not specific to any one vertical. */
export const GENERIC_IMPORT_SOURCES: string[] = ["spreadsheet", "other"];

/** Convenience for packs whose taxonomy is a flat list of plain names. */
export function optionsFromNames(names: string[]): TaxonomyOption[] {
  return names.map((label) => ({
    key: label
      .toLowerCase()
      .replace(/[^a-z0-9]+(.)/g, (_, c: string) => c.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, ""),
    label,
  }));
}
