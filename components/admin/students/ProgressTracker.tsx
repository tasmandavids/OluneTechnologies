"use client";
import { useTranslations } from "next-intl";

// ============================================================================
//  ProgressTracker — log + timeline of a student's progress entries.
//  Add-entry form (note, level, certification badges) + reverse-chronological
//  timeline. Used by both the admin student-detail page and (read-mostly) the
//  teacher portal. Writes go through the shared logProgress server action.
// ============================================================================

import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  logProgress,
  deleteProgress,
} from "@/app/portal/admin/students/[id]/actions";
import { useFormatDateMedium } from "@/lib/i18n/client";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

export type ProgressEntry = {
  id: string;
  notes: string | null;
  level: string | null;
  certifications: string[];
  loggedAt: string;
  instructorName: string | null;
};

interface Props {
  studentId: string;
  entries: ProgressEntry[];
  /** Hide the delete control (e.g. teacher view). Defaults to false. */
  readOnlyDelete?: boolean;
  /** Hide the log form and delete controls (e.g. parent view). */
  readOnly?: boolean;
  /** Override the empty-state message (e.g. parent-facing copy). */
  emptyMessage?: string;
  /** Show PDF download links on certification badges in the timeline. */
  certificateDownloadEnabled?: boolean;
}

const LEVEL_KEYS = [
  "beginner",
  "improver",
  "intermediate",
  "advanced",
  "preProfessional",
] as const;

const LEVEL_VALUES: Record<(typeof LEVEL_KEYS)[number], string> = {
  beginner: "Beginner",
  improver: "Improver",
  intermediate: "Intermediate",
  advanced: "Advanced",
  preProfessional: "Pre-Professional",
};

export default function ProgressTracker({
  studentId,
  entries,
  readOnlyDelete = false,
  readOnly = false,
  emptyMessage,
  certificateDownloadEnabled = false,
}: Props) {
  const t = useTranslations("admin.students.progress");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const formatWhen = useFormatDateMedium();
  const [notes, setNotes] = useState("");
  const [level, setLevel] = useState("");
  const [certInput, setCertInput] = useState("");
  const [certs, setCerts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function addCert() {
    const c = certInput.trim();
    if (c && !certs.includes(c)) setCerts((prev) => [...prev, c]);
    setCertInput("");
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await logProgress({
        studentId,
        notes,
        level,
        certifications: certs,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotes("");
      setLevel("");
      setCerts([]);
      setCertInput("");
    });
  }

  function remove(entryId: string) {
    startTransition(async () => {
      await deleteProgress(entryId, studentId);
    });
  }

  const hideDelete = readOnly || readOnlyDelete;

  function certDownloadHref(entryId: string, title: string) {
    const params = new URLSearchParams({ progressId: entryId, title });
    return `/api/certificates/download?${params.toString()}`;
  }

  return (
    <div className="space-y-8">
      {/* ── Log a new entry ─────────────────────────────────────────────── */}
      {!readOnly && (
      <GlassPanel className="!p-5">
        <h2 className="mb-4 text-sm font-black text-ink">{t("logProgress")}</h2>

        <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
          {t("instructorNotes")}
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder={t("notesPlaceholder")}
          className="mb-4 w-full resize-none rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-[--brand] focus:outline-none"
        />

        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
              {t("level")}
            </label>
            <select
              value={level}
              onChange={(e) => setLevel(e.target.value)}
              className="w-full rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink focus:border-[--brand] focus:outline-none"
            >
              <option value="">{tShared("unchanged")}</option>
              {LEVEL_KEYS.map((key) => (
                <option key={key} value={LEVEL_VALUES[key]}>
                  {tShared(`progressLevels.${key}`)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
              {t("awardCertification")}
            </label>
            <div className="flex gap-2">
              <input
                value={certInput}
                onChange={(e) => setCertInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCert();
                  }
                }}
                placeholder={t("certPlaceholder")}
                className="flex-1 rounded-xl border border-[--hair] bg-base px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-[--brand] focus:outline-none"
              />
              <button
                type="button"
                onClick={addCert}
                className="shrink-0 rounded-xl border border-[--hair] px-3 py-2 text-sm text-muted hover:text-ink"
              >
                {tCommon("add")}
              </button>
            </div>
          </div>
        </div>

        {certs.length > 0 && (
          <div className="mb-4 flex flex-wrap gap-2">
            {certs.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] px-3 py-1 text-xs font-semibold text-[--brand]"
              >
                🏅 {c}
                <button
                  type="button"
                  onClick={() => setCerts((prev) => prev.filter((x) => x !== c))}
                  className="text-[--brand] hover:opacity-70"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        {error && (
          <p className="mb-3 rounded-xl bg-red-500/10 px-3 py-2 text-xs text-red-500">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={pending}
          className="rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{ background: "var(--brand)" }}
        >
          {pending ? tShared("saving") : t("saveEntry")}
        </button>
      </GlassPanel>
      )}

      {/* ── Timeline ────────────────────────────────────────────────────── */}
      <section>
        <h2 className="mb-4 text-xs uppercase tracking-widest text-muted">
          {t("history", { count: entries.length })}
        </h2>

        {entries.length === 0 ? (
          <GlassPanel className="!py-10 !px-6">
            <p className="text-center text-sm text-muted">
              {emptyMessage ?? t("empty")}
            </p>
          </GlassPanel>
        ) : (
          <ol className="relative space-y-5 border-l border-[--hair] pl-6">
            <AnimatePresence initial={false}>
              {entries.map((entry) => (
                <motion.li
                  key={entry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  className="relative"
                >
                  <span
                    className="absolute -left-[1.7rem] top-1.5 h-3 w-3 rounded-full border-2 border-surface"
                    style={{ background: "var(--brand)" }}
                  />
                  <div className="box rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {entry.level && (
                          <span className="rounded-full bg-[color-mix(in_srgb,var(--brand)_14%,transparent)] px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider text-[--brand]">
                            {entry.level}
                          </span>
                        )}
                        <span className="text-xs text-muted">
                          {formatWhen(entry.loggedAt)}
                          {entry.instructorName ? ` · ${entry.instructorName}` : ""}
                        </span>
                      </div>
                      {!hideDelete && (
                        <button
                          onClick={() => remove(entry.id)}
                          disabled={pending}
                          className="shrink-0 text-xs text-muted transition-colors hover:text-red-400"
                        >
                          {tCommon("delete")}
                        </button>
                      )}
                    </div>

                    {entry.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-sm text-ink">
                        {entry.notes}
                      </p>
                    )}

                    {entry.certifications.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {entry.certifications.map((c) =>
                          certificateDownloadEnabled ? (
                            <a
                              key={c}
                              href={certDownloadHref(entry.id, c)}
                              download
                              className="box-pill inline-flex items-center gap-1 px-2.5 py-0.5 text-[0.62rem] font-semibold text-ink transition-colors hover:text-[--brand]"
                            >
                              🏅 {c} ↓
                            </a>
                          ) : (
                            <span
                              key={c}
                              className="box-pill inline-flex items-center gap-1 px-2.5 py-0.5 text-[0.62rem] font-semibold text-ink"
                            >
                              🏅 {c}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </section>
    </div>
  );
}
