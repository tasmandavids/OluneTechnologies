// Presentational constants for badges — shared by every badge surface so tier
// rings and category ordering stay consistent. Pure data (no "use client").

import type { BadgeTier } from "@/lib/portal/badges-data";

export const TIER_STYLES: Record<
  BadgeTier,
  { ring: string; glow: string; chipBg: string; chipText: string }
> = {
  bronze: { ring: "#b08d57", glow: "rgba(176,141,87,0.35)", chipBg: "rgba(176,141,87,0.12)", chipText: "#8a6d3b" },
  silver: { ring: "#9aa3af", glow: "rgba(154,163,175,0.35)", chipBg: "rgba(154,163,175,0.14)", chipText: "#5b6472" },
  gold:   { ring: "#e0a90a", glow: "rgba(224,169,10,0.40)",  chipBg: "rgba(224,169,10,0.14)",  chipText: "#8a6a00" },
  diamond:{ ring: "#38b6d6", glow: "rgba(56,182,214,0.45)",  chipBg: "rgba(56,182,214,0.14)",  chipText: "#0e7490" },
};

export const TIER_ORDER: BadgeTier[] = ["bronze", "silver", "gold", "diamond"];

// Display order of categories in the showcase.
export const CATEGORY_ORDER = [
  "founder",
  "level",
  "beginner",
  "technique",
  "performance",
  "commitment",
  "character",
  "mentor",
  "community",
  "secret",
  "family",
] as const;

export type BadgeCategory = (typeof CATEGORY_ORDER)[number];
