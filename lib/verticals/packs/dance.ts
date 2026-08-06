// ============================================================================
//  Dance pack
//
//  This is a FAITHFUL TRANSCRIPTION of Olune's behaviour before the vertical
//  layer existed. Every module reachable from ADMIN_NAV / PORTAL_NAV today is
//  declared here, so an existing dance tenant sees a zero-byte difference.
//  tests/entitlements.test.ts enforces that as a merge gate — if you change
//  this file and the nav-parity snapshot fails, the change is wrong.
//
//  Sources transcribed:
//    lib/setup/constants.ts        DANCE_STYLE_KEYS, IMPORT_SOURCE_IDS,
//                                  SETUP_STEP_IDS, TOUR_FEATURES
//    lib/setup/parsers.ts:216      suggestClassesFromStyles templates
//    components/admin/classes/ClassEditPanel.tsx      DISCIPLINE_KEYS/VALUES
//    components/admin/students/ProgressTracker.tsx    LEVEL_KEYS
//    components/portal/teacher/InstructorProfileEditor.tsx  SYLLABUS_CERTS
// ============================================================================

import type { VerticalPack } from "../types";
import { AGE_GROUPS, CORE_MODULES, NAMED_LEVELS } from "./_shared";

export const dancePack: VerticalPack = {
  key: "dance",
  status: "ga",
  depth: "full",

  // Core + the performing-arts modules. `production` and `costumes` are hard
  // gates: no feature flag turns them on for a swim school by accident.
  modules: [...CORE_MODULES, "production", "costumes"],

  // Multi-site dance studios exist but are the minority — opt in from settings
  // rather than showing a Venues nav item to every studio on day one.
  optionalModules: ["venues"],

  taxonomy: {
    // Union of the setup wizard's 15 styles and ClassEditPanel's 13. The two
    // lists had drifted apart (setup had preschool/adultOpen/competitionTeam;
    // the class dropdown had "other"); the pack reconciles them.
    disciplines: [
      { key: "ballet", label: "Ballet" },
      { key: "jazz", label: "Jazz" },
      { key: "hipHop", label: "Hip-Hop" },
      { key: "contemporary", label: "Contemporary" },
      { key: "tap", label: "Tap" },
      { key: "lyrical", label: "Lyrical" },
      { key: "acro", label: "Acro" },
      { key: "pointe", label: "Pointe" },
      { key: "musicalTheatre", label: "Musical Theatre" },
      { key: "ballroom", label: "Ballroom" },
      { key: "latin", label: "Latin" },
      { key: "aerial", label: "Aerial" },
      { key: "preschool", label: "Preschool" },
      { key: "adultOpen", label: "Adult / Open" },
      { key: "competitionTeam", label: "Competition team" },
      { key: "other", label: "Other" },
    ],
    certifications: ["RAD", "ISTD", "CSTD", "NZAMD", "BATD", "Cecchetti", "ADAPT", "BBO"],
    ageGroups: AGE_GROUPS,
  },

  levelSchemes: [NAMED_LEVELS],
  defaultLevelSchemeKey: NAMED_LEVELS.key,

  vocabulary: {
    learner: { one: "dancer", other: "dancers" },
    org: { one: "studio", other: "studios" },
    session: { one: "class", other: "classes" },
    coach: { one: "teacher", other: "teachers" },
    group: { one: "class", other: "classes" },
    venue: { one: "studio", other: "studios" },
    showcase: { one: "recital", other: "recitals" },
  },

  setup: {
    steps: ["path", "profile", "students", "classes", "tour"],
    importSources: ["studiopro", "classmanager", "jackrabbit", "dancestudio-pro", "spreadsheet", "other"],
    classTemplates: [
      { disciplineKey: "ballet", name: "Ballet — Beginners", level: "Beginners", dayOfWeek: 1, startTime: "16:00", endTime: "17:00", capacity: 15, priceCents: 1800 },
      { disciplineKey: "jazz", name: "Jazz — Juniors", level: "Juniors", dayOfWeek: 2, startTime: "16:30", endTime: "17:30", capacity: 18, priceCents: 1600 },
      { disciplineKey: "hipHop", name: "Hip-Hop — Teens", level: "Teens", dayOfWeek: 3, startTime: "17:00", endTime: "18:00", capacity: 20, priceCents: 1600 },
      { disciplineKey: "contemporary", name: "Contemporary — Open", level: "Open", dayOfWeek: 4, startTime: "17:30", endTime: "18:30", capacity: 16, priceCents: 1700 },
      { disciplineKey: "tap", name: "Tap — All levels", level: "Mixed", dayOfWeek: 5, startTime: "16:00", endTime: "17:00", capacity: 14, priceCents: 1500 },
    ],
    tour: [
      { id: "dashboard", href: "/portal/admin", emoji: "📊" },
      { id: "classes", href: "/portal/admin/classes", emoji: "🩰" },
      { id: "students", href: "/portal/admin/people", emoji: "👨‍👩‍👧" },
      { id: "billing", href: "/portal/admin/money", emoji: "💳" },
      { id: "website", href: "/portal/admin/site", emoji: "🌐" },
      { id: "leads", href: "/portal/admin/leads", emoji: "✉️" },
    ],
  },

  badges: { xpLadderKey: "dance" },

  siteTemplateTags: ["dance", "performing-arts"],
};
