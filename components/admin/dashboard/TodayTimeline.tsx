"use client";

// ============================================================================
//  TodayTimeline — compact read-only rows for today's + tomorrow's classes,
//  derived from the scheduleClasses prop already fetched for ScheduleBoard
//  (no new query). Status (done/live/upcoming) is computed from wall-clock
//  time vs. each class's start/duration — cosmetic, client-only. Row grid
//  matches the Dashboard V2 mockup's .tl .row exactly (56px/1fr/150px/92px).
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
    <div className="flex flex-col gap-0.5 p-1.5">
      {sorted.map((cls) => {
        const status = showStatus ? rowStatus(cls, nowMin) : "upcoming";
        return (
          <div
            key={cls.id}
            className="grid grid-cols-[56px_minmax(0,1fr)_92px] items-start gap-2.5 rounded-[12px] px-4 py-3 text-[13.5px]"
            style={{
              opacity: status === "done" ? 0.55 : 1,
              background: status === "live" ? "color-mix(in srgb, var(--brand) 10%, transparent)" : "transparent",
            }}
          >
            <span className="text-[12.5px] tabular-nums text-muted">
              {cls.startTime ? formatTime(cls.startTime) : "—"}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 font-semibold text-ink">
                <span className="min-w-0">{cls.name}</span>
                {status === "live" && (
                  <span
                    className="inline-flex shrink-0 items-center gap-[5px] rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-white"
                    style={{ background: "var(--brand)" }}
                  >
                    <span className="h-[5px] w-[5px] shrink-0 animate-[admin-breathe_2.6s_ease-in-out_infinite] rounded-full bg-white" />
                    {t("status.live")}
                  </span>
                )}
              </span>
              <span className="text-[12.5px] text-muted">
                {[cls.teacherName, cls.room].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="flex items-center justify-end gap-1.5 text-[12.5px] tabular-nums text-muted">
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
}: {
  scheduleClasses: ScheduleClass[];
  todayDow: number;
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
    <div className="flex flex-col gap-[18px]">
      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("title")}</h2>
          <span className="ml-auto text-xs text-muted">{t("hint", { count: today.length, students: todayStudents })}</span>
        </div>
        <div className="box overflow-hidden rounded-[14px]">
          <DayList classes={today} showStatus emptyLabel={t("empty")} />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-baseline gap-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("tomorrowTitle")}</h2>
          <span className="ml-auto text-xs text-muted">
            {t("hint", { count: tomorrow.length, students: tomorrowStudents })}
          </span>
        </div>
        <div className="box overflow-hidden rounded-[14px]">
          <DayList classes={tomorrow} showStatus={false} emptyLabel={t("empty")} />
        </div>
      </div>
    </div>
  );
}
