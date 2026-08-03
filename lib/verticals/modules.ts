// ============================================================================
//  Module ↔ route mapping.
//
//  Used by requireModule() to guard pages and server actions, and by the
//  operator console to explain what a module actually turns off.
// ============================================================================

import type { ModuleKey } from "./types";

export const MODULE_KEYS: ModuleKey[] = [
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
  "production",
  "costumes",
  "fixtures",
  "competitions",
  "skills",
  "venues",
];

/**
 * Route prefixes owned by each module.
 *
 * Only modules that own a route appear here. A module with no entry is gated
 * at the nav and action layer only (e.g. `attendance` is surfaced inside other
 * pages rather than owning a route of its own).
 */
export const MODULE_ROUTES: Partial<Record<ModuleKey, string[]>> = {
  classes: ["/portal/admin/classes"],
  billing: [
    "/portal/admin/money",
    "/portal/admin/billing",
    "/portal/admin/accounting",
    "/portal/admin/payments",
    "/portal/admin/payment-plans",
    "/portal/admin/subscriptions",
    "/portal/parent/billing",
  ],
  messaging: ["/portal/admin/messages", "/portal/parent/chat", "/portal/teacher/messages"],
  leads: ["/portal/admin/leads"],
  forms: ["/portal/parent/forms"],
  staff: ["/portal/admin/staff"],
  availability: ["/portal/admin/availability", "/portal/teacher/availability"],
  substitutes: ["/portal/admin/substitutes", "/portal/teacher/substitutes"],
  privateLessons: [
    "/portal/admin/private-lessons",
    "/portal/parent/private-lessons",
    "/portal/teacher/private-lessons",
  ],
  site: ["/portal/admin/site", "/portal/admin/advertising"],
  shop: ["/portal/admin/shop"],
  passes: ["/portal/admin/passes"],
  badges: ["/portal/admin/badges"],
  progress: ["/portal/student/progress"],
  // Dance-only. The recital route is the parent-facing costume + run-sheet hub.
  production: ["/portal/admin/events"],
  costumes: ["/portal/parent/recital"],
  // Landing in later phases; listed now so the guard is ready when they do.
  fixtures: ["/portal/admin/fixtures", "/portal/admin/seasons"],
  competitions: ["/portal/admin/competitions"],
  skills: ["/portal/admin/skills"],
  venues: ["/portal/admin/venues"],
};

/** The module that owns a path, if any. Longest prefix wins. */
export function moduleForPath(pathname: string): ModuleKey | null {
  let best: { key: ModuleKey; length: number } | null = null;
  for (const [key, prefixes] of Object.entries(MODULE_ROUTES) as [ModuleKey, string[]][]) {
    for (const prefix of prefixes) {
      if (
        (pathname === prefix || pathname.startsWith(`${prefix}/`)) &&
        (!best || prefix.length > best.length)
      ) {
        best = { key, length: prefix.length };
      }
    }
  }
  return best?.key ?? null;
}
