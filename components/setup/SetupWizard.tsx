"use client";

// ============================================================================
//  SetupWizard — post-onboarding studio setup for new admins.
//  Path → profile → bulk students → bulk classes → pricing → feature tour.
//
//  Aurora Glass: the wizard is the first screen an admin sees after signing up,
//  so it wears the same chrome as the shell it hands them over to — the
//  .admin-glass token scope, the AuroraField background, GlassPanel surfaces
//  and RippleButton actions. Nothing here is a second implementation of the
//  glass; it is the same three primitives the Today/People/Money screens use.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { CsvFileUpload } from "@/components/setup/CsvFileUpload";
import { AmbientBackground } from "@/components/portal/admin/glass/AmbientBackground";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { RippleButton } from "@/components/portal/admin/glass/RippleButton";
import { formatMoney } from "@/lib/currency";
import {
  STARTER_HOUR_BANDS,
  STARTER_OVERFLOW_CENTS,
  formatHours,
  ladderTotalCents,
  normaliseLadder,
} from "@/lib/billing/hours-ladder";
import {
  TUITION_PRICING_MODELS,
  type TuitionPricingModel,
} from "@/lib/billing/tuition-quote";
import {
  DANCE_STYLE_KEYS,
  IMPORT_SOURCE_IDS,
  NZ_REGION_KEYS,
  SETUP_STEPS,
  TOUR_FEATURES,
  type ImportSource,
  type SetupPath,
  type SetupStepId,
  type TourFeatureKey,
} from "@/lib/setup/constants";
import {
  parseClassPaste,
  parseStudentPaste,
  suggestClassesFromStyles,
  type ParsedClass,
  type ParsedStudent,
} from "@/lib/setup/parsers";
import {
  bulkAddClasses,
  bulkAddStudents,
  completeSetup,
  saveSetupPath,
  saveSetupStep,
  saveStudioProfile,
  saveTuitionModel,
  snoozeSetup,
  type SetupStudio,
} from "@/app/setup/actions";

const EASE = [0.16, 1, 0.3, 1] as const;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** A light week, a typical one, a heavy one — the rate card in three numbers. */
const PREVIEW_HOURS = [1, 2, 3, 5];

const EMPTY_STUDENT: ParsedStudent = {
  fullName: "",
  email: "",
  phone: "",
  parentName: "",
  parentEmail: "",
};

/** Glass-scale inputs for the rate card, matching Money → Products. */
const RATE_FIELD =
  "rounded-xl border px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand]";
const RATE_FIELD_STYLE = { background: "var(--surface)", borderColor: "var(--hair)" } as const;

type BandDraft = { hours: string; dollars: string };

type Props = {
  studio: SetupStudio;
  schemaError?: string | null;
};

function safeParseStudents(text: string): ParsedStudent[] {
  try {
    return parseStudentPaste(text);
  } catch {
    return [];
  }
}

function safeParseClasses(text: string): ParsedClass[] {
  try {
    return parseClassPaste(text);
  } catch {
    return [];
  }
}

function bandsToDrafts(bands: { minHours: number; totalCents: number }[]): BandDraft[] {
  return bands.map((b) => ({
    hours: String(b.minHours),
    dollars: (b.totalCents / 100).toFixed(2),
  }));
}

