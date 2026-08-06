export const DANCE_STYLE_KEYS = [
  "ballet",
  "jazz",
  "hipHop",
  "contemporary",
  "tap",
  "lyrical",
  "acro",
  "pointe",
  "musicalTheatre",
  "ballroom",
  "latin",
  "aerial",
  "preschool",
  "adultOpen",
  "competitionTeam",
] as const;

export type DanceStyleKey = (typeof DANCE_STYLE_KEYS)[number];

export type SetupPath = "scratch" | "import";

export const IMPORT_SOURCE_IDS = [
  "studiopro",
  "classmanager",
  "jackrabbit",
  "dancestudio-pro",
  "spreadsheet",
  "other",
] as const;

export type ImportSource = (typeof IMPORT_SOURCE_IDS)[number];

export const SETUP_STEP_IDS = [
  "path",
  "profile",
  "students",
  "classes",
  "tour",
] as const;

export type SetupStepId = (typeof SETUP_STEP_IDS)[number];

/** Future instructor onboarding steps (Build 1.5b+) — reuses studios.setup_step column. */
export const INSTRUCTOR_SETUP_STEP_IDS = [
  "profile",
  "affiliations",
  "availability",
  "tour",
] as const;

export type InstructorSetupStepId = (typeof INSTRUCTOR_SETUP_STEP_IDS)[number];

export const SETUP_STEPS = SETUP_STEP_IDS.map((id) => ({ id }));

export const TOUR_FEATURE_KEYS = [
  "dashboard",
  "classes",
  "students",
  "billing",
  "website",
  "leads",
] as const;

export type TourFeatureKey = (typeof TOUR_FEATURE_KEYS)[number];

export const TOUR_FEATURES = [
  { id: "dashboard" as const, href: "/portal/admin", emoji: "📊" },
  { id: "classes" as const, href: "/portal/admin/classes", emoji: "🩰" },
  { id: "students" as const, href: "/portal/admin/people", emoji: "👨‍👩‍👧" },
  { id: "billing" as const, href: "/portal/admin/money", emoji: "💳" },
  { id: "website" as const, href: "/portal/admin/site", emoji: "🌐" },
  { id: "leads" as const, href: "/portal/admin/leads", emoji: "✉️" },
] as const;

export const NZ_REGION_KEYS = [
  "northland",
  "auckland",
  "waikato",
  "bayOfPlenty",
  "gisborne",
  "hawkesBay",
  "taranaki",
  "manawatuWhanganui",
  "wellington",
  "tasman",
  "nelson",
  "marlborough",
  "westCoast",
  "canterbury",
  "otago",
  "southland",
] as const;

export type NzRegionKey = (typeof NZ_REGION_KEYS)[number];
