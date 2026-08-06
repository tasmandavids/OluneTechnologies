"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useShortDayNames, useFormatTimeShort } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/currency";
import { PoweredByOlune } from "@/components/brand/PoweredByOlune";
import { submitTrialRequest } from "@/app/enrol/actions";
import { trackConversion } from "@/lib/analytics/track";

const DISCIPLINE_KEYS = [
  "ballet",
  "contemporary",
  "jazz",
  "hipHop",
  "tap",
  "lyrical",
  "acro",
  "pointe",
  "notSure",
] as const;

export type EnrolClassOption = {
  id: string;
  name: string;
  discipline: string | null;
  level: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  priceCents: number;
};

function normDiscipline(s: string) {
  return s.toLowerCase().replace(/[\s-_]/g, "");
}

export default function EnrolPage({
  studioId,
  studioName,
  tagline,
  logoUrl = null,
  classes,
}: {
  studioId: string;
  studioName: string;
  tagline: string | null;
  logoUrl?: string | null;
  classes: EnrolClassOption[];
}) {
  const t = useTranslations("enrol");
  const dayShort = useShortDayNames();
  const fmtTime = useFormatTimeShort();
  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState<string>("");
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [parentName, setParentName] = useState("");
  const [childName, setChildName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [pending, startTransition] = useTransition();

  const filteredClasses = useMemo(() => {
    if (!filter || filter === "notSure") return classes;
    const key = normDiscipline(filter === "hipHop" ? "hiphop" : filter);
    return classes.filter(
      (c) => c.discipline && normDiscipline(c.discipline).includes(key),
    );
  }, [classes, filter]);

  const selectedClass = classes.find((c) => c.id === selectedClassId);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const disciplineLabel =
        filter && filter !== "notSure" ? t(`disciplines.${filter as typeof DISCIPLINE_KEYS[number]}`) : "";
      const res = await submitTrialRequest({
        studioId,
        parentName,
        email,
        childName,
        phone,
        classId: selectedClassId ?? "",
        className: selectedClass?.name ?? "",
        disciplineKey: filter,
        disciplineLabel,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The studio's own GA4 previously saw page views and nothing else, so an
      // enquiry — the outcome the whole page exists for — was unmeasurable.
      trackConversion("generate_lead", {
        item_name: selectedClass?.name ?? disciplineLabel ?? undefined,
        method: "enrol-page",
      });
      setSubmitted(true);
    });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-base p-6 text-ink">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={studioName}
              className="mx-auto mb-4 h-12 w-auto max-w-[200px] object-contain"
            />
          ) : null}
          <p className="text-xs uppercase tracking-widest text-muted">
            {tagline ?? studioName}
          </p>
          <h1 className="mt-2 text-3xl font-black uppercase tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-muted">{t("subtitle")}</p>
        </div>

        <AnimatePresence mode="wait">
          {submitted ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="box rounded-3xl p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 18, delay: 0.1 }}
                className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full text-2xl text-white"
                style={{ background: "var(--brand)" }}
              >
                ✓
              </motion.div>
              <h2 className="text-xl font-black">{t("success.title")}</h2>
              <p className="mt-2 text-sm text-muted">
                {t("success.body", {
                  name: parentName.split(" ")[0],
                  email,
                })}
              </p>
              <Link
                href="/"
                className="btn-glow btn-glow--solid mt-6 inline-flex justify-center px-6 py-3 text-sm"
              >
                {t("success.backHome")}
              </Link>
            </motion.div>
          ) : step === 0 ? (
            <motion.div
              key="classes"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="box rounded-3xl p-7"
            >
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("steps.pickClass")}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {DISCIPLINE_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setFilter(key);
                      if (key === "notSure") setSelectedClassId(null);
                    }}
                    className="rounded-full border px-3 py-1.5 text-xs font-medium transition-all"
                    style={{
                      borderColor: filter === key ? "var(--brand)" : "var(--hair)",
                      background: filter === key ? "var(--brand)" : "transparent",
                      color: filter === key ? "#fff" : "var(--muted)",
                    }}
                  >
                    {t(`disciplines.${key}`)}
                  </button>
                ))}
              </div>

              {filter !== "notSure" && classes.length > 0 && (
                <div className="mt-5 space-y-2 max-h-64 overflow-y-auto pr-1">
                  {filteredClasses.length === 0 ? (
                    <p className="text-sm text-muted">{t("noClassesForStyle")}</p>
                  ) : (
                    filteredClasses.map((cls) => {
                      const selected = selectedClassId === cls.id;
                      const day =
                        cls.dayOfWeek !== null ? dayShort[cls.dayOfWeek] : null;
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => setSelectedClassId(cls.id)}
                          className="w-full rounded-xl border p-3 text-left transition-all"
                          style={{
                            borderColor: selected ? "var(--brand)" : "var(--hair)",
                            background: selected ? "color-mix(in srgb, var(--brand) 8%, transparent)" : "transparent",
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-ink">{cls.name}</p>
                              <p className="text-xs text-muted">
                                {[day, fmtTime(cls.startTime), cls.level].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            {cls.priceCents > 0 && (
                              <span className="text-xs font-medium text-muted">
                                {formatMoney(cls.priceCents)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={filter !== "notSure" && !selectedClassId && filteredClasses.length > 0}
                className="btn-glow btn-glow--solid mt-6 w-full justify-center disabled:opacity-50"
              >
                {t("continue")}
              </button>
            </motion.div>
          ) : (
            <motion.form
              key="form"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              onSubmit={onSubmit}
              className="box rounded-3xl p-7"
            >
              <button
                type="button"
                onClick={() => setStep(0)}
                className="mb-4 text-xs font-medium text-muted hover:text-ink"
              >
                ← {t("backToClasses")}
              </button>

              {selectedClass && (
                <p className="box mb-4 rounded-xl px-3 py-2 text-sm">
                  <span className="text-muted">{t("selectedClass")}: </span>
                  <span className="font-semibold">{selectedClass.name}</span>
                </p>
              )}

              <div className="space-y-4">
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                    {t("fields.name")}
                  </span>
                  <input
                    type="text"
                    required
                    className="field-premium"
                    placeholder={t("fields.namePlaceholder")}
                    value={parentName}
                    onChange={(e) => setParentName(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                    {t("fields.childName")}
                  </span>
                  <input
                    type="text"
                    required
                    className="field-premium"
                    placeholder={t("fields.childNamePlaceholder")}
                    value={childName}
                    onChange={(e) => setChildName(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                    {t("fields.email")}
                  </span>
                  <input
                    type="email"
                    required
                    className="field-premium"
                    placeholder={t("fields.emailPlaceholder")}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
                    {t("fields.phone")}
                  </span>
                  <input
                    type="tel"
                    className="field-premium"
                    placeholder={t("fields.phonePlaceholder")}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>
              </div>

              {error && (
                <p className="mt-4 text-sm text-red-600">{error}</p>
              )}

              <button
                type="submit"
                disabled={pending || !parentName.trim() || !childName.trim() || !email.trim()}
                className="btn-glow btn-glow--solid mt-6 w-full justify-center disabled:opacity-50"
              >
                {pending ? t("submitting") : t("submit")}
              </button>

              <p className="mt-4 text-center text-xs text-muted">
                {t("hasAccount")}{" "}
                <Link href="/login" className="text-ink underline">
                  {t("signIn")}
                </Link>
              </p>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-10 flex justify-center">
          <PoweredByOlune />
        </div>
      </div>
    </div>
  );
}

export function EnrolNoStudio() {
  const t = useTranslations("enrol");
  return (
    <div className="grid min-h-screen place-items-center bg-base p-8 text-center text-ink">
      <div className="max-w-md">
        <h1 className="text-2xl font-black">{t("noStudio.title")}</h1>
        <p className="mt-2 text-sm text-muted">{t("noStudio.body")}</p>
        <Link href="/" className="btn-glow mt-6 inline-flex px-6 py-3 text-sm">
          {t("noStudio.back")}
        </Link>
      </div>
    </div>
  );
}