export function SetupWizard({ studio, schemaError }: Props) {
  const t = useTranslations("setup");
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const reduce = reduceMotion ?? false;
  const [pending, startTransition] = useTransition();

  // Pricing needs 0109/0110. On a database without them the step disappears
  // rather than failing on save, exactly as schemaReady handles 0031.
  const steps = useMemo(
    () => SETUP_STEPS.filter((s) => s.id !== "pricing" || studio.tuition.ready),
    [studio.tuition.ready],
  );
  const lastFormStep = steps[steps.length - 2]?.id ?? "classes";

  // A studio snoozed on a step that no longer exists (pricing, on a database
  // without the billing migrations) resumes at the last step that does — never
  // back at the beginning, which would re-ask everything it already answered.
  const [step, setStep] = useState<SetupStepId>(() => {
    const initial = studio.initialStep ?? "path";
    return steps.some((s) => s.id === initial) ? initial : lastFormStep;
  });
  const [dir, setDir] = useState(1);
  const go = useCallback((next: SetupStepId, d = 1) => {
    setDir(d);
    setStep(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, []);

  const [path, setPath] = useState<SetupPath | null>(studio.setupPath);
  const [importSource, setImportSource] = useState<ImportSource | null>(
    studio.importSource ?? "spreadsheet",
  );

  const [locationCity, setLocationCity] = useState(studio.locationCity ?? "");
  const [locationRegion, setLocationRegion] = useState(studio.locationRegion ?? "");
  const [locationCountry, setLocationCountry] = useState(studio.locationCountry ?? "New Zealand");
  const [about, setAbout] = useState(studio.about ?? "");
  const [danceStyles, setDanceStyles] = useState<string[]>(studio.danceStyles ?? []);

  const [studentPaste, setStudentPaste] = useState("");
  const [manualStudents, setManualStudents] = useState<ParsedStudent[]>([{ ...EMPTY_STUDENT }]);
  const [linkParents, setLinkParents] = useState(true);
  const [classPaste, setClassPaste] = useState("");
  const [manualClasses, setManualClasses] = useState<ParsedClass[]>([]);
  const [suggestionsApplied, setSuggestionsApplied] = useState(false);

  // The rate card opens on whatever the studio already has, or on the starter
  // table — a studio reacting to a table beats a studio staring at a grid.
  const [tuitionModel, setTuitionModel] = useState<TuitionPricingModel>(studio.tuition.model);
  const [bands, setBands] = useState<BandDraft[]>(() =>
    bandsToDrafts(studio.tuition.bands.length ? studio.tuition.bands : STARTER_HOUR_BANDS),
  );
  const [overflow, setOverflow] = useState(() => {
    const cents = studio.tuition.bands.length
      ? studio.tuition.overflowRateCents
      : STARTER_OVERFLOW_CENTS;
    return cents != null ? (cents / 100).toFixed(2) : "";
  });

  const [error, setError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);

  const parsedStudents = useMemo(() => {
    const fromPaste = studentPaste.trim() ? safeParseStudents(studentPaste) : [];
    const fromManual = manualStudents.filter((s) => s.fullName.trim());
    return fromPaste.length > 0 ? fromPaste : fromManual;
  }, [studentPaste, manualStudents]);

  const parsedClasses = useMemo(() => {
    const fromPaste = classPaste.trim() ? safeParseClasses(classPaste) : [];
    const fromManual = manualClasses.filter((c) => c.name.trim());
    return fromPaste.length > 0 ? fromPaste : fromManual;
  }, [classPaste, manualClasses]);

  const parsedBands = useMemo(() => {
    const rows = bands
      .map((b) => ({
        minHours: Number.parseFloat(b.hours),
        totalCents: Math.round(Number.parseFloat(b.dollars) * 100),
      }))
      .filter(
        (b) => Number.isFinite(b.minHours) && b.minHours > 0 && Number.isFinite(b.totalCents),
      );
    const cents = overflow.trim() ? Math.round(Number.parseFloat(overflow) * 100) : null;
    return {
      rows,
      overflowCents: cents != null && Number.isFinite(cents) ? cents : null,
    };
  }, [bands, overflow]);

  // Same function the enrolment path bills with — the preview is the price.
  const ladder = useMemo(
    () => normaliseLadder(parsedBands.rows, parsedBands.overflowCents),
    [parsedBands],
  );

  const duplicateHours = useMemo(() => {
    const seen = new Set<number>();
    for (const row of parsedBands.rows) {
      const key = Math.round(row.minHours * 100);
      if (seen.has(key)) return true;
      seen.add(key);
    }
    return false;
  }, [parsedBands.rows]);

  // Auto-suggest classes when entering the classes step (avoid setState in async handlers).
  useEffect(() => {
    if (step !== "classes") return;
    if (suggestionsApplied || classPaste.trim() || manualClasses.length > 0) return;
    if (danceStyles.length === 0) return;
    const suggested = suggestClassesFromStyles(danceStyles);
    if (suggested.length === 0) return;
    setManualClasses(suggested);
    setSuggestionsApplied(true);
  }, [step, suggestionsApplied, classPaste, manualClasses.length, danceStyles]);

  const stepIndex = steps.findIndex((s) => s.id === step);

  const variants = {
    enter: (d: number) => ({ x: reduce ? 0 : d > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => ({ x: reduce ? 0 : d > 0 ? -40 : 40, opacity: 0 }),
  };

  function toggleStyle(style: string) {
    setDanceStyles((prev) =>
      prev.includes(style) ? prev.filter((s) => s !== style) : [...prev, style],
    );
  }

  function finishLater() {
    setError(null);
    startTransition(async () => {
      const res = await snoozeSetup({ step });
      if (!res.ok) { setError(res.error); return; }
      router.push("/portal/admin");
      router.refresh();
    });
  }

  function savePathAndContinue() {
    if (!path) return;
    setError(null);
    startTransition(async () => {
      const res = await saveSetupPath({ path, importSource: importSource ?? undefined });
      if (!res.ok) { setError(res.error); return; }
      go("profile");
    });
  }

  function saveProfileAndContinue() {
    setError(null);
    startTransition(async () => {
      const res = await saveStudioProfile({
        locationCity,
        locationRegion,
        locationCountry,
        about,
        danceStyles,
        timezone: locationCountry === "New Zealand" ? "Pacific/Auckland" : undefined,
      });
      if (!res.ok) { setError(res.error); return; }
      go("students");
    });
  }

  function saveStudentsAndContinue(skip = false) {
    setError(null);
    setImportSummary(null);
    startTransition(async () => {
      if (!skip && parsedStudents.length > 0) {
        const res = await bulkAddStudents({ students: parsedStudents, linkParents });
        if (!res.ok) { setError(res.error); return; }
        const parts = [t("importSummary.added", { count: res.data?.added ?? 0 })];
        if ((res.data?.parentsLinked ?? 0) > 0) {
          parts.push(t("importSummary.parentsLinked", { count: res.data?.parentsLinked ?? 0 }));
        }
        if ((res.data?.skipped ?? 0) > 0) {
          parts.push(t("importSummary.skipped", { count: res.data?.skipped ?? 0 }));
        }
        setImportSummary(parts.join(" · "));
      }
      go("classes");
    });
  }

  function saveClassesAndContinue(skip = false) {
    setError(null);
    startTransition(async () => {
      if (!skip && parsedClasses.length > 0) {
        const res = await bulkAddClasses({ classes: parsedClasses });
        if (!res.ok) { setError(res.error); return; }
      }
      // Setup is finished by whichever step is last — pricing when the billing
      // migrations are there, classes when they aren't.
      if (lastFormStep === "classes") {
        const done = await completeSetup();
        if (!done.ok) { setError(done.error); return; }
        go("tour");
        return;
      }
      await saveSetupStep({ step: "pricing" });
      go("pricing");
    });
  }

  function savePricingAndContinue(skip = false) {
    setError(null);
    startTransition(async () => {
      if (!skip) {
        if (duplicateHours) { setError(t("pricing.duplicateHours")); return; }
        const res = await saveTuitionModel({
          model: tuitionModel,
          bands: tuitionModel === "hours" ? parsedBands.rows : undefined,
          overflowRateCents: tuitionModel === "hours" ? parsedBands.overflowCents : undefined,
        });
        if (!res.ok) { setError(res.error); return; }
      }
      const done = await completeSetup();
      if (!done.ok) { setError(done.error); return; }
      go("tour");
    });
  }

  function finishSetup() {
    router.push("/portal/admin");
    router.refresh();
  }

  const importSourceId = importSource;

  return (
    <div className="admin-glass relative isolate min-h-screen bg-base px-4 py-10 text-ink sm:px-6">
      <AmbientBackground />

      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div className="flex-1" />
          <div className="flex flex-col items-center gap-3 text-center">
            <OluneLogo variant="stacked" size="md" />
            <p className="text-sm text-muted">
              {t("header", { studioName: studio.name })}
            </p>
          </div>
          <div className="flex flex-1 justify-end">
            <LanguageSwitcher compact />
          </div>
        </div>

        {!studio.schemaReady && (
          <GlassPanel className="mb-6 !p-4">
            <p className="text-sm font-semibold text-ink">{t("schemaPending.title")}</p>
            <p className="mt-1 text-xs text-muted">
              {t("schemaPending.body", { command: t("schemaPending.command") })}
              {schemaError ? ` (${schemaError})` : ""}
            </p>
          </GlassPanel>
        )}

        {step !== "tour" && (
          <StepRail steps={steps} stepIndex={stepIndex} />
        )}

        <GlassPanel className="!p-6 sm:!p-8">
          {error && (
            <p
              className="mb-4 rounded-xl border px-3.5 py-2.5 text-sm"
              style={{
                background: "color-mix(in srgb, var(--error) 12%, transparent)",
                borderColor: "color-mix(in srgb, var(--error) 34%, transparent)",
                color: "var(--error)",
              }}
            >
              {error}
            </p>
          )}
          {importSummary && (
            <p
              className="mb-4 rounded-xl px-3.5 py-2.5 text-sm text-ink"
              style={{ background: "var(--t2)" }}
            >
              {importSummary}
            </p>
          )}

          <AnimatePresence mode="wait" custom={dir}>
            <motion.div
              key={step}
              custom={dir}
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.35, ease: EASE }}
            >
              {step === "path" && (
                <PathStep
                  path={path}
                  importSource={importSource}
                  onPath={setPath}
                  onSource={setImportSource}
                  onContinue={savePathAndContinue}
                  onFinishLater={finishLater}
                  pending={pending}
                />
              )}

              {step === "profile" && (
                <ProfileStep
                  locationCity={locationCity}
                  locationRegion={locationRegion}
                  locationCountry={locationCountry}
                  about={about}
                  danceStyles={danceStyles}
                  onCity={setLocationCity}
                  onRegion={setLocationRegion}
                  onCountry={setLocationCountry}
                  onAbout={setAbout}
                  onToggleStyle={toggleStyle}
                  onBack={() => go("path", -1)}
                  onContinue={saveProfileAndContinue}
                  onFinishLater={finishLater}
                  pending={pending}
                />
              )}

              {step === "students" && (
                <StudentsStep
                  path={path}
                  importSource={importSourceId}
                  studentPaste={studentPaste}
                  manualStudents={manualStudents}
                  parsedCount={parsedStudents.length}
                  linkParents={linkParents}
                  onLinkParents={setLinkParents}
                  onPaste={setStudentPaste}
                  onManual={setManualStudents}
                  onBack={() => go("profile", -1)}
                  onContinue={() => saveStudentsAndContinue(false)}
                  onSkip={() => saveStudentsAndContinue(true)}
                  onFinishLater={finishLater}
                  pending={pending}
                />
              )}

              {step === "classes" && (
                <ClassesStep
                  danceStyles={danceStyles}
                  classPaste={classPaste}
                  manualClasses={manualClasses}
                  parsedCount={parsedClasses.length}
                  suggestionsApplied={suggestionsApplied}
                  onPaste={setClassPaste}
                  onApplySuggestions={() => {
                    const suggested = suggestClassesFromStyles(danceStyles);
                    if (suggested.length > 0) {
                      setManualClasses(suggested);
                      setClassPaste("");
                      setSuggestionsApplied(true);
                    }
                  }}
                  onBack={() => go("students", -1)}
                  onContinue={() => saveClassesAndContinue(false)}
                  onSkip={() => saveClassesAndContinue(true)}
                  onFinishLater={finishLater}
                  pending={pending}
                />
              )}

              {step === "pricing" && (
                <PricingStep
                  model={tuitionModel}
                  bands={bands}
                  overflow={overflow}
                  ladder={ladder}
                  rowCount={parsedBands.rows.length}
                  duplicateHours={duplicateHours}
                  onModel={setTuitionModel}
                  onBands={setBands}
                  onOverflow={setOverflow}
                  onBack={() => go("classes", -1)}
                  onContinue={() => savePricingAndContinue(false)}
                  onSkip={() => savePricingAndContinue(true)}
                  onFinishLater={finishLater}
                  pending={pending}
                />
              )}

              {step === "tour" && (
                <TourStep
                  studioName={studio.name}
                  features={studio.tourFeatures}
                  onFinish={finishSetup}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </GlassPanel>
      </div>
    </div>
  );
}

// ─── Shared chrome ───────────────────────────────────────────────────────────

/** The progress rail: a label per step over a track that fills as it goes. */
function StepRail({
  steps,
  stepIndex,
}: {
  steps: { id: SetupStepId }[];
  stepIndex: number;
}) {
  const t = useTranslations("setup");
  const formSteps = steps.slice(0, -1);

  return (
    <nav className="mb-6 flex items-stretch gap-1.5 sm:gap-2" aria-label={t("progressAria")}>
      {formSteps.map((s, i) => {
        const done = i < stepIndex;
        const current = i === stepIndex;
        return (
          <div key={s.id} className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span
              className="h-1 rounded-full transition-[background] duration-500"
              style={{
                background: done
                  ? "var(--tg)"
                  : current
                    ? "linear-gradient(90deg, var(--tg), var(--brand))"
                    : "var(--edge)",
              }}
            />
            <span
              className="truncate text-[0.62rem] font-semibold uppercase tracking-wider sm:text-[0.7rem]"
              style={{ color: current ? "var(--brand-hot)" : done ? "var(--ink)" : "var(--muted)" }}
            >
              {t(`steps.${s.id}`)}
            </span>
          </div>
        );
      })}
    </nav>
  );
}

function StepActions({
  onBack,
  onContinue,
  onSkip,
  onFinishLater,
  continueLabel,
  pending,
  continueDisabled,
  showSkip = true,
}: {
  onBack?: () => void;
  onContinue: () => void;
  onSkip?: () => void;
  onFinishLater: () => void;
  continueLabel: string;
  pending: boolean;
  continueDisabled?: boolean;
  showSkip?: boolean;
}) {
  const t = useTranslations("setup.actions");

  return (
    <div className="mt-8 space-y-3">
      <div className="flex flex-wrap gap-2">
        {onBack && (
          <RippleButton size="lg" onClick={onBack} className="flex-none">
            {t("back")}
          </RippleButton>
        )}
        {showSkip && onSkip && (
          <RippleButton size="lg" variant="quiet" onClick={onSkip} disabled={pending} className="flex-none">
            {t("skip")}
          </RippleButton>
        )}
        <RippleButton
          size="lg"
          variant="solid"
          sweep={!pending && !continueDisabled}
          onClick={onContinue}
          disabled={pending || continueDisabled}
          className="min-w-0 flex-1"
        >
          {pending ? t("working") : continueLabel}
        </RippleButton>
      </div>
      <button
        type="button"
        onClick={onFinishLater}
        disabled={pending}
        className="w-full text-center text-xs text-muted underline-offset-2 hover:text-ink hover:underline disabled:opacity-50"
      >
        {t("saveLater")}
      </button>
    </div>
  );
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-ink">{title}</h1>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
    </div>
  );
}

/** A selectable card: tinted and ringed when chosen, glass-quiet when not. */
function SelectCard({
  selected,
  onClick,
  className = "",
  children,
}: {
  selected: boolean;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`rounded-2xl border p-4 text-left transition duration-300 hover:-translate-y-px ${className}`}
      style={{
        background: selected ? "var(--t3)" : "var(--surface)",
        borderColor: selected ? "var(--brand)" : "var(--hair)",
        boxShadow: selected ? "0 10px 26px -18px var(--tg)" : "none",
      }}
    >
      {children}
    </button>
  );
}

/** Inset surface for tips, tables and previews inside a glass panel. */
function InsetPanel({
  className = "",
  tinted = false,
  children,
}: {
  className?: string;
  tinted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl ${className}`}
      style={
        tinted
          ? { background: "var(--t2)" }
          : { background: "var(--surface)", border: "1px solid var(--hair)" }
      }
    >
      {children}
    </div>
  );
}

// ─── Step 1: Path ────────────────────────────────────────────────────────────

function PathStep({
  path,
  importSource,
  onPath,
  onSource,
  onContinue,
  onFinishLater,
  pending,
}: {
  path: SetupPath | null;
  importSource: ImportSource | null;
  onPath: (p: SetupPath) => void;
  onSource: (s: ImportSource) => void;
  onContinue: () => void;
  onFinishLater: () => void;
  pending: boolean;
}) {
  const t = useTranslations("setup");

  return (
    <div>
      <StepHeading title={t("path.title")} subtitle={t("path.subtitle")} />

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <SelectCard selected={path === "scratch"} onClick={() => onPath("scratch")}>
          <span className="text-2xl">✨</span>
          <p className="mt-2 font-bold text-ink">{t("path.scratch.title")}</p>
          <p className="mt-1 text-xs text-muted">{t("path.scratch.body")}</p>
        </SelectCard>
        <SelectCard selected={path === "import"} onClick={() => onPath("import")}>
          <span className="text-2xl">📋</span>
          <p className="mt-2 font-bold text-ink">{t("path.import.title")}</p>
          <p className="mt-1 text-xs text-muted">{t("path.import.body")}</p>
        </SelectCard>
      </div>

      {path === "import" && (
        <div className="mt-5 overflow-hidden">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
            {t("path.sourcePrompt")}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {IMPORT_SOURCE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onSource(id)}
                aria-pressed={importSource === id}
                className="rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition"
                style={{
                  background: importSource === id ? "var(--t3)" : "var(--surface)",
                  borderColor: importSource === id ? "var(--brand)" : "var(--hair)",
                  color: importSource === id ? "var(--ink)" : "var(--muted)",
                }}
              >
                {t(`importSources.${id}.name`)}
              </button>
            ))}
          </div>
        </div>
      )}

      <StepActions
        onContinue={onContinue}
        onFinishLater={onFinishLater}
        continueLabel={t("actions.continue")}
        pending={pending}
        continueDisabled={!path}
        showSkip={false}
      />
    </div>
  );
}

// ─── Step 2: Profile ─────────────────────────────────────────────────────────

function ProfileStep({
  locationCity,
  locationRegion,
  locationCountry,
  about,
  danceStyles,
  onCity,
  onRegion,
  onCountry,
  onAbout,
  onToggleStyle,
  onBack,
  onContinue,
  onFinishLater,
  pending,
}: {
  locationCity: string;
  locationRegion: string;
  locationCountry: string;
  about: string;
  danceStyles: string[];
  onCity: (v: string) => void;
  onRegion: (v: string) => void;
  onCountry: (v: string) => void;
  onAbout: (v: string) => void;
  onToggleStyle: (s: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onFinishLater: () => void;
  pending: boolean;
}) {
  const t = useTranslations("setup");

  return (
    <div>
      <StepHeading title={t("profile.title")} subtitle={t("profile.subtitle")} />

      <div className="mt-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("profile.city")}>
            <input
              className="field-premium"
              placeholder={t("profile.cityPlaceholder")}
              value={locationCity}
              onChange={(e) => onCity(e.target.value)}
            />
          </Field>
          <Field label={t("profile.region")}>
            <select
              className="field-premium"
              value={locationRegion}
              onChange={(e) => onRegion(e.target.value)}
            >
              <option value="">{t("profile.regionPlaceholder")}</option>
              {NZ_REGION_KEYS.map((key) => (
                <option key={key} value={key}>{t(`regions.${key}`)}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t("profile.country")}>
          <input
            className="field-premium"
            value={locationCountry}
            onChange={(e) => onCountry(e.target.value)}
          />
        </Field>
        <Field label={t("profile.about")}>
          <textarea
            className="field-premium min-h-[88px] resize-y"
            placeholder={t("profile.aboutPlaceholder")}
            value={about}
            onChange={(e) => onAbout(e.target.value)}
          />
        </Field>
        <div>
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            {t("profile.stylesLabel")}
          </p>
          <div className="flex flex-wrap gap-2">
            {DANCE_STYLE_KEYS.map((style) => {
              const on = danceStyles.includes(style);
              return (
                <button
                  key={style}
                  type="button"
                  onClick={() => onToggleStyle(style)}
                  aria-pressed={on}
                  className="rounded-full border px-3 py-1.5 text-xs font-medium transition"
                  style={{
                    background: on ? "var(--brand)" : "var(--surface)",
                    borderColor: on ? "var(--brand)" : "var(--hair)",
                    color: on ? "#fff" : "var(--muted)",
                  }}
                >
                  {t(`danceStyles.${style}`)}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted">{t("profile.stylesHint")}</p>
        </div>
      </div>

      <StepActions
        onBack={onBack}
        onContinue={onContinue}
        onFinishLater={onFinishLater}
        continueLabel={t("actions.continue")}
        pending={pending}
        continueDisabled={danceStyles.length === 0}
        showSkip={false}
      />
      {danceStyles.length === 0 && (
        <p className="mt-2 text-center text-xs text-muted">{t("profile.stylesRequired")}</p>
      )}
    </div>
  );
}

// ─── Step 3: Students ────────────────────────────────────────────────────────

function StudentsStep({
  path,
  importSource,
  studentPaste,
  manualStudents,
  parsedCount,
  linkParents,
  onLinkParents,
  onPaste,
  onManual,
  onBack,
  onContinue,
  onSkip,
  onFinishLater,
  pending,
}: {
  path: SetupPath | null;
  importSource: ImportSource | null;
  studentPaste: string;
  manualStudents: ParsedStudent[];
  parsedCount: number;
  linkParents: boolean;
  onLinkParents: (v: boolean) => void;
  onPaste: (v: string) => void;
  onManual: (v: ParsedStudent[]) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onFinishLater: () => void;
  pending: boolean;
}) {
  const t = useTranslations("setup");
  const showPasteFirst = path === "import";

  return (
    <div>
      <StepHeading title={t("students.title")} subtitle={t("students.subtitle")} />

      {showPasteFirst && importSource && (
        <InsetPanel tinted className="mt-4 px-4 py-3 text-sm">
          <p className="font-semibold text-ink">
            {t("students.tipTitle", { source: t(`importSources.${importSource}.name`) })}
          </p>
          <p className="mt-1 text-muted">{t(`importSources.${importSource}.hint`)}</p>
          <p className="mt-2 font-mono text-[0.65rem] text-muted">
            {t(`importSources.${importSource}.sampleHeaders`)}
          </p>
        </InsetPanel>
      )}

      <div className="mt-5 space-y-3">
        <CsvFileUpload
          label={t("students.uploadLabel")}
          disabled={pending}
          onLoad={onPaste}
        />
        <div>
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            {t("students.pasteLabel")}
          </p>
          <textarea
            className="field-premium min-h-[120px] resize-y font-mono text-xs"
            placeholder={t("students.pastePlaceholder")}
            value={studentPaste}
            onChange={(e) => onPaste(e.target.value)}
          />
          {studentPaste.trim() && (
            <p className="mt-1.5 text-xs text-brand">
              {t("students.detected", { count: parsedCount })}
            </p>
          )}
        </div>
      </div>

      {!studentPaste.trim() && (
        <div className="mt-5 space-y-2">
          <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            {t("students.manualLabel")}
          </p>
          {manualStudents.map((row, i) => (
            <InsetPanel key={i} className="space-y-2 p-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  className="field-premium text-sm"
                  placeholder={t("students.namePlaceholder")}
                  value={row.fullName}
                  onChange={(e) => {
                    const next = [...manualStudents];
                    next[i] = { ...next[i], fullName: e.target.value };
                    onManual(next);
                  }}
                />
                <input
                  className="field-premium text-sm"
                  placeholder={t("students.emailPlaceholder")}
                  value={row.email ?? ""}
                  onChange={(e) => {
                    const next = [...manualStudents];
                    next[i] = { ...next[i], email: e.target.value };
                    onManual(next);
                  }}
                />
                <input
                  className="field-premium text-sm"
                  placeholder={t("students.phonePlaceholder")}
                  value={row.phone ?? ""}
                  onChange={(e) => {
                    const next = [...manualStudents];
                    next[i] = { ...next[i], phone: e.target.value };
                    onManual(next);
                  }}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <input
                  className="field-premium text-sm"
                  placeholder={t("students.parentNamePlaceholder")}
                  value={row.parentName ?? ""}
                  onChange={(e) => {
                    const next = [...manualStudents];
                    next[i] = { ...next[i], parentName: e.target.value };
                    onManual(next);
                  }}
                />
                <input
                  className="field-premium text-sm"
                  placeholder={t("students.parentEmailPlaceholder")}
                  value={row.parentEmail ?? ""}
                  onChange={(e) => {
                    const next = [...manualStudents];
                    next[i] = { ...next[i], parentEmail: e.target.value };
                    onManual(next);
                  }}
                />
              </div>
            </InsetPanel>
          ))}
          <button
            type="button"
            onClick={() => onManual([...manualStudents, { ...EMPTY_STUDENT }])}
            className="text-xs font-semibold text-brand hover:underline"
          >
            {t("students.addAnother")}
          </button>
        </div>
      )}

      <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm text-muted">
        <input
          type="checkbox"
          checked={linkParents}
          onChange={(e) => onLinkParents(e.target.checked)}
          className="rounded border-[--hair]"
        />
        {t("students.linkParents")}
      </label>
      <p className="mt-1.5 text-xs text-muted">{t("students.portalNote")}</p>

      <StepActions
        onBack={onBack}
        onContinue={onContinue}
        onSkip={onSkip}
        onFinishLater={onFinishLater}
        continueLabel={
          parsedCount > 0
            ? t("students.import", { count: parsedCount })
            : t("actions.continue")
        }
        pending={pending}
        continueDisabled={parsedCount === 0}
      />
    </div>
  );
}

// ─── Step 4: Classes ─────────────────────────────────────────────────────────

function ClassesStep({
  danceStyles,
  classPaste,
  manualClasses,
  parsedCount,
  suggestionsApplied,
  onPaste,
  onApplySuggestions,
  onBack,
  onContinue,
  onSkip,
  onFinishLater,
  pending,
}: {
  danceStyles: string[];
  classPaste: string;
  manualClasses: ParsedClass[];
  parsedCount: number;
  suggestionsApplied: boolean;
  onPaste: (v: string) => void;
  onApplySuggestions: () => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onFinishLater: () => void;
  pending: boolean;
}) {
  const t = useTranslations("setup");

  return (
    <div>
      <StepHeading title={t("classes.title")} subtitle={t("classes.subtitle")} />

      {danceStyles.length > 0 && !classPaste.trim() && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RippleButton onClick={onApplySuggestions} style={{ borderRadius: 999 }}>
            {t("classes.suggest")}
          </RippleButton>
          {suggestionsApplied && manualClasses.length > 0 && (
            <span className="text-xs text-muted">
              {t("classes.suggestionsReady", { count: manualClasses.length })}
            </span>
          )}
        </div>
      )}

      {manualClasses.length > 0 && !classPaste.trim() && (
        <InsetPanel className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead>
              <tr className="border-b border-[--hair] text-muted">
                <th className="px-3 py-2 font-semibold">{t("classes.tableClass")}</th>
                <th className="px-3 py-2 font-semibold">{t("classes.tableStyle")}</th>
                <th className="px-3 py-2 font-semibold">{t("classes.tableDay")}</th>
                <th className="px-3 py-2 font-semibold">{t("classes.tableTime")}</th>
              </tr>
            </thead>
            <tbody>
              {manualClasses.map((c, i) => (
                <tr key={i} className="border-b border-[--hair]/60 last:border-0">
                  <td className="px-3 py-2 text-ink">{c.name}</td>
                  <td className="px-3 py-2 text-muted">
                    {c.discipline && (DANCE_STYLE_KEYS as readonly string[]).includes(c.discipline)
                      ? t(`danceStyles.${c.discipline as (typeof DANCE_STYLE_KEYS)[number]}`)
                      : (c.discipline ?? "—")}
                  </td>
                  <td className="px-3 py-2 text-ink">{DAY_KEYS[c.dayOfWeek] ? t(`days.${DAY_KEYS[c.dayOfWeek]}`) : "—"}</td>
                  <td className="px-3 py-2 text-muted">
                    {c.startTime ?? ""}{c.endTime ? `–${c.endTime}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </InsetPanel>
      )}

      <div className="mt-5 space-y-3">
        <CsvFileUpload
          label={t("classes.uploadLabel")}
          disabled={pending}
          onLoad={onPaste}
        />
        <div>
          <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
            {t("classes.pasteLabel")}
          </p>
          <textarea
            className="field-premium min-h-[100px] resize-y font-mono text-xs"
            placeholder={t("classes.pastePlaceholder")}
            value={classPaste}
            onChange={(e) => onPaste(e.target.value)}
          />
          {classPaste.trim() && (
            <p className="mt-1.5 text-xs text-brand">{t("classes.detected", { count: parsedCount })}</p>
          )}
        </div>
      </div>

      {/* Every class price becomes a catalogue product — worth saying here,
          because it is why the next step's models have something to price. */}
      <p className="mt-4 text-xs text-muted">{t("classes.productsNote")}</p>

      <StepActions
        onBack={onBack}
        onContinue={onContinue}
        onSkip={onSkip}
        onFinishLater={onFinishLater}
        continueLabel={
          parsedCount > 0
            ? t("classes.create", { count: parsedCount })
            : t("actions.continue")
        }
        pending={pending}
        continueDisabled={parsedCount === 0}
      />
    </div>
  );
}

