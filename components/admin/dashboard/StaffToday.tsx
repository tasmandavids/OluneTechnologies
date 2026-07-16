"use client";

// ============================================================================
//  StaffToday — which teachers are working today, derived client-side from
//  the already-fetched weekly schedule (no extra query). "Live now" is a
//  cosmetic client-clock comparison; todayDow itself comes from the server
//  (page.tsx) so the day boundary matches the rest of the dashboard.
// ============================================================================

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useFormatTimeShort } from "@/lib/i18n/client";
import type { ScheduleClass } from "./types";
import type { TeacherOption } from "@/app/portal/admin/classes/page";

function initials(name: string | null): string {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

export function StaffToday({
  scheduleClasses,
  teachers,
  todayDow,
}: {
  scheduleClasses: ScheduleClass[];
  teachers: TeacherOption[];
  todayDow: number;
}) {
  const t = useTranslations("admin.dashboard.staffToday");
  const formatTime = useFormatTimeShort();

  const rows = useMemo(() => {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
    const toMin = (hhmm: string | null) => {
      if (!hhmm) return null;
      const [h, m] = hhmm.split(":").map(Number);
      return h * 60 + m;
    };

    const todays = scheduleClasses.filter(
      (c) => c.dayOfWeek === todayDow && c.teacherId && c.startTime,
    );

    const byTeacher = new Map<string, ScheduleClass[]>();
    for (const cls of todays) {
      const list = byTeacher.get(cls.teacherId as string) ?? [];
      list.push(cls);
      byTeacher.set(cls.teacherId as string, list);
    }

    return teachers
      .filter((teacher) => byTeacher.has(teacher.id))
      .map((teacher) => {
        const classes = (byTeacher.get(teacher.id) ?? []).sort((a, b) =>
          (a.startTime ?? "").localeCompare(b.startTime ?? ""),
        );
        const live = classes.some((c) => {
          const start = toMin(c.startTime);
          const end = start !== null ? start + c.durationMin : null;
          return start !== null && end !== null && nowMin >= start && nowMin < end;
        });
        const next = classes.find((c) => {
          const start = toMin(c.startTime);
          return start !== null && start + c.durationMin > nowMin;
        });
        return { teacher, count: classes.length, live, nextTime: next?.startTime ?? null };
      });
  }, [scheduleClasses, teachers, todayDow]);

  return (
    <div>
      <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("title")}</h2>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[--hair] bg-surface px-3.5 py-3 text-xs text-muted">
          {t("empty")}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(({ teacher, count, live, nextTime }) => (
            <div
              key={teacher.id}
              className="flex items-center gap-2.5 rounded-xl border border-[--hair] bg-surface px-2.5 py-2"
            >
              <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-xs font-bold text-[--brand-deep]">
                {initials(teacher.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-ink">{teacher.name}</p>
                <p className="truncate text-[11.5px] text-muted">
                  {t("classCount", { count })}
                  {!live && nextTime ? ` · ${t("nextAt", { time: formatTime(nextTime) })}` : ""}
                  {live ? ` · ${t("live")}` : ""}
                </p>
              </div>
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{
                  background: live ? "var(--brand)" : "var(--hair)",
                  boxShadow: live ? "0 0 0 3px color-mix(in srgb, var(--brand) 18%, transparent)" : "none",
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
