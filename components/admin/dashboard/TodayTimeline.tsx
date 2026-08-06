"use client";

// ============================================================================
//  TodayTimeline — today's + tomorrow's classes as a vertical timeline rail
//  (dot per class, connected by a hairline), derived from the scheduleClasses
//  prop already fetched for ScheduleBoard (no new query). Status
//  (done/live/upcoming) is computed client-side from wall-clock time vs. each
//  class's start/duration, after mount so SSR markup stays stable.
//
//  Every row is fluid: the name/teacher column wraps and the row grows, so
//  longer class names or extra meta never clip. The widget's grid slot grows
//  with it — DashboardGrid measures content and raises the item's minH.
// ============================================================================

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useFormatTimeShort } from "@/lib/i18n/client";
import type { ScheduleClass } from "./types";

type Status = "done" | "live" | "upcoming";

function rowStatus(cls: ScheduleClass, nowMin: number): Status {
  if (!cls.startTime) return "upcoming";
  const [h, m] = cls.startTime.split(":").map(Number);
  const start = h * 60 + m;
  const end = start + cls.durationMin;
  if (nowMin >= end) return "done";
  if (nowMin >= start) return "live";
  return "upcoming";
}

/** Minutes-since-midnight, refreshed each minute. `null` until mounted so the
 *  server and first client render agree. */
function useNowMin(): number | null {
  const [nowMin, setNowMin] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  return nowMin;
}

function minutesToHHMM(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function CapacityBar({ enrolled, capacity, live }: { enrolled: number; capacity: number; live: boolean }) {
  const pct = capacity > 0 ? Math.min(100, Math.round((enrolled / capacity) * 100)) : 0;
  return (
    <span
      className="mt-[7px] block h-[3px] w-full overflow-hidden rounded-full"
      style={{ background: "color-mix(in srgb, var(--text) 10%, transparent)" }}
    >
      <span
        className="block h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, background: live ? "var(--brand)" : "var(--text)" }}
      />
    </span>
  );
}

function TimelineRow({
  cls,
  status,
  isFirst,
  isLast,
}: {
  cls: ScheduleClass;
  status: Status;
  isFirst: boolean;
  isLast: boolean;
}) {
  const t = useTranslations("admin.dashboard.today");
  const formatTime = useFormatTimeShort();
  const live = status === "live";
  const meta = [cls.teacherName, cls.room].filter(Boolean).join(" · ");

  return (
    <div
      className="relative grid grid-cols-[minmax(44px,auto)_14px_minmax(0,1fr)_minmax(56px,auto)] items-start gap-x-3 rounded-[12px] px-2.5 py-2.5"
      style={{
        opacity: status === "done" ? 0.5 : 1,
        background: live ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "transparent",
      }}
    >
      <span className="pt-[1px] text-[12.5px] tabular-nums text-muted">
        {cls.startTime ? formatTime(cls.startTime) : "—"}
      </span>

      {/* Rail: hairline through the whole row, capped at the first/last dot. */}
      <span aria-hidden className="relative self-stretch">
        <span
          className="absolute left-1/2 w-px -translate-x-1/2"
          style={{
            top: isFirst ? 8 : 0,
            bottom: isLast ? "calc(100% - 8px)" : 0,
            background: "color-mix(in srgb, var(--text) 14%, transparent)",
          }}
        />
        <span
          className={`absolute left-1/2 top-[4px] h-[8px] w-[8px] -translate-x-1/2 rounded-full ${live ? "animate-[admin-breathe_2.6s_ease-in-out_infinite]" : ""}`}
          style={{
            background: live ? "var(--brand)" : "var(--text)",
            boxShadow: live ? "0 0 0 4px color-mix(in srgb, var(--brand) 22%, transparent)" : undefined,
          }}
        />
      </span>

      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[14px] font-semibold leading-[1.3] text-ink">
          <span className="min-w-0">{cls.name}</span>
          {live && (
            <span
              className="inline-flex shrink-0 items-center rounded-full px-2 py-[1px] text-[10px] font-bold uppercase tracking-[0.08em] text-white"
              style={{ background: "var(--brand)" }}
            >
              {t("status.live")}
            </span>
          )}
        </span>
        {meta && <span className="text-[12.5px] leading-[1.35] text-muted">{meta}</span>}
      </span>

      <span
        className="flex flex-col items-end"
        aria-label={t("enrolled", { count: cls.enrolled })}
        title={t("enrolled", { count: cls.enrolled })}
      >
        <span className="text-[12.5px] tabular-nums text-muted">
          {cls.capacity > 0 ? `${cls.enrolled}/${cls.capacity}` : cls.enrolled}
        </span>
        {cls.capacity > 0 && <CapacityBar enrolled={cls.enrolled} capacity={cls.capacity} live={live} />}
      </span>
    </div>
  );
}

function DayList({
  classes,
  nowMin,
  emptyLabel,
}: {
  classes: ScheduleClass[];
  /** `null` = don't compute live/done status (tomorrow, or pre-mount). */
  nowMin: number | null;
  emptyLabel: string;
}) {
  const sorted = useMemo(
    () => [...classes].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? "")),
    [classes],
  );

  if (sorted.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-col p-2">
      {sorted.map((cls, i) => (
        <TimelineRow
          key={cls.id}
          cls={cls}
          status={nowMin === null ? "upcoming" : rowStatus(cls, nowMin)}
          isFirst={i === 0}
          isLast={i === sorted.length - 1}
        />
      ))}
    </div>
  );
}

export function TodayTimeline({
  scheduleClasses,
  todayDow,
}: {
  scheduleClasses: ScheduleClass[];
  todayDow: number;
}) {
  const t = useTranslations("admin.dashboard.today");
  const formatTime = useFormatTimeShort();
  const nowMin = useNowMin();
  const tomorrowDow = (todayDow + 1) % 7;

  const today = useMemo(() => scheduleClasses.filter((c) => c.dayOfWeek === todayDow), [scheduleClasses, todayDow]);
  const tomorrow = useMemo(
    () => scheduleClasses.filter((c) => c.dayOfWeek === tomorrowDow),
    [scheduleClasses, tomorrowDow],
  );
  const todayStudents = today.reduce((sum, c) => sum + c.enrolled, 0);
  const tomorrowStudents = tomorrow.reduce((sum, c) => sum + c.enrolled, 0);

  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <div className="mb-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("title")}</h2>
          {nowMin !== null && (
            <span className="ml-auto flex items-center gap-1.5 text-[12px] tabular-nums text-muted">
              <span
                className="h-[6px] w-[6px] animate-[admin-breathe_2.6s_ease-in-out_infinite] rounded-full"
                style={{ background: "var(--brand)" }}
              />
              {formatTime(minutesToHHMM(nowMin))}
            </span>
          )}
        </div>
        <div className="box rounded-[14px]">
          <DayList classes={today} nowMin={nowMin} emptyLabel={t("empty")} />
        </div>
        <p className="mt-2 px-1 text-[12px] text-muted">{t("hint", { count: today.length, students: todayStudents })}</p>
      </div>

      <div>
        <div className="mb-2.5 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("tomorrowTitle")}</h2>
        </div>
        <div className="box rounded-[14px]">
          <DayList classes={tomorrow} nowMin={null} emptyLabel={t("empty")} />
        </div>
        <p className="mt-2 px-1 text-[12px] text-muted">
          {t("hint", { count: tomorrow.length, students: tomorrowStudents })}
        </p>
      </div>
    </div>
  );
}