// ─── Step 5: Pricing ─────────────────────────────────────────────────────────

/**
 * How the studio charges — the same three models as Money → Products, asked
 * once at setup so the first enrolment quotes correctly. Saved through
 * saveTuitionModel, which routes to the admin actions and their guards.
 */
function PricingStep({
  model,
  bands,
  overflow,
  ladder,
  rowCount,
  duplicateHours,
  onModel,
  onBands,
  onOverflow,
  onBack,
  onContinue,
  onSkip,
  onFinishLater,
  pending,
}: {
  model: TuitionPricingModel;
  bands: BandDraft[];
  overflow: string;
  ladder: ReturnType<typeof normaliseLadder>;
  /** Usable rows — an hours model with none would quote every family zero. */
  rowCount: number;
  duplicateHours: boolean;
  onModel: (m: TuitionPricingModel) => void;
  onBands: (b: BandDraft[]) => void;
  onOverflow: (v: string) => void;
  onBack: () => void;
  onContinue: () => void;
  onSkip: () => void;
  onFinishLater: () => void;
  pending: boolean;
}) {
  const t = useTranslations("setup");

  function sortRows() {
    onBands(
      [...bands].sort((a, b) => {
        const ah = Number.parseFloat(a.hours);
        const bh = Number.parseFloat(b.hours);
        if (!Number.isFinite(ah)) return 1;
        if (!Number.isFinite(bh)) return -1;
        return ah - bh;
      }),
    );
  }

  return (
    <div>
      <StepHeading title={t("pricing.title")} subtitle={t("pricing.subtitle")} />

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        {TUITION_PRICING_MODELS.map((option) => (
          <SelectCard key={option} selected={model === option} onClick={() => onModel(option)}>
            <p className="text-sm font-bold text-ink">{t(`pricing.options.${option}.name`)}</p>
            <p className="mt-1.5 text-xs text-muted">{t(`pricing.options.${option}.body`)}</p>
            <p className="mt-2 text-xs font-medium text-ink">
              {t(`pricing.options.${option}.example`, {
                each: formatMoney(29900),
                both: formatMoney(59800),
                twoHours: formatMoney(17000),
                threeHours: formatMoney(23000),
              })}
            </p>
          </SelectCard>
        ))}
      </div>

      {model === "hours" ? (
        <div className="mt-6 space-y-4">
          <div>
            <p className="text-sm font-semibold text-ink">{t("pricing.rateCard.title")}</p>
            <p className="mt-0.5 text-xs text-muted">{t("pricing.rateCard.description")}</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
              <span className="w-24 sm:w-28">{t("pricing.rateCard.hours")}</span>
              <span>{t("pricing.rateCard.theyPay")}</span>
            </div>

            {bands.map((band, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="number"
                  min="0.25"
                  step="0.25"
                  aria-label={t("pricing.rateCard.hours")}
                  value={band.hours}
                  onBlur={sortRows}
                  onChange={(e) =>
                    onBands(bands.map((b, i) => (i === idx ? { ...b, hours: e.target.value } : b)))
                  }
                  className={`${RATE_FIELD} w-24 sm:w-28`}
                  style={RATE_FIELD_STYLE}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  aria-label={t("pricing.rateCard.theyPay")}
                  value={band.dollars}
                  onChange={(e) =>
                    onBands(bands.map((b, i) => (i === idx ? { ...b, dollars: e.target.value } : b)))
                  }
                  className={`${RATE_FIELD} flex-1`}
                  style={RATE_FIELD_STYLE}
                />
                <button
                  type="button"
                  onClick={() => onBands(bands.filter((_, i) => i !== idx))}
                  className="px-1 text-sm text-muted hover:text-ink"
                  aria-label={t("pricing.rateCard.removeRow")}
                >
                  ×
                </button>
              </div>
            ))}

            <button
              type="button"
              onClick={() => onBands([...bands, { hours: "", dollars: "" }])}
              className="text-xs font-semibold text-brand hover:underline"
            >
              {t("pricing.rateCard.addRow")}
            </button>

            {duplicateHours && (
              <p className="text-xs text-amber-600">{t("pricing.duplicateHours")}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <span>{t("pricing.rateCard.overflowLabel")}</span>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              aria-label={t("pricing.rateCard.overflowLabel")}
              value={overflow}
              onChange={(e) => onOverflow(e.target.value)}
              className={`${RATE_FIELD} w-24 sm:w-28`}
              style={RATE_FIELD_STYLE}
            />
            <span className="text-xs text-muted">{t("pricing.rateCard.overflowHint")}</span>
          </div>

          {/* Runs ladderTotalCents — the function the enrolment path bills with. */}
          <InsetPanel tinted className="px-4 py-3">
            <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
              {t("pricing.rateCard.previewTitle")}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5">
              {PREVIEW_HOURS.map((hours) => (
                <span key={hours} className="text-sm text-ink">
                  <span className="text-muted">{formatHours(hours)} → </span>
                  {formatMoney(ladderTotalCents(ladder, hours))}
                </span>
              ))}
            </div>
          </InsetPanel>
        </div>
      ) : (
        <InsetPanel tinted className="mt-6 px-4 py-3">
          <p className="text-sm text-ink">
            {model === "per_class_combos" ? t("pricing.combosNote") : t("pricing.perClassNote")}
          </p>
        </InsetPanel>
      )}

      <p className="mt-4 text-xs text-muted">{t("pricing.changeLater")}</p>

      <StepActions
        onBack={onBack}
        onContinue={onContinue}
        onSkip={onSkip}
        onFinishLater={onFinishLater}
        continueLabel={t("pricing.save")}
        pending={pending}
        continueDisabled={model === "hours" && (rowCount === 0 || duplicateHours)}
      />
      {model === "hours" && rowCount === 0 && (
        <p className="mt-2 text-center text-xs text-muted">{t("pricing.rateCardRequired")}</p>
      )}
    </div>
  );
}

// ─── Step 6: Tour ────────────────────────────────────────────────────────────

function TourStep({
  studioName,
  features,
  onFinish,
}: {
  studioName: string;
  features: TourFeatureKey[];
  onFinish: () => void;
}) {
  const t = useTranslations("setup");
  const cards = TOUR_FEATURES.filter((f) => features.includes(f.id));

  return (
    <div>
      <div className="text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl"
          style={{
            background: "linear-gradient(150deg, var(--tg), var(--brand) 60%, var(--brand-deep))",
            boxShadow: "0 16px 34px -18px var(--tg)",
          }}
        >
          🎉
        </div>
        <h1 className="mt-4 text-2xl font-black text-ink">{t("tour.title", { studioName })}</h1>
        <p className="mt-1 text-sm text-muted">{t("tour.subtitle")}</p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((f) => (
          <Link
            key={f.id}
            href={f.href}
            className="group rounded-2xl border p-4 transition duration-300 hover:-translate-y-px"
            style={{ background: "var(--surface)", borderColor: "var(--hair)" }}
          >
            <span className="text-xl">{f.emoji}</span>
            <p className="mt-2 font-bold text-ink group-hover:text-brand">
              {t(`tourFeatures.${f.id}.title`)}
            </p>
            <p className="mt-1 text-xs text-muted">{t(`tourFeatures.${f.id}.body`)}</p>
          </Link>
        ))}
      </div>

      <RippleButton
        size="lg"
        variant="solid"
        sweep
        onClick={onFinish}
        className="mt-8 w-full"
        style={{ height: 46, borderRadius: 14 }}
      >
        {t("tour.enterDashboard")}
      </RippleButton>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}
