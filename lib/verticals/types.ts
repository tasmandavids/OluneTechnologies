// ============================================================================
//  Vertical packs — the type layer
//
//  Olune runs one codebase across several activity verticals (dance studios,
//  gymnastics clubs, sports clubs, …). A *pack* is the per-vertical
//  configuration: which modules exist, what the taxonomy is called, what the
//  levels are, and what nouns the UI uses.
//
//  Storage split (see the multi-vertical plan):
//    · public.verticals          — registry only (key, label, status)
//    · lib/verticals/packs/*.ts  — the pack itself (this shape)
//    · studio_* override tables  — per-tenant deltas
//
//  The pack is TS, not DB rows: client components import it directly with no
//  round-trip, ModuleKey stays exhaustively typechecked, and a pack change is
//  reviewable as a diff rather than a data migration.
// ============================================================================

/** Every vertical Olune can be configured for. Mirrors public.verticals.key. */
export type VerticalKey =
  | "dance"
  | "gymnastics"
  | "sports-club"
  | "swim"
  | "martial-arts"
  | "music"
  | "cheer"
  | "tutoring";

/**
 * A gateable unit of product surface.
 *
 * Generic-core modules exist in every pack; vertical modules are declared only
 * by the packs that need them. A nav item or route with no ModuleKey is always
 * available — absence means "not gated", never "hidden".
 */
export type ModuleKey =
  // ─── generic core ─────────────────────────────────────────────────────────
  | "classes"
  | "attendance"
  | "billing"
  | "messaging"
  | "leads"
  | "forms"
  | "staff"
  | "availability"
  | "substitutes"
  | "privateLessons"
  | "site"
  | "shop"
  | "passes"
  | "badges"
  | "progress"
  // ─── vertical modules ─────────────────────────────────────────────────────
  /** Recital/production run-sheet builder: acts, cast, cues, music. Dance. */
  | "production"
  /** Costume sizing, fittings and returns. Dance. */
  | "costumes"
  /** Season draw, fixtures, team sheets, results. Sports clubs. */
  | "fixtures"
  /** Meets, gradings, entries and results. Gymnastics, swim, martial arts. */
  | "competitions"
  /** Skill frameworks and per-student skill records. Gymnastics, swim. */
  | "skills"
  /** Multi-site venues and spaces. Any multi-location organisation. */
  | "venues";

/** An entry in a pack's taxonomy — a discipline, apparatus, or age group. */
export type TaxonomyOption = {
  /** Stable slug. This is what lands in classes.discipline — never the label. */
  key: string;
  /** English fallback. The i18n key is `taxonomy.<vertical>.<key>`. */
  label: string;
  /** Optional grouping, e.g. gymnastics apparatus under "Women's artistic". */
  group?: string;
};

/** A named progression scale: dance levels, gymnastics levels, belts. */
export type LevelScheme = {
  key: string;
  kind: "ordinal" | "named" | "belt";
  levels: {
    key: string;
    name: string;
    ordinal: number;
    /** Belt/badge colour where the scheme is colour-coded. */
    colour?: string;
  }[];
};

/**
 * The nouns a vertical uses. Consumed as ICU arguments by the message
 * catalogues so one string serves every vertical:
 *   "addChildren": "Add your {learnerPlural}"
 */
export type VocabularyKey =
  /** The person being taught. dancer / gymnast / player / student. */
  | "learner"
  /** The business. studio / club / school. */
  | "org"
  /** One scheduled occurrence. class / training / lesson. */
  | "session"
  /** The person teaching. teacher / coach / instructor. */
  | "coach"
  /** A recurring group of learners. class / squad / team. */
  | "group"
  /** Where it happens. studio / gym / ground / pool. */
  | "venue"
  /** The end-of-term public thing. recital / meet / fixture / concert. */
  | "showcase";

export type VocabularyTerm = { one: string; other: string };

export type Vocabulary = Record<VocabularyKey, VocabularyTerm>;

/** One step in the /setup wizard. studios.setup_step is free text, so packs
 *  may declare any subset in any order without a schema change. */
export type SetupStepKey =
  | "path"
  | "profile"
  | "venues"
  | "students"
  | "classes"
  | "teams"
  | "tour";

export type SetupSpec = {
  steps: SetupStepKey[];
  /** Competitor products we offer to import from — differs per vertical. */
  importSources: string[];
  /**
   * Seeded suggestions on the classes step, keyed off chosen disciplines.
   * Shape matches ParsedClass in lib/setup/parsers.ts so the existing
   * suggestClassesFromStyles() can take these as an argument unchanged.
   */
  classTemplates: {
    disciplineKey: string;
    name: string;
    level?: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    capacity: number;
    priceCents: number;
  }[];
  tour: { id: string; href: string; emoji: string }[];
};

export type VerticalPack = {
  key: VerticalKey;
  status: "ga" | "beta";
  /**
   * Honest signal of what actually ships for this vertical.
   * "full"   — purpose-built domain modules and UI.
   * "config" — the generic core, correctly labelled and taxonomised.
   */
  depth: "full" | "config";
  /** Hard gate. No feature flag turns a module on for a pack that omits it. */
  modules: ModuleKey[];
  /** Admin may switch these on from settings. */
  optionalModules: ModuleKey[];
  taxonomy: {
    disciplines: TaxonomyOption[];
    /** Gymnastics apparatus, swim strokes — a second axis where one exists. */
    apparatus?: TaxonomyOption[];
    /** Syllabus/governing-body certifications an instructor can hold. */
    certifications: string[];
    ageGroups: string[];
  };
  levelSchemes: LevelScheme[];
  defaultLevelSchemeKey: string;
  vocabulary: Vocabulary;
  setup: SetupSpec;
  /**
   * Which XP ladder this vertical climbs. The badge *catalogue* is
   * deliberately not listed here — badge_definitions.vertical is the single
   * source of truth (0102), filtered in SQL as `vertical in (<pack>, null)`.
   * Duplicating it in the pack would put the same fact in two places.
   */
  badges: { xpLadderKey: string };
  /** Which site-builder templates this vertical sees in the gallery. */
  siteTemplateTags: string[];
};
