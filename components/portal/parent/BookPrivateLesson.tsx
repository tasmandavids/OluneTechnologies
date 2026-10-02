"use client";

import { useTranslations } from "next-intl";
import { useFormatDateOnly } from "@/lib/i18n/format";
import { useShortDayNames } from "@/lib/i18n/client";

import { useMemo, useState, useTransition } from "react";
import {
  createBookingRequest,
  cancelBookingRequest,
} from "@/app/portal/parent/private-lessons/actions";
import {
  type BookableChild,
  type BookableTeacher,
  type ParentBooking,
  type PrivateLessonStatus,
} from "@/lib/private-lessons/types";

const STATUS_STYLES: Record<PrivateLessonStatus, string> = {
  requested: "bg-amber-100 text-amber-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-600",
  cancelled: "bg-base-200 text-base-content/50",
};

const EMPTY = {
  teacherId: "",
  studentId: "",
  lessonDate: "",
  startTime: "16:00",
  endTime: "16:30",
  locationName: "",
  parentNote: "",
};

export default function BookPrivateLesson({
  teachers,
  students,
  bookings,
}: {
  teachers: BookableTeacher[];
  students: BookableChild[];
  bookings: ParentBooking[];
}) {
  const formatDate = useFormatDateOnly({ weekday: "short", month: "short", day: "numeric" });
  const t = useTranslations("parent.privateLessons");
  const shortDays = useShortDayNames();
  const [form, setForm] = useState({
    ...EMPTY,
    teacherId: teachers[0]?.id ?? "",
    studentId: students[0]?.studentId ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [pending, startTransition] = useTransition();

  const selectedTeacher = useMemo(
    () => teachers.find((t) => t.id === form.teacherId) ?? null,
    [teachers, form.teacherId],
  );

  const canSubmit =
    form.teacherId &&
    form.studentId &&
    form.lessonDate &&
    form.startTime < form.endTime;

  function submit() {
    setError(null);
    setOk(false);
    startTransition(async () => {
      const res = await createBookingRequest({
        teacherId: form.teacherId,
        studentId: form.studentId,
        lessonDate: form.lessonDate,
        startTime: form.startTime,
        endTime: form.endTime,
        locationName: form.locationName || null,
        parentNote: form.parentNote || null,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setOk(true);
      setForm((f) => ({ ...EMPTY, teacherId: f.teacherId, studentId: f.studentId }));
      location.reload();
    });
  }

  function cancel(id: string) {
    startTransition(async () => {
      const res = await cancelBookingRequest(id);
      if (res?.error) {
        setError(res.error);
        return;
      }
      location.reload();
    });
  }

  const fieldClass =
    "w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30";
  const labelClass =
    "text-xs font-medium text-base-content/70 uppercase tracking-wide";

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-base-content">{t("title")}</h1>
        <p className="text-sm text-base-content/60 mt-0.5">{t("subtitle")}</p>
      </div>

      {students.length === 0 ? (
        <div className="border-2 border-dashed border-base-300 rounded-xl p-8 text-center">
          <p className="text-base-content/50 text-sm">{t("noDancers")}</p>
        </div>
      ) : teachers.length === 0 ? (
        <div className="border-2 border-dashed border-base-300 rounded-xl p-8 text-center">
          <p className="text-base-content/50 text-sm">{t("noTeachers")}</p>
        </div>
      ) : (
        <section className="bg-surface rounded-xl p-5 shadow-sm space-y-4">
          <h2 className="font-semibold text-base-content">{t("requestHeading")}</h2>

          {error && <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>}
          {ok && (
            <p className="text-sm text-green-700 bg-green-50 rounded p-2">{t("sent")}</p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>{t("teacher")}</span>
              <select
                value={form.teacherId}
                onChange={(e) => setForm((f) => ({ ...f, teacherId: e.target.value }))}
                className={fieldClass}
              >
                {teachers.map((teacher) => (
                  <option key={teacher.id} value={teacher.id}>
                    {teacher.name ?? t("teacherFallback")}
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>{t("dancer")}</span>
              <select
                value={form.studentId}
                onChange={(e) => setForm((f) => ({ ...f, studentId: e.target.value }))}
                className={fieldClass}
              >
                {students.map((s) => (
                  <option key={s.studentId} value={s.studentId}>
                    {s.name ?? t("dancerFallback")}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {selectedTeacher && (
            <div className="rounded-lg bg-base px-3 py-2">
              <p className="text-xs font-medium text-base-content/70">
                {t("availability", { name: selectedTeacher.name ?? t("thisTeacher") })}
              </p>
              {selectedTeacher.slots.length === 0 ? (
                <p className="text-xs text-base-content/40 mt-0.5">{t("noWindows")}</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                  {selectedTeacher.slots.map((s, i) => (
                    <li key={i} className="text-xs text-base-content/60">
                      {shortDays[s.dayOfWeek]} {s.startTime}–{s.endTime}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className={labelClass}>{t("date")}</span>
              <input
                type="date"
                value={form.lessonDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setForm((f) => ({ ...f, lessonDate: e.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>{t("from")}</span>
              <input
                type="time"
                value={form.startTime}
                onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>{t("to")}</span>
              <input
                type="time"
                value={form.endTime}
                onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
                className={fieldClass}
              />
            </label>
          </div>

          <label className="block space-y-1">
            <span className={labelClass}>{t("location")}</span>
            <input
              type="text"
              placeholder={t("locationPlaceholder")}
              value={form.locationName}
              onChange={(e) => setForm((f) => ({ ...f, locationName: e.target.value }))}
              className={fieldClass}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>{t("note")}</span>
            <input
              type="text"
              placeholder={t("notePlaceholder")}
              value={form.parentNote}
              onChange={(e) => setForm((f) => ({ ...f, parentNote: e.target.value }))}
              className={fieldClass}
            />
          </label>

          <button
            onClick={submit}
            disabled={!canSubmit || pending}
            className="btn-brand rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {pending ? t("sending") : t("send")}
          </button>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide">
          {t("myRequests")}
        </h2>
        {bookings.length === 0 ? (
          <p className="text-sm text-base-content/40 italic">{t("noRequests")}</p>
        ) : (
          <div className="space-y-2">
            {bookings.map((b) => (
              <div key={b.id} className="bg-surface rounded-xl px-4 py-3 shadow-sm space-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-base-content">
                      {t("bookingLine", { student: b.studentName ?? t("dancerFallback"), teacher: b.teacherName ?? t("teacherLower") })}
                    </p>
                    <p className="text-xs text-base-content/60">
                      {formatDate(b.lessonDate)} · {b.startTime}–{b.endTime}
                      {b.locationName ? ` · ${b.locationName}` : ""}
                    </p>
                    {b.status === "declined" && b.teacherResponseNote && (
                      <p className="text-xs text-red-500 mt-0.5">
                        {t("declinedReason", { note: b.teacherResponseNote })}
                      </p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status]}`}
                  >
                    {t(`statuses.${b.status}`)}
                  </span>
                </div>
                {b.status === "requested" && (
                  <button
                    onClick={() => cancel(b.id)}
                    disabled={pending}
                    className="text-xs text-red-500 hover:underline"
                  >
                    {t("cancelRequest")}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
