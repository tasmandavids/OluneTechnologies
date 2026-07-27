// ============================================================================
//  Swim school pack — the first non-dance pack.
//
//  Config depth: the generic core, correctly labelled and taxonomised. No
//  purpose-built domain modules yet (competitions and skills frameworks land
//  with the gymnastics work).
//
//  Its real job right now is to make module gating REACHABLE. Until a pack
//  existed that omits `production` and `costumes`, getPack() fell back to dance
//  for every vertical, so nothing could actually be gated off and Gate G1 was
//  unprovable. This is the pack the G1 fixture runs on.
// ============================================================================

import type { VerticalPack } from "../types";
import { AGE_GROUPS, CORE_MODULES, ORDINAL_LEVELS_10 } from "./_shared";

export const swimPack: VerticalPack = {
  key: "swim",
  status: "beta",
  depth: "config",

  // Core only. Recitals and costumes are meaningless at a swim school — and
  // because pack.modules is a hard gate, no feature flag can switch them on
  // by accident.
  modules: [...CORE_MODULES],

  // Swim schools are frequently multi-pool, so venues is a likely opt-in.
  optionalModules: ["venues"],

  taxonomy: {
    disciplines: [
      { key: "learnToSwim", label: "Learn to Swim" },
      { key: "waterSafety", label: "Water Safety" },
      { key: "preSchool", label: "Preschool" },
      { key: "squad", label: "Squad" },
      { key: "freestyle", label: "Freestyle", group: "Stroke" },
      { key: "backstroke", label: "Backstroke", group: "Stroke" },
      { key: "breaststroke", label: "Breaststroke", group: "Stroke" },
      { key: "butterfly", label: "Butterfly", group: "Stroke" },
      { key: "medley", label: "Individual Medley", group: "Stroke" },
      { key: "adultLearn", label: "Adult Learn to Swim" },
      { key: "aquaFitness", label: "Aqua Fitness" },
      { key: "other", label: "Other" },
    ],
    certifications: ["Swim Teacher Level 1", "Swim Teacher Level 2", "AUSTSWIM", "Pool Lifeguard"],
    ageGroups: AGE_GROUPS,
  },

  levelSchemes: [ORDINAL_LEVELS_10],
  defaultLevelSchemeKey: ORDINAL_LEVELS_10.key,

  vocabulary: {
    learner: { one: "swimmer", other: "swimmers" },
    org: { one: "swim school", other: "swim schools" },
    session: { one: "lesson", other: "lessons" },
    coach: { one: "instructor", other: "instructors" },
    group: { one: "squad", other: "squads" },
    venue: { one: "pool", other: "pools" },
    showcase: { one: "carnival", other: "carnivals" },
  },

  setup: {
    steps: ["path", "profile", "venues", "students", "classes", "tour"],
    importSources: ["iclasspro", "jackrabbit", "spreadsheet", "other"],
    classTemplates: [
      { disciplineKey: "learnToSwim", name: "Learn to Swim — Level 1", level: "Level 1", dayOfWeek: 1, startTime: "15:30", endTime: "16:00", capacity: 6, priceCents: 2000 },
      { disciplineKey: "preSchool", name: "Preschool Splash", level: "Preschool", dayOfWeek: 2, startTime: "10:00", endTime: "10:30", capacity: 8, priceCents: 1800 },
      { disciplineKey: "squad", name: "Junior Squad", level: "Squad", dayOfWeek: 3, startTime: "16:30", endTime: "17:30", capacity: 16, priceCents: 2400 },
      { disciplineKey: "adultLearn", name: "Adult Learn to Swim", level: "Adult", dayOfWeek: 4, startTime: "19:00", endTime: "19:45", capacity: 10, priceCents: 2200 },
    ],
    tour: [
      { id: "dashboard", href: "/portal/admin", emoji: "📊" },
      { id: "classes", href: "/portal/admin/classes", emoji: "🏊" },
      { id: "students", href: "/portal/admin/students", emoji: "👨‍👩‍👧" },
      { id: "billing", href: "/portal/admin/billing", emoji: "💳" },
      { id: "website", href: "/portal/admin/site", emoji: "🌐" },
      { id: "leads", href: "/portal/admin/leads", emoji: "✉️" },
    ],
  },

  // No dedicated ladder yet — swim inherits the vertical-neutral badges
  // (vertical is null) until the badge verticalisation migration lands.
  badges: { xpLadderKey: "generic" },

  siteTemplateTags: ["swim", "aquatic"],
};
