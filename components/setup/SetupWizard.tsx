"use client";

// ============================================================================
//  SetupWizard — post-onboarding studio setup for new admins.
//  Path → profile → bulk students → bulk classes → feature tour.
// ============================================================================

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { CsvFileUpload } from "@/components/setup/CsvFileUpload";
import {
  DANCE_STYLE_KEYS,
  IMPORT_SOURCE_IDS,
  NZ_REGION_KEYS,
  SETUP_STEPS,
  TOUR_FEATURES,
  type ImportSource,
  type SetupPath,
  type SetupStepId,
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
  saveStudioProfile,
  snoozeSetup,
  type SetupStudio,
} from "@/app/setup/actions";

const EASE = [0.16, 1, 0.3, 1] as const;
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

const EMPTY_STUDENT: ParsedStudent = {
  fullName: "",
  email: "",
  phone: "",
  parentName: "",
  parentEmail: "",
};

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

export function SetupWizard({ studio, schemaError }: Props) {
  const t = useTranslations("setup");
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const reduce = reduceMotion ?? false;
  const [pending, startTransition] = useTransition();

  const [step, setStep] = useState<SetupStepId>(studio.initialStep ?? "path");
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

  const stepIndex = SETUP_STEPS.findIndex((s) => s.id === step);

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
    <div className="min-h-screen bg-base px-4 py-10 text-ink sm:px-6">
      <div className="mx-auto w-full max-w-2xl">
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
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <p className="font-semibold">{t("schemaPending.title")}</p>
            <p className="mt-1 text-xs opacity-90">
              {t("schemaPending.body", { command: t("schemaPending.command") })}
              {schemaError ? ` (${schemaError})` : ""}
            </p>
          </div>
        )}

        {step !== "tour" && (
          <nav className="mb-8 flex flex-wrap items-center justify-center gap-1 sm:gap-2" aria-label={t("progressAria")}>
            {SETUP_STEPS.slice(0, -1).map((s, i) => (
              <div key={s.id} className="flex items-center gap-1 sm:gap-2">
                <span
                  className="text-[0.65rem] font-semibold uppercase tracking-wider sm:text-xs"
                  style={{ color: i <= stepIndex ? "var(--brand-hot)" : "var(--muted)" }}
                >
                  {t(`steps.${s.id}`)}
                </span>
                {i < SETUP_STEPS.length - 2 && (
                  <span
                    className="hidden h-px w-4 sm:block sm:w-8"
                    style={{ background: i < stepIndex ? "var(--brand)" : "var(--hair)" }}
                  />
                )}
              </div>
            ))}
          </nav>
        )}

        <div className="box rounded-3xl p-6 sm:p-8">
          {error && (
            <p className="mb-4 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-400">
              {error}
            </p>
          )}
          {importSummary && (
            <p className="mb-4 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-ink">
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

              {step === "tour" && (
                <TourStep studioName={studio.name} onFinish={finishSetup} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

// ─── Shared chrome ───────────────────────────────────────────────────────────

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
          <button type="button" onClick={onBack} className="btn-glow flex-none">
            {t("back")}
          </button>
        )}
        {showSkip && onSkip && (
          <button type="button" onClick={onSkip} disabled={pending} className="btn-glow flex-none text-muted">
            {t("skip")}
          </button>
        )}
        <button
          type="button"
          onClick={onContinue}
          disabled={pending || continueDisabled}
          className="btn-glow btn-glow--solid min-w-0 flex-1 justify-center disabled:opacity-50"
        >
          {pending ? t("working") : continueLabel}
        </button>
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
      <h1 className="text-2xl font-black tracking-tight">{t("path.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("path.subtitle")}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <PathCard
          selected={path === "scratch"}
          onClick={() => onPath("scratch")}
          emoji="✨"
          title={t("path.scratch.title")}
          body={t("path.scratch.body")}
        />
        <PathCard
          selected={path === "import"}
          onClick={() => onPath("import")}
          emoji="📋"
          title={t("path.import.title")}
          body={t("path.import.body")}
        />
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
                className={`rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                  importSource === id
                    ? "border-brand bg-brand/10 text-ink"
                    : "border-[--hair] text-muted hover:border-brand/40 hover:text-ink"
                }`}
              >
                <span className="font-semibold">{t(`importSources.${id}.name`)}</span>
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

function PathCard({
  selected,
  onClick,
  emoji,
  title,
  body,
}: {
  selected: boolean;
  onClick: () => void;
  emoji: string;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border p-4 text-left transition ${
        selected
          ? "border-brand bg-brand/10 ring-1 ring-brand/30"
          : "border-[--hair] hover:border-brand/40"
      }`}
    >
      <span className="text-2xl">{emoji}</span>
      <p className="mt-2 font-bold text-ink">{title}</p>
      <p className="mt-1 text-xs text-muted">{body}</p>
    </button>
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
      <h1 className="text-2xl font-black tracking-tight">{t("profile.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("profile.subtitle")}</p>

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
            {DANCE_STYLE_KEYS.map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => onToggleStyle(style)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  danceStyles.includes(style)
                    ? "bg-brand text-white"
                    : "border border-[--hair] text-muted hover:border-brand/40 hover:text-ink"
                }`}
              >
                {t(`danceStyles.${style}`)}
              </button>
            ))}
          </div>
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
      <h1 className="text-2xl font-black tracking-tight">{t("students.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("students.subtitle")}</p>

      {showPasteFirst && importSource && (
        <div className="mt-4 rounded-xl border border-brand/20 bg-brand/5 px-4 py-3 text-sm">
          <p className="font-semibold text-ink">
            {t("students.tipTitle", { source: t(`importSources.${importSource}.name`) })}
          </p>
          <p className="mt-1 text-muted">{t(`importSources.${importSource}.hint`)}</p>
          <p className="mt-2 font-mono text-[0.65rem] text-muted">
            {t(`importSources.${importSource}.sampleHeaders`)}
          </p>
        </div>
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
            <div key={i} className="box space-y-2 rounded-xl p-3">
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
            </div>
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
      <h1 className="text-2xl font-black tracking-tight">{t("classes.title")}</h1>
      <p className="mt-1 text-sm text-muted">{t("classes.subtitle")}</p>

      {danceStyles.length > 0 && !classPaste.trim() && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onApplySuggestions}
            className="rounded-full border border-brand/40 bg-brand/10 px-4 py-2 text-xs font-semibold text-ink hover:bg-brand/20"
          >
            {t("classes.suggest")}
          </button>
          {suggestionsApplied && manualClasses.length > 0 && (
            <span className="text-xs text-muted">
              {t("classes.suggestionsReady", { count: manualClasses.length })}
            </span>
          )}
        </div>
      )}

      {manualClasses.length > 0 && !classPaste.trim() && (
        <div className="box mt-4 overflow-x-auto rounded-xl">
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
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2 text-muted">
                    {c.discipline && (DANCE_STYLE_KEYS as readonly string[]).includes(c.discipline)
                      ? t(`danceStyles.${c.discipline as (typeof DANCE_STYLE_KEYS)[number]}`)
                      : (c.discipline ?? "—")}
                  </td>
                  <td className="px-3 py-2">{DAY_KEYS[c.dayOfWeek] ? t(`days.${DAY_KEYS[c.dayOfWeek]}`) : "—"}</td>
                  <td className="px-3 py-2 text-muted">
                    {c.startTime ?? ""}{c.endTime ? `–${c.endTime}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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

// ─── Step 5: Tour ────────────────────────────────────────────────────────────

function TourStep({
  studioName,
  onFinish,
}: {
  studioName: string;
  onFinish: () => void;
}) {
  const t = useTranslations("setup");

  return (
    <div>
      <div className="text-center">
        <div
          className="mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl text-white"
          style={{ background: "var(--brand)" }}
        >
          🎉
        </div>
        <h1 className="mt-4 text-2xl font-black">{t("tour.title", { studioName })}</h1>
        <p className="mt-1 text-sm text-muted">{t("tour.subtitle")}</p>
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {TOUR_FEATURES.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="box group rounded-2xl p-4 transition hover:bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]"
          >
            <span className="text-xl">{f.emoji}</span>
            <p className="mt-2 font-bold text-ink group-hover:text-brand">
              {t(`tourFeatures.${f.id}.title`)}
            </p>
            <p className="mt-1 text-xs text-muted">{t(`tourFeatures.${f.id}.body`)}</p>
          </Link>
        ))}
      </div>

      <button
        type="button"
        onClick={onFinish}
        className="btn-glow btn-glow--solid mt-8 w-full justify-center"
      >
        {t("tour.enterDashboard")}
      </button>
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
