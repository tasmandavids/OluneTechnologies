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
  "pricing",
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
  "products",
  "billing",
  "website",
  "forms",
  "checkin",
  "connections",
  "leads",
] as const;

export type TourFeatureKey = (typeof TOUR_FEATURE_KEYS)[number];

/**
 * The doors a studio should know exist on day one, in the order they matter.
 *
 * `module` mirrors ADMIN_NAV's gating (lib/portal/nav-config.ts): a tour card
 * for a module this studio's pack doesn't include would send an admin to a
 * placeholder, so the wizard filters on the same entitlements the rail does.
 * Absent means always shown, exactly as in the nav.
 */
export const TOUR_FEATURES = [
  { id: "dashboard" as const, href: "/portal/admin", emoji: "📊" },
  { id: "students" as const, href: "/portal/admin/people", emoji: "👨‍👩‍👧" },
  { id: "classes" as const, href: "/portal/admin/classes", emoji: "🩰", module: "classes" },
  { id: "products" as const, href: "/portal/admin/money?tab=products", emoji: "🏷️", module: "billing" },
  { id: "billing" as const, href: "/portal/admin/money", emoji: "💳", module: "billing" },
  { id: "website" as const, href: "/portal/admin/site", emoji: "🌐", module: "site" },
  { id: "forms" as const, href: "/portal/admin/forms", emoji: "📝", module: "forms" },
  { id: "checkin" as const, href: "/portal/admin/checkin", emoji: "📲" },
  { id: "connections" as const, href: "/portal/admin/settings/connections", emoji: "🔌" },
  { id: "leads" as const, href: "/portal/admin/leads", emoji: "✉️", module: "leads" },
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
