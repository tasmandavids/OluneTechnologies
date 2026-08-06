"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useLocale, useTranslations } from "next-intl";
import { useFullDayNames, useTimeGreeting, useFormatTimeShort } from "@/lib/i18n/client";
import { markAttendance } from "@/app/portal/teacher/actions";
import type { TeacherClass } from "@/app/portal/teacher/page";

type AttStatus = "present" | "absent" | "late" | "excused" | null;

function StudioBadge({ name }: { name: string }) {
  return (
    <span className="box-pill inline-flex px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-muted">
      {name}
    </span>
  );
}

function RollCallCard({ cls, todayDate }: { cls: TeacherClass; todayDate: string }) {
  const t = useTranslations("teacher.schedule");
  const fmt = useFormatTimeShort();
  const [statuses, setStatuses] = useState<Record<string, AttStatus>>(() =>
    Object.fromEntries(cls.students.map((s) => [s.studentId, s.attendanceStatus])),
  );
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const attOpts: { value: AttStatus; label: string; color: string }[] = [
    { value: "present", label: t("attendance.present"), color: "#22c55e" },
    { value: "late", label: t("attendance.late"), color: "#f59e0b" },
    { value: "absent", label: t("attendance.absent"), color: "#ef4444" },
    { value: "excused", label: t("attendance.excused"), color: "#8b8b92" },
  ];

  const toggle = (studentId: string, next: AttStatus) => {
    setStatuses((prev) => ({ ...prev, [studentId]: next }));
    startTransition(async () => {
      const result = await markAttendance({
        classId: cls.id,
        studentId,
        date: todayDate,
        status: next ?? "present",
      });
      if (!result.ok) {
        setStatuses((prev) => ({
          ...prev,
          [studentId]:
            cls.students.find((s) => s.studentId === studentId)?.attendanceStatus ?? null,
        }));
        setFeedback(result.error);
        setTimeout(() => setFeedback(null), 3000);
      }
    });
  };

  const markedCount = Object.values(statuses).filter(Boolean).length;
  const total = cls.students.length;

  return (
    <div className="box overflow-hidden rounded-2xl">
      <div
        className="flex items-center justify-between px-5 py-4"
        style={{ background: "color-mix(in srgb, var(--brand) 8%, var(--surface))" }}
      >
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <h3 className="font-black text-ink">{cls.name}</h3>
            <StudioBadge name={cls.studioName} />
          </div>
          <p className="text-xs text-muted">
            {cls.discipline && <>{cls.discipline} · </>}
            {cls.level && <>{cls.level} · </>}
            {fmt(cls.startTime)}
            {cls.endTime && ` – ${fmt(cls.endTime)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-black tabular-nums text-ink">
            {markedCount}/{total}
          </p>
          <p className="text-xs text-muted">{t("marked")}</p>
        </div>
      </div>

      {cls.students.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-muted">{t("noStudents")}</p>
      ) : (
        <ul className="flex flex-col">
          {cls.students.map((student) => {
            const status = statuses[student.studentId];
            return (
              <li key={student.studentId} className="flex items-center gap-3 px-5 py-3">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black text-white"
                  style={{ background: "var(--brand-deep)" }}
                >
                  {student.name?.[0]?.toUpperCase() ?? "?"}
                </span>
                <Link
                  href={`/portal/teacher/students/${student.studentId}`}
                  className="flex-1 text-sm font-medium text-ink hover:text-[--brand] hover:underline"
                >
                  {student.name ?? t("unknownStudent")}
                </Link>
                <div className="flex gap-1">
                  {attOpts.map((opt) => {
                    const active = status === opt.value;
                    return (
                      <button
                        key={opt.value ?? "null"}
                        onClick={() => toggle(student.studentId, active ? null : opt.value)}
                        disabled={pending}
                        title={opt.label}
                        className="rounded-full px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-wide transition-all"
                        style={{
                          background: active
                            ? opt.color
                            : "color-mix(in srgb, var(--text) 6%, transparent)",
                          color: active ? "#fff" : "var(--muted)",
                          borderWidth: 1,
                          borderStyle: "solid",
                          borderColor: active ? opt.color : "var(--hair)",
                        }}
                      >
                        {opt.label[0]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="px-5 py-2 text-xs text-red-400"
          >
            {feedback}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ScheduleRow({ cls, dayName }: { cls: TeacherClass; dayName: string }) {
  const t = useTranslations("teacher.schedule");
  const fmt = useFormatTimeShort();
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="box overflow-hidden rounded-xl">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-4 px-4 py-3 text-left"
      >
        <div className="w-12 shrink-0 text-center">
          <p className="text-[0.62rem] font-semibold uppercase tracking-wider text-muted">
            {dayName.slice(0, 3)}
          </p>
          <p className="text-xs font-bold tabular-nums text-ink">{fmt(cls.startTime)}</p>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-sm text-ink truncate">{cls.name}</p>
            <StudioBadge name={cls.studioName} />
          </div>
          <p className="text-xs text-muted">
            {cls.discipline && <>{cls.discipline} · </>}
            {cls.level && <>{cls.level} · </>}
            {t("studentCount", { count: cls.students.length })}
          </p>
        </div>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          className="shrink-0 text-muted"
          aria-hidden
        >
          ▾
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {cls.students.length === 0 ? (
              <p className="px-5 py-4 text-center text-sm text-muted">{t("noStudents")}</p>
            ) : (
              <ul className="flex flex-col">
                {cls.students.map((student) => (
                  <li key={student.studentId} className="flex items-center gap-3 px-5 py-2.5">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[0.65rem] font-black text-white"
                      style={{ background: "var(--brand-deep)" }}
                    >
                      {student.name?.[0]?.toUpperCase() ?? "?"}
                    </span>
                    <Link
                      href={`/portal/teacher/students/${student.studentId}`}
                      className="flex-1 text-sm font-medium text-ink hover:text-[--brand] hover:underline"
                    >
                      {student.name ?? t("unknownStudent")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TeacherSchedule({
  teacherName,
  classes,
  todayDow,
  todayDate,
  isInstructor = false,
  incomeSummary,
}: {
  teacherName: string | null;
  classes: TeacherClass[];
  todayDow: number;
  todayDate: string;
  dayNames?: string[];
  isInstructor?: boolean;
  incomeSummary?: { paidCents: number; outstandingCents: number; privateClients: number } | null;
}) {
  const t = useTranslations("teacher.schedule");
  const locale = useLocale();
  const dayNames = useFullDayNames();
  const greeting = useTimeGreeting();

  const todayClasses = classes.filter((c) => c.dayOfWeek === todayDow);
  const otherClasses = classes.filter((c) => c.dayOfWeek !== todayDow);

  const firstName = teacherName?.split(" ")[0];
  const greetingLine = firstName
    ? t("greetingWithName", { greeting, name: firstName })
    : t("greetingOnly", { greeting });

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className="mx-auto max-w-3xl space-y-10 p-6"
    >
      <motion.header
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-sm text-muted">{greetingLine}</p>
          <h1 className="text-2xl font-black tracking-tight text-ink">{t("title")}</h1>
        </div>
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString(locale, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
      </motion.header>

      <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
          {t("todayRoll", { day: dayNames[todayDow] })}
        </h2>
        {todayClasses.length === 0 ? (
          <div className="box rounded-2xl px-6 py-8 text-center">
            <p className="text-sm text-muted">{t("noClassesToday")}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {todayClasses.map((cls) => (
              <RollCallCard key={cls.id} cls={cls} todayDate={todayDate} />
            ))}
          </div>
        )}
      </motion.section>

      {otherClasses.length > 0 && (
        <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">
            {t("thisWeek", { count: classes.length })}
          </h2>
          <div className="space-y-2">
            {otherClasses.map((cls) => (
              <ScheduleRow key={cls.id} cls={cls} dayName={dayNames[cls.dayOfWeek]} />
            ))}
          </div>
        </motion.section>
      )}

      {isInstructor && incomeSummary && (
        <motion.section variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}>
          <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">Income overview</h2>
          <div className="grid grid-cols-3 gap-3">
            <Link href="/portal/teacher/invoices" className="box rounded-2xl px-4 py-4 text-center">
              <p className="text-[0.7rem] text-muted uppercase tracking-wide">Paid</p>
              <p className="text-lg font-bold text-green-600 mt-0.5">
                {new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(incomeSummary.paidCents / 100)}
              </p>
            </Link>
            <Link href="/portal/teacher/invoices" className="box rounded-2xl px-4 py-4 text-center">
              <p className="text-[0.7rem] text-muted uppercase tracking-wide">Outstanding</p>
              <p className="text-lg font-bold text-brand mt-0.5">
                {new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(incomeSummary.outstandingCents / 100)}
              </p>
            </Link>
            <Link href="/portal/teacher/clients" className="box rounded-2xl px-4 py-4 text-center">
              <p className="text-[0.7rem] text-muted uppercase tracking-wide">Private clients</p>
              <p className="text-lg font-bold text-ink mt-0.5">{incomeSummary.privateClients}</p>
            </Link>
          </div>
        </motion.section>
      )}

      {classes.length === 0 && (
        <div className="box rounded-2xl px-6 py-12 text-center">
          <p className="text-sm text-muted">{t("noClassesAssigned")}</p>
          <p className="mt-1 text-xs text-muted">
            {isInstructor ? t("noClassesAssignedInstructorHint") : t("noClassesAssignedHint")}
          </p>
          {isInstructor && (
            <Link
              href="/portal/teacher/affiliations"
              className="btn-glow btn-glow--solid mt-4 inline-flex justify-center text-sm"
            >
              {t("viewAffiliations")}
            </Link>
          )}
        </div>
      )}
    </motion.div>
  );
}
