"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useFullDayNames, useTimeGreeting, useFormatTimeShort } from "@/lib/i18n/client";
import type { EnrolledClass } from "@/app/portal/student/page";

const SHOW_DAYS = [1, 2, 3, 4, 5, 6];

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

function discColor(discipline: string | null) {
  return discipline && DISC_COLORS[discipline] ? DISC_COLORS[discipline] : "var(--brand)";
}

export default function StudentTimetable({
  classes,
  studentName,
  todayDow,
}: {
  classes: EnrolledClass[];
  studentName: string | null;
  todayDow: number;
  dayNames?: string[];
}) {
  const t = useTranslations("student.timetable");
  const locale = useLocale();
  const dayNames = useFullDayNames();
  const greeting = useTimeGreeting();
  const fmt = useFormatTimeShort();
  const today = classes.filter((c) => c.dayOfWeek === todayDow);

  const firstName = studentName?.split(" ")[0];
  const greetingLine = firstName
    ? t("greetingWithName", { greeting, name: firstName })
    : t("greetingOnly", { greeting });

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className="mx-auto max-w-5xl space-y-10 p-6"
    >
      <motion.header
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-sm text-muted">{greetingLine}</p>
          <h1 className="text-2xl font-black tracking-tight text-ink">{t("title")}</h1>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-sm text-muted">
            {new Date().toLocaleDateString(locale, {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <Link
            href="/portal/student/progress"
            className="text-xs font-semibold text-[--brand] hover:underline"
          >
            {t("viewProgress")}
          </Link>
        </div>
      </motion.header>

      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
          {t("today", { day: dayNames[todayDow] })}
        </h2>
        {today.length === 0 ? (
          <div className="box rounded-2xl px-6 py-8 text-center">
            <p className="text-sm text-muted">{t("noClassesToday")}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {today.map((c) => (
              <div
                key={c.enrollmentId}
                className="box relative overflow-hidden rounded-2xl p-5"
                style={{ boxShadow: `inset 3px 0 0 ${discColor(c.discipline)}, var(--box-shadow)` }}
              >
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `radial-gradient(80% 80% at 0% 50%, ${discColor(c.discipline)}18, transparent 70%)`,
                  }}
                />
                <div className="relative flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-black text-ink">{c.name}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {c.discipline && <span>{c.discipline} · </span>}
                      {c.level && <span>{c.level} · </span>}
                      {c.teacherName && <span>{c.teacherName}</span>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-black tabular-nums text-ink">{fmt(c.startTime)}</p>
                    {c.endTime && (
                      <p className="text-xs text-muted">{t("until", { time: fmt(c.endTime) })}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.section>

      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">{t("weeklySchedule")}</h2>
        <div className="box overflow-x-auto rounded-2xl p-4">
          <div
            className="grid min-w-[480px] gap-2"
            style={{ gridTemplateColumns: `repeat(${SHOW_DAYS.length}, minmax(0,1fr))` }}
          >
            {SHOW_DAYS.map((d) => (
              <div
                key={d}
                className={`pb-2 text-center text-[0.65rem] font-semibold uppercase tracking-wider ${
                  d === todayDow ? "text-brand" : "text-muted"
                }`}
              >
                {dayNames[d].slice(0, 3)}
              </div>
            ))}
            {SHOW_DAYS.map((d) => {
              const dayClasses = classes.filter((c) => c.dayOfWeek === d);
              return (
                <div key={d} className="flex flex-col gap-1.5 min-h-[60px]">
                  {dayClasses.map((c) => (
                    <div
                      key={c.enrollmentId}
                      className="rounded-lg px-2 py-1.5 text-center"
                      style={{
                        background: `${discColor(c.discipline)}22`,
                        borderLeft: `2px solid ${discColor(c.discipline)}`,
                      }}
                    >
                      <p className="text-[0.65rem] font-bold leading-tight text-ink">{c.name}</p>
                      {c.startTime && (
                        <p className="text-[0.58rem] text-muted">{fmt(c.startTime)}</p>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </motion.section>

      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
          {t("myClasses", { count: classes.length })}
        </h2>
        {classes.length === 0 ? (
          <div className="box rounded-2xl px-6 py-10 text-center">
            <p className="text-sm text-muted">{t("noEnrolments")}</p>
            <p className="mt-1 text-xs text-muted">{t("noEnrolmentsHint")}</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {classes.map((c) => (
              <motion.div
                key={c.enrollmentId}
                whileHover={{ y: -2 }}
                className="box rounded-2xl p-4"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: discColor(c.discipline) }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink truncate">{c.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.discipline && <>{c.discipline} · </>}
                      {c.level}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <span>{dayNames[c.dayOfWeek]}</span>
                      {c.startTime && (
                        <span>
                          {fmt(c.startTime)}
                          {c.endTime ? ` – ${fmt(c.endTime)}` : ""}
                        </span>
                      )}
                      {c.teacherName && <span>{t("withTeacher", { name: c.teacherName })}</span>}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.section>
    </motion.div>
  );
}
