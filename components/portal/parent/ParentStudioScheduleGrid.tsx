"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useFormatTimeShort } from "@/lib/i18n/client";
import { formatMoney } from "@/lib/currency";
import {
  STUDIO_SCHEDULE_DAYS,
  classesByDay,
  type StudioScheduleClass,
} from "@/lib/portal/parent-studio-schedule";

// ─── Discipline colours ───────────────────────────────────────────────────────

const DISC_COLORS: Record<string, string> = {
  Ballet: "#C8102E",
  Jazz: "#5B5BFF",
  "Hip-Hop": "#E84A8A",
  Contemporary: "#13B6A4",
  Tap: "#C9A227",
  Lyrical: "#8B5CF6",
  Acro: "#F97316",
  Pointe: "#EC4899",
};

function classColor(cls: StudioScheduleClass) {
  const disc = cls.discipline;
  return disc && DISC_COLORS[disc] ? DISC_COLORS[disc] : "var(--brand)";
}

// ─── Detail modal ─────────────────────────────────────────────────────────────

function ClassDetailModal({
  cls,
  onClose,
}: {
  cls: StudioScheduleClass;
  onClose: () => void;
}) {
  const t = useTranslations("parent.studioSchedule");
  const fmt = useFormatTimeShort();
  const color = classColor(cls);

  const meta = [cls.discipline, cls.level, cls.stream].filter(Boolean).join(" · ");
  const timeLabel =
    cls.startTime &&
    `${fmt(cls.startTime)}${cls.endTime ? ` – ${fmt(cls.endTime)}` : ""}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0, y: 8 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.96, opacity: 0, y: 8 }}
        className="w-full max-w-sm rounded-2xl border border-[--hair] bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* colour accent strip */}
        <div
          className="mb-4 h-1 w-12 rounded-full"
          style={{ background: color }}
          aria-hidden
        />
        <h2 className="text-xl font-black leading-tight text-ink">{cls.name}</h2>
        {meta && <p className="mt-1 text-sm text-muted">{meta}</p>}
        {timeLabel && (
          <p className="mt-2 text-base font-semibold text-ink">{timeLabel}</p>
        )}
        {cls.room && (
          <p className="mt-0.5 text-xs text-muted">Room: {cls.room}</p>
        )}

        <dl className="mt-5 space-y-3 border-t border-[--hair] pt-5 text-sm">
          <div>
            <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
              {t("teacher")}
            </dt>
            <dd className="mt-0.5 font-medium text-ink">
              {cls.teacherName ?? t("teacherTba")}
            </dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
              {t("costPerTerm")}
            </dt>
            <dd className="mt-0.5 text-lg font-black text-brand">
              {cls.priceCents > 0 ? formatMoney(cls.priceCents) : t("free")}
            </dd>
          </div>
        </dl>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-xl border border-[--hair] py-2.5 text-sm font-semibold text-muted hover:text-ink transition-colors"
        >
          {t("close")}
        </button>
      </motion.div>
    </motion.div>
  );
}

// ─── Single class card ────────────────────────────────────────────────────────

function ClassCard({
  cls,
  onClick,
  compact = false,
}: {
  cls: StudioScheduleClass;
  onClick: () => void;
  compact?: boolean;
}) {
  const fmt = useFormatTimeShort();
  const color = classColor(cls);

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full rounded-lg text-left transition-all hover:shadow-md active:scale-[0.98]"
      style={{
        background: `${color}12`,
        borderLeft: `3px solid ${color}`,
      }}
    >
      <div className={compact ? "px-2 py-1.5" : "px-2.5 py-2"}>
        <p
          className={`font-semibold leading-snug text-ink truncate ${
            compact ? "text-xs" : "text-sm"
          }`}
        >
          {cls.name}
        </p>
        {cls.startTime && (
          <p className={`mt-0.5 text-muted ${compact ? "text-[0.65rem]" : "text-xs"}`}>
            {fmt(cls.startTime)}
            {cls.endTime && <span className="opacity-70"> – {fmt(cls.endTime)}</span>}
          </p>
        )}
        {!compact && cls.discipline && (
          <p className="mt-0.5 text-[0.65rem] font-medium" style={{ color }}>
            {[cls.discipline, cls.level].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Discipline legend ────────────────────────────────────────────────────────

function DisciplineLegend({ disciplines }: { disciplines: string[] }) {
  if (disciplines.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {disciplines.map((disc) => {
        const color = DISC_COLORS[disc] ?? "var(--brand)";
        return (
          <span
            key={disc}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: `${color}18`, color }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full flex-shrink-0"
              style={{ background: color }}
              aria-hidden
            />
            {disc}
          </span>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ParentStudioScheduleGrid({
  classes,
}: {
  classes: StudioScheduleClass[];
}) {
  const t = useTranslations("parent.studioSchedule");
  const [selected, setSelected] = useState<StudioScheduleClass | null>(null);

  const byDay = useMemo(() => classesByDay(classes), [classes]);

  const disciplines = useMemo(() => {
    const seen = new Set<string>();
    for (const cls of classes) {
      if (cls.discipline) seen.add(cls.discipline);
    }
    return [...seen].sort();
  }, [classes]);

  const totalClasses = classes.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6"
    >
      {/* ── Header ── */}
      <header className="space-y-3">
        <Link
          href="/portal/parent"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden
            className="opacity-60"
          >
            <path
              d="M9 11L5 7l4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {t("backToHub")}
        </Link>

        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>
          {totalClasses > 0 && (
            <p className="text-sm font-medium text-muted">
              {totalClasses} {totalClasses === 1 ? "class" : "classes"}
            </p>
          )}
        </div>

        {disciplines.length > 0 && <DisciplineLegend disciplines={disciplines} />}
      </header>

      {/* ── Content ── */}
      {classes.length === 0 ? (
        <div className="box rounded-2xl px-6 py-16 text-center">
          <p className="text-base font-medium text-muted">{t("noClasses")}</p>
        </div>
      ) : (
        <>
          {/* Desktop grid (md+) */}
          <div className="box hidden md:block overflow-x-auto rounded-2xl">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-[--hair]">
              {STUDIO_SCHEDULE_DAYS.map(({ key }) => (
                <div
                  key={key}
                  className="border-r border-[--hair] px-3 py-3 text-center last:border-r-0"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-muted">
                    {t(`days.${key}`)}
                  </p>
                </div>
              ))}
            </div>
            {/* Day columns */}
            <div className="grid grid-cols-7 divide-x divide-[--hair]">
              {STUDIO_SCHEDULE_DAYS.map(({ dow, key }) => {
                const dayClasses = byDay.get(dow) ?? [];
                return (
                  <div key={key} className="min-h-[12rem] p-2 space-y-1.5">
                    {dayClasses.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted/40">—</p>
                    ) : (
                      dayClasses.map((cls) => (
                        <ClassCard
                          key={cls.id}
                          cls={cls}
                          onClick={() => setSelected(cls)}
                          compact
                        />
                      ))
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile list (< md) */}
          <div className="space-y-4 md:hidden">
            {STUDIO_SCHEDULE_DAYS.map(({ dow, key }) => {
              const dayClasses = byDay.get(dow) ?? [];
              if (dayClasses.length === 0) return null;
              return (
                <section key={key}>
                  <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">
                    {t(`days.${key}`)}
                  </h2>
                  <div className="space-y-2">
                    {dayClasses.map((cls) => (
                      <ClassCard
                        key={cls.id}
                        cls={cls}
                        onClick={() => setSelected(cls)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}

      <p className="text-xs text-muted">{t("hint")}</p>

      <AnimatePresence>
        {selected && (
          <ClassDetailModal cls={selected} onClose={() => setSelected(null)} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
