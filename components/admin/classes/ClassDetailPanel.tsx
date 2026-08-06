"use client";

import { useEscToClose } from "@/lib/useEscToClose";
import { panelSlide } from "@/lib/motion";
import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  getClassEnrollments,
  getStudentsNotInClass,
  type ClassEnrollmentRow,
  type StudentOption,
} from "@/app/portal/admin/classes/actions";
import {
  dropEnrollment,
  enrollStudent,
  unenrollStudent,
} from "@/app/portal/admin/students/actions";
import type { ClassRow } from "@/app/portal/admin/classes/page";
import { useFormatTimeShort } from "@/lib/i18n/client";

const DAY_SHORT_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function StudentList({
  students,
  emptyLabel,
  readOnly,
  pending,
  onDrop,
  onRemove,
}: {
  students: ClassEnrollmentRow[];
  emptyLabel: string;
  readOnly: boolean;
  pending: boolean;
  onDrop: (studentId: string) => void;
  onRemove: (studentId: string) => void;
}) {
  const t = useTranslations("admin.classes.panel");
  const tStudent = useTranslations("admin.students.panel");
  const tShared = useTranslations("admin.shared");

  if (students.length === 0) {
    return <p className="text-sm text-muted">{emptyLabel}</p>;
  }

  return (
    <ul className="space-y-2">
      {students.map((s) => (
        <li
          key={s.studentId}
          className="box flex items-center gap-3 rounded-xl px-4 py-3"
        >
          <Link
            href={`/portal/admin/students/${s.studentId}`}
            className="flex min-w-0 flex-1 items-center gap-3 transition-opacity hover:opacity-80"
          >
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-black text-white"
              style={{ background: "var(--brand)" }}
            >
              {initials(s.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {s.name ?? tShared("unknown")}
              </p>
              {s.email && (
                <p className="truncate text-xs text-muted">{s.email}</p>
              )}
            </div>
          </Link>
          {!readOnly && (
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => onDrop(s.studentId)}
                disabled={pending}
                title={tStudent("dropTitle")}
                className="text-xs text-muted transition-colors hover:text-amber-400 disabled:opacity-50"
              >
                {tStudent("drop")}
              </button>
              <span className="text-[--hair]">·</span>
              <button
                type="button"
                onClick={() => onRemove(s.studentId)}
                disabled={pending}
                title={tStudent("removeTitle")}
                className="text-xs text-muted transition-colors hover:text-red-400 disabled:opacity-50"
              >
                {tStudent("remove")}
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ClassDetailPanel({
  cls,
  readOnly = false,
  onClose,
  onEdit,
}: {
  cls: ClassRow;
  readOnly?: boolean;
  onClose: () => void;
  onEdit?: () => void;
}) {
  useEscToClose(onClose);
  const t = useTranslations("admin.classes.panel");
  const tStudent = useTranslations("admin.students.panel");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const fmt = useFormatTimeShort();
  const router = useRouter();

  const [students, setStudents] = useState<ClassEnrollmentRow[] | null>(null);
  const [candidates, setCandidates] = useState<StudentOption[] | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(async () => {
    const [enrollmentsRes, candidatesRes] = await Promise.all([
      getClassEnrollments(cls.id),
      readOnly ? Promise.resolve({ ok: true as const, data: [] }) : getStudentsNotInClass(cls.id),
    ]);

    if (!enrollmentsRes.ok) {
      setError(enrollmentsRes.error);
      return;
    }
    setStudents(enrollmentsRes.data);

    if (!candidatesRes.ok) {
      setError(candidatesRes.error);
      return;
    }
    if (!readOnly) setCandidates(candidatesRes.data);
  }, [cls.id, readOnly]);

  useEffect(() => {
    let cancelled = false;
    setStudents(null);
    setCandidates(null);
    setError(null);
    setSuccess(null);
    setSelectedStudentId("");

    Promise.all([
      getClassEnrollments(cls.id),
      readOnly ? Promise.resolve({ ok: true as const, data: [] }) : getStudentsNotInClass(cls.id),
    ]).then(([enrollmentsRes, candidatesRes]) => {
      if (cancelled) return;
      if (!enrollmentsRes.ok) {
        setError(enrollmentsRes.error);
        return;
      }
      setStudents(enrollmentsRes.data);
      if (!readOnly) {
        if (!candidatesRes.ok) {
          setError(candidatesRes.error);
          return;
        }
        setCandidates(candidatesRes.data);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cls.id, readOnly]);

  const active = (students ?? []).filter((s) => s.status === "active");
  const waitlisted = (students ?? []).filter((s) => s.status === "waitlisted");
  const activeCount = active.length;
  const fill = cls.capacity > 0 ? activeCount / cls.capacity : 0;
  const isFull = fill >= 1;

  const runMutation = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await fn();
      if (!result.ok) {
        setError(result.error ?? "Unknown error");
        return;
      }
      await reload();
      router.refresh();
    });
  };

  const enroll = () => {
    if (!selectedStudentId) return;
    runMutation(async () => {
      const result = await enrollStudent({ studentId: selectedStudentId, classId: cls.id });
      if (result.ok) {
        setSelectedStudentId("");
        setSuccess(tStudent("enrolledSuccess"));
        setTimeout(() => setSuccess(null), 2500);
      }
      return result;
    });
  };

  const drop = (studentId: string) => {
    runMutation(async () => {
      const result = await dropEnrollment(studentId, cls.id);
      if (result.ok) {
        setSuccess(tStudent("droppedSuccess"));
        setTimeout(() => setSuccess(null), 2500);
      }
      return result;
    });
  };

  const remove = (studentId: string) => {
    runMutation(async () => unenrollStudent(studentId, cls.id));
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[--hair] bg-surface shadow-2xl"
        {...panelSlide}
      >
        <div className="flex items-start gap-4 border-b border-[--hair] px-6 py-5">
          <div className="min-w-0 flex-1">
            <h2 className="font-black text-ink truncate">{cls.name}</h2>
            <p className="mt-0.5 text-xs text-muted">
              {cls.discipline && <span>{cls.discipline}</span>}
              {cls.discipline && cls.level && <span> · </span>}
              {cls.level && <span>{cls.level}</span>}
            </p>
            <p className="mt-1 text-xs text-muted">
              <span className="font-medium text-ink">
                {tCommon(`days.${DAY_SHORT_KEYS[cls.dayOfWeek]}`)}
              </span>
              {cls.startTime && (
                <span>
                  {" · "}
                  {fmt(cls.startTime)}
                  {cls.endTime ? ` – ${fmt(cls.endTime)}` : ""}
                </span>
              )}
            </p>
            <p className="mt-1 text-xs text-muted">
              {cls.teacherName ?? tShared("unassigned")}
              {cls.room && <span> · {cls.room}</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="box rounded-xl px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted">{t("enrollment")}</span>
              <span
                className={`text-sm font-bold tabular-nums ${isFull ? "text-red-400" : "text-ink"}`}
              >
                {activeCount}/{cls.capacity}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-[--hair] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(fill * 100, 100)}%`,
                  background: isFull ? "#ef4444" : "var(--brand)",
                }}
              />
            </div>
          </div>

          {!readOnly && candidates !== null && candidates.length > 0 && (
            <section>
              <h3 className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {t("addStudent")}
              </h3>
              <div className="flex gap-2">
                <select
                  value={selectedStudentId}
                  onChange={(e) => setSelectedStudentId(e.target.value)}
                  className="flex-1 rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink
                             focus:outline-none focus:ring-1 focus:ring-[--brand]"
                >
                  <option value="">{tShared("chooseStudent")}</option>
                  {candidates.map((s) => (
                    <option key={s.studentId} value={s.studentId}>
                      {s.name ?? tShared("unknown")}
                      {s.email ? ` (${s.email})` : ""}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={enroll}
                  disabled={pending || !selectedStudentId}
                  className="shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: "var(--brand)" }}
                >
                  {tStudent("enroll")}
                </button>
              </div>
              {isFull && (
                <p className="mt-2 text-xs text-muted">{t("waitlistHint")}</p>
              )}
            </section>
          )}

          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-lg border border-green-400/30 bg-green-400/10 px-3 py-2 text-xs text-green-400">
              {success}
            </p>
          )}

          <section>
            <h3 className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
              {t("enrolledStudents", { count: active.length })}
            </h3>
            {students === null ? (
              <p className="text-sm text-muted">{t("loading")}</p>
            ) : (
              <StudentList
                students={active}
                emptyLabel={t("noStudents")}
                readOnly={readOnly}
                pending={pending}
                onDrop={drop}
                onRemove={remove}
              />
            )}
          </section>

          {(students === null || waitlisted.length > 0) && (
            <section>
              <h3 className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {t("waitlisted", { count: waitlisted.length })}
              </h3>
              {students === null ? (
                <p className="text-sm text-muted">{t("loading")}</p>
              ) : (
                <StudentList
                  students={waitlisted}
                  emptyLabel={t("noWaitlist")}
                  readOnly={readOnly}
                  pending={pending}
                  onDrop={drop}
                  onRemove={remove}
                />
              )}
            </section>
          )}
        </div>

        {!readOnly && onEdit && (
          <div className="border-t border-[--hair] px-6 py-4">
            <button
              type="button"
              onClick={onEdit}
              className="w-full rounded-xl border border-[--hair] py-2.5 text-sm font-semibold text-ink transition-colors hover:border-[--brand]"
            >
              {t("editClass")}
            </button>
          </div>
        )}
      </motion.aside>
    </>
  );
}
