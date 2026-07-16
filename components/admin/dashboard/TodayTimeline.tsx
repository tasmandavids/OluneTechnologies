"use client";

// ============================================================================
//  TodayTimeline — compact read-only rows for today's + tomorrow's classes,
//  derived from the scheduleClasses prop already fetched for ScheduleBoard
//  (no new query). Status (done/live/upcoming) is computed from wall-clock
//  time vs. each class's start/duration — cosmetic, client-only.
// ============================================================================

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useFormatTimeShort } from "@/lib/i18n/client";
import type { ScheduleClass } from "./types";
import { IconCheckCircle } from "./icons";

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

function DayList({
  classes,
  showStatus,
  emptyLabel,
}: {
  classes: ScheduleClass[];
  showStatus: boolean;
  emptyLabel: string;
}) {
  const t = useTranslations("admin.dashboard.today");
  const formatTime = useFormatTimeShort();
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();

  const sorted = [...classes].sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));

  if (sorted.length === 0) {
    return <p className="px-4 py-6 text-center text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <div>
      {sorted.map((cls) => {
        const status = showStatus ? rowStatus(cls, nowMin) : "upcoming";
        return (
          <div
            key={cls.id}
            className="grid grid-cols-[56px_1fr_auto] items-center gap-3 border-b border-[--hair] px-4 py-3 text-sm last:border-b-0"
            style={{
              opacity: status === "done" ? 0.55 : 1,
              background: status === "live" ? "color-mix(in srgb, var(--brand) 6%, transparent)" : "transparent",
            }}
          >
            <span className="text-xs font-medium tabular-nums text-muted">
              {cls.startTime ? formatTime(cls.startTime) : "—"}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2 truncate font-semibold text-ink">
                {cls.name}
                {status === "live" && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                    style={{ background: "var(--brand)" }}
                  >
                    {t("status.live")}
                  </span>
                )}
              </span>
              <span className="block truncate text-xs text-muted">
                {[cls.teacherName, cls.room].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-xs tabular-nums text-muted">
              {status === "done" ? (
                <>
                  <IconCheckCircle className="h-3.5 w-3.5" style={{ color: "#16a34a" }} />
                  {cls.enrolled}/{cls.capacity}
                </>
              ) : (
                t("enrolled", { count: cls.enrolled })
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function TodayTimeline({
  scheduleClasses,
  todayDow,
  onFullTimetable,
}: {
  scheduleClasses: ScheduleClass[];
  todayDow: number;
  onFullTimetable: () => void;
}) {
  const t = useTranslations("admin.dashboard.today");
  const tomorrowDow = (todayDow + 1) % 7;

  const today = useMemo(() => scheduleClasses.filter((c) => c.dayOfWeek === todayDow), [scheduleClasses, todayDow]);
  const tomorrow = useMemo(
    () => scheduleClasses.filter((c) => c.dayOfWeek === tomorrowDow),
    [scheduleClasses, tomorrowDow],
  );
  const todayStudents = today.reduce((sum, c) => sum + c.enrolled, 0);
  const tomorrowStudents = tomorrow.reduce((sum, c) => sum + c.enrolled, 0);

  return (
    <div className="flex flex-col gap-5">
      <section className="overflow-hidden rounded-2xl border border-[--hair] bg-surface">
        <div className="flex items-center justify-between gap-3 border-b border-[--hair] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">{t("title")}</h2>
            <p className="text-xs text-muted">{t("hint", { count: today.length, students: todayStudents })}</p>
          </div>
          <button
            type="button"
            onClick={onFullTimetable}
            className="rounded-lg border border-[--hair] px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-base"
          >
            {t("fullTimetable")}
          </button>
        </div>
        <DayList classes={today} showStatus emptyLabel={t("empty")} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-[--hair] bg-surface">
        <div className="border-b border-[--hair] px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">{t("tomorrowTitle")}</h2>
          <p className="text-xs text-muted">{t("hint", { count: tomorrow.length, students: tomorrowStudents })}</p>
        </div>
        <DayList classes={tomorrow} showStatus={false} emptyLabel={t("empty")} />
      </section>
    </div>
  );
}
