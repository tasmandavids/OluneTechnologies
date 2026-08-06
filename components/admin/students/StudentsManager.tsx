"use client";
import { useEscToClose } from "@/lib/useEscToClose";
import { panelSlide } from "@/lib/motion";
import { confirmDialog, toast } from "@/lib/feedback";
import { EmptyState } from "@/components/ui/EmptyState";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

// ============================================================================
//  StudentsManager — searchable student roster + detail panel.
//  Slide-over panel shows a student's enrolled classes and allows
//  admin to enroll them in additional classes or remove them.
// ============================================================================

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  enrollStudent,
  unenrollStudent,
  dropEnrollment,
  addStudent,
  deleteStudent,
  updateStudent,
  bulkUpdateStudents,
  bulkDeleteStudents,
  createDraftInvoiceFromEnrollments,
} from "@/app/portal/admin/students/actions";
import type { StudentRow, ClassOption } from "@/app/portal/admin/students/page";
import { useShortDayNames, useFormatTimeShort } from "@/lib/i18n/client";

// ─── helpers ─────────────────────────────────────────────────────────────────

function initials(name: string | null) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// ─── add student slide-over ──────────────────────────────────────────────────

function AddStudentPanel({ onClose }: { onClose: () => void }) {
  const t = useTranslations("admin.students.addPanel");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  useEscToClose(onClose);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await addStudent(form);
      if (!result.ok) { setError(result.error); return; }
      onClose();
    });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[--hair] bg-surface shadow-2xl"
        {...panelSlide}
      >
        <div className="flex items-center justify-between border-b border-[--hair] px-6 py-4">
          <h2 className="font-black text-ink">{t("title")}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <div>
            <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
              {t("fullName")}
            </label>
            <input
              value={form.fullName}
              onChange={(e) => set("fullName")(e.target.value)}
              placeholder={t("fullNamePlaceholder")}
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink
                         placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
            />
          </div>
          <div>
            <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
              {tCommon("email")}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email")(e.target.value)}
              placeholder={t("emailPlaceholder")}
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink
                         placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
            />
          </div>
          <div>
            <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
              {tCommon("phone")}
            </label>
            <input
              value={form.phone}
              onChange={(e) => set("phone")(e.target.value)}
              placeholder={t("phonePlaceholder")}
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink
                         placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
            />
          </div>
          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-3 border-t border-[--hair] px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[--hair] py-2.5 text-sm text-muted hover:text-ink">
            {tCommon("cancel")}
          </button>
          <button
            onClick={submit}
            disabled={pending || !form.fullName}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {pending ? tShared("adding") : t("addStudent")}
          </button>
        </div>
      </motion.aside>
    </>
  );
}

// ─── bulk edit slide-over ────────────────────────────────────────────────────

type ProfileFormRow = { id: string; fullName: string; email: string; phone: string };

function BulkEditPanel({
  students,
  onClose,
  onSaved,
}: {
  students: StudentRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations("admin.students.bulkEdit");
  useEscToClose(onClose);
  const tAdd = useTranslations("admin.students.addPanel");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const [rows, setRows] = useState<ProfileFormRow[]>(
    students.map((s) => ({
      id: s.id,
      fullName: s.name ?? "",
      email: s.email ?? "",
      phone: s.phone ?? "",
    })),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const setRow = (id: string, key: keyof Omit<ProfileFormRow, "id">, value: string) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [key]: value } : r)));
  };

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await bulkUpdateStudents({
        updates: rows.map((r) => ({
          id: r.id,
          fullName: r.fullName,
          email: r.email,
          phone: r.phone,
        })),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onSaved();
      router.refresh();
      onClose();
    });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[--hair] bg-surface shadow-2xl"
        {...panelSlide}
      >
        <div className="flex items-center justify-between border-b border-[--hair] px-6 py-4">
          <h2 className="font-black text-ink">{t("title", { count: students.length })}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {rows.map((row) => (
            <div key={row.id} className="space-y-3 rounded-xl border border-[--hair] bg-base p-4">
              <div>
                <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
                  {tAdd("fullName")}
                </label>
                <input
                  value={row.fullName}
                  onChange={(e) => setRow(row.id, "fullName", e.target.value)}
                  className="w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink
                             focus:outline-none focus:ring-1 focus:ring-[--brand]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
                    {tCommon("email")}
                  </label>
                  <input
                    type="email"
                    value={row.email}
                    onChange={(e) => setRow(row.id, "email", e.target.value)}
                    placeholder={tAdd("emailPlaceholder")}
                    className="w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink
                               placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
                  />
                </div>
                <div>
                  <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
                    {tCommon("phone")}
                  </label>
                  <input
                    value={row.phone}
                    onChange={(e) => setRow(row.id, "phone", e.target.value)}
                    placeholder={tAdd("phonePlaceholder")}
                    className="w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink
                               placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
                  />
                </div>
              </div>
            </div>
          ))}
          {error && (
            <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-3 border-t border-[--hair] px-6 py-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-[--hair] py-2.5 text-sm text-muted hover:text-ink">
            {tCommon("cancel")}
          </button>
          <button
            onClick={submit}
            disabled={pending || rows.some((r) => !r.fullName.trim())}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white disabled:opacity-50"
            style={{ background: "var(--brand)" }}
          >
            {pending ? tShared("saving") : t("saveChanges")}
          </button>
        </div>
      </motion.aside>
    </>
  );
}

// ─── student detail panel ────────────────────────────────────────────────────

function StudentPanel({
  student,
  allClasses,
  onClose,
}: {
  student: StudentRow;
  allClasses: ClassOption[];
  onClose: () => void;
}) {
  const t = useTranslations("admin.students.panel");
  const tAdd = useTranslations("admin.students.addPanel");
  useEscToClose(onClose);
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const dayShort = useShortDayNames();
  const fmt = useFormatTimeShort();
  const router = useRouter();
  const [selectedClassId, setSelectedClassId] = useState("");
  const [profileForm, setProfileForm] = useState({
    fullName: student.name ?? "",
    email: student.email ?? "",
    phone: student.phone ?? "",
  });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const enrolledIds = new Set(student.enrollments.map((e) => e.classId));
  const available = allClasses.filter((c) => !enrolledIds.has(c.id));

  const saveProfile = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await updateStudent({
        id: student.id,
        fullName: profileForm.fullName,
        email: profileForm.email,
        phone: profileForm.phone,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSuccess(t("profileSaved"));
      router.refresh();
      setTimeout(() => setSuccess(null), 2500);
    });
  };

  const enroll = () => {
    if (!selectedClassId) return;
    setError(null); setSuccess(null);
    startTransition(async () => {
      const result = await enrollStudent({ studentId: student.id, classId: selectedClassId });
      if (!result.ok) { setError(result.error); return; }
      setSelectedClassId("");
      setSuccess(t("enrolledSuccess"));
      setTimeout(() => setSuccess(null), 2500);
    });
  };

  const unenroll = (classId: string) => {
    setError(null); setSuccess(null);
    startTransition(async () => {
      const result = await unenrollStudent(student.id, classId);
      if (!result.ok) { setError(result.error); return; }
    });
  };

  const drop = (classId: string) => {
    setError(null); setSuccess(null);
    startTransition(async () => {
      const result = await dropEnrollment(student.id, classId);
      if (!result.ok) { setError(result.error); return; }
      setSuccess(t("droppedSuccess"));
      setTimeout(() => setSuccess(null), 2500);
    });
  };

  const createDraftInvoice = () => {
    setError(null); setSuccess(null);
    startTransition(async () => {
      const result = await createDraftInvoiceFromEnrollments(student.id);
      if (!result.ok) { setError(result.error); return; }
      if (result.xeroError) {
        setError(t("draftInvoiceXeroError", { error: result.xeroError }));
      } else {
        setSuccess(t("draftInvoiceCreated"));
        setTimeout(() => setSuccess(null), 2500);
      }
      router.refresh();
    });
  };

  const removeStudent = async () => {
    if (!(await confirmDialog({ title: t("deleteConfirm", { name: student.name ?? tShared("unknown") }), destructive: true }))) return;
    setError(null); setSuccess(null);
    startTransition(async () => {
      const result = await deleteStudent(student.id);
      if (!result.ok) { setError(result.error); return; }
      toast.success(tShared("deleted"));
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-[--hair] bg-surface shadow-2xl"
        {...panelSlide}
      >
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-[--hair] px-6 py-5">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-lg font-black text-white"
            style={{ background: "var(--brand)" }}
          >
            {initials(student.name)}
          </span>
          <div className="flex-1 min-w-0">
            <h2 className="font-black text-ink truncate">{student.name ?? tShared("unknown")}</h2>
            <p className="text-xs text-muted truncate">{student.email ?? student.phone ?? t("noContact")}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-muted hover:text-ink">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          {/* Profile */}
          <section>
            <h3 className="mb-3 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
              {t("profileSection")}
            </h3>
            <div className="space-y-3 rounded-xl border border-[--hair] bg-base p-4">
              <div>
                <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
                  {tAdd("fullName")}
                </label>
                <input
                  value={profileForm.fullName}
                  onChange={(e) => setProfileForm((f) => ({ ...f, fullName: e.target.value }))}
                  className="w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink
                             focus:outline-none focus:ring-1 focus:ring-[--brand]"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
                    {tCommon("email")}
                  </label>
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={(e) => setProfileForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink
                               focus:outline-none focus:ring-1 focus:ring-[--brand]"
                  />
                </div>
                <div>
                  <label className="block text-[0.68rem] font-semibold uppercase tracking-wider text-muted mb-1">
                    {tCommon("phone")}
                  </label>
                  <input
                    value={profileForm.phone}
                    onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
                    className="w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink
                               focus:outline-none focus:ring-1 focus:ring-[--brand]"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={saveProfile}
                disabled={pending || !profileForm.fullName.trim()}
                className="w-full rounded-lg py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "var(--brand)" }}
              >
                {pending ? tShared("saving") : t("saveProfile")}
              </button>
            </div>
          </section>

          {/* Full profile / progress link */}
          <Link
            href={`/portal/admin/students/${student.id}`}
            className="flex items-center justify-between rounded-xl border border-[--hair] bg-base px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-[--brand]"
          >
            {t("viewProgress")}
            <span className="text-[--brand]">→</span>
          </Link>

          {/* Current enrollments */}
          <section>
            <h3 className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
              {t("enrolledClasses", { count: student.enrollments.length })}
            </h3>
            {student.enrollments.length === 0 ? (
              <p className="text-sm text-muted">{t("notEnrolled")}</p>
            ) : (
              <ul className="space-y-2">
                {student.enrollments.map((e) => (
                  <li key={e.classId} className="flex items-center gap-3 rounded-xl border border-[--hair] bg-base px-4 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{e.className}</p>
                      <p className="text-xs text-muted">
                        {dayShort[e.dayOfWeek]}
                        {e.startTime ? ` · ${fmt(e.startTime)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() => drop(e.classId)}
                        disabled={pending}
                        title={t("dropTitle")}
                        className="text-xs text-muted transition-colors hover:text-amber-400"
                      >
                        {t("drop")}
                      </button>
                      <span className="text-[--hair]">·</span>
                      <button
                        onClick={() => unenroll(e.classId)}
                        disabled={pending}
                        title={t("removeTitle")}
                        className="text-xs text-muted transition-colors hover:text-red-400"
                      >
                        {t("remove")}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {student.enrollments.length > 0 && (
              <button
                type="button"
                onClick={createDraftInvoice}
                disabled={pending}
                className="mt-3 w-full rounded-lg border border-[--hair] py-2 text-sm font-semibold text-ink transition-colors hover:border-[--brand] disabled:opacity-50"
              >
                {t("createDraftInvoice")}
              </button>
            )}
          </section>

          {/* Enroll in a new class */}
          {available.length > 0 && (
            <section>
              <h3 className="mb-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {t("enrollInClass")}
              </h3>
              <div className="flex gap-2">
                <select
                  value={selectedClassId}
                  onChange={(e) => setSelectedClassId(e.target.value)}
                  className="flex-1 rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink
                             focus:outline-none focus:ring-1 focus:ring-[--brand]"
                >
                  <option value="">{tShared("chooseClass")}</option>
                  {available.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.discipline ? ` (${c.discipline})` : ""}
                      {" — "}
                      {dayShort[c.dayOfWeek]}
                      {c.startTime ? ` ${fmt(c.startTime)}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={enroll}
                  disabled={pending || !selectedClassId}
                  className="shrink-0 rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50 transition-opacity hover:opacity-90"
                  style={{ background: "var(--brand)" }}
                >
                  {t("enroll")}
                </button>
              </div>
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

          <section className="rounded-xl border border-red-400/30 bg-red-400/5 p-4">
            <h3 className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-red-400">
              {t("dangerZone")}
            </h3>
            <p className="mb-3 text-xs text-muted">{t("deleteDescription")}</p>
            <button
              type="button"
              onClick={removeStudent}
              disabled={pending}
              className="rounded-lg border border-red-400/40 px-3 py-2 text-xs font-semibold text-red-400 transition-colors hover:bg-red-400/10 disabled:opacity-50"
            >
              {pending ? tShared("deleting") : t("deleteStudent")}
            </button>
          </section>
        </div>
      </motion.aside>
    </>
  );
}

// ─── student card ────────────────────────────────────────────────────────────

function StudentCard({
  student,
  checked,
  onToggle,
  onClick,
}: {
  student: StudentRow;
  checked: boolean;
  onToggle: () => void;
  onClick: () => void;
}) {
  const t = useTranslations("admin.students");
  const tShared = useTranslations("admin.shared");
  return (
    <motion.div whileHover={{ y: -2 }} className="w-full">
      <GlassPanel className="!p-4">
        <div className="mb-3 flex items-center gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggle}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 shrink-0 accent-[--brand]"
            aria-label={student.name ?? tShared("unnamed")}
          />
          <button
            type="button"
            onClick={onClick}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
          >
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white"
              style={{ background: "var(--brand)" }}
            >
              {initials(student.name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink truncate">{student.name ?? tShared("unnamed")}</p>
              <p className="text-xs text-muted truncate">{student.email ?? student.phone ?? "—"}</p>
            </div>
          </button>
        </div>
        <button type="button" onClick={onClick} className="w-full text-left">
          <div className="flex flex-wrap gap-1.5 pl-7">
            {student.enrollments.length === 0 ? (
              <span className="text-xs text-muted italic">{t("noClasses")}</span>
            ) : (
              student.enrollments.slice(0, 3).map((e) => (
                <span
                  key={e.classId}
                  className="box-pill rounded-full px-2 py-0.5 text-[0.62rem] font-medium text-ink"
                >
                  {e.className}
                </span>
              ))
            )}
            {student.enrollments.length > 3 && (
              <span className="box-pill rounded-full px-2 py-0.5 text-[0.62rem] text-muted">
                {tShared("moreCount", { count: student.enrollments.length - 3 })}
              </span>
            )}
          </div>
        </button>
      </GlassPanel>
    </motion.div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function StudentsManager({
  students,
  allClasses,
}: {
  students: StudentRow[];
  allClasses: ClassOption[];
}) {
  const t = useTranslations("admin.students");
  const tShared = useTranslations("admin.shared");
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<StudentRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState<string | null>(null);
  const [bulkPending, startBulk] = useTransition();

  const filtered = students.filter(
    (s) =>
      !search ||
      (s.name ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (s.email ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const selectedStudents = useMemo(
    () => students.filter((s) => selectedIds.includes(s.id)),
    [students, selectedIds],
  );

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((s) => selectedIds.includes(s.id));

  const toggleStudent = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIds = new Set(filtered.map((s) => s.id));
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.has(id)));
    } else {
      const ids = new Set([...selectedIds, ...filtered.map((s) => s.id)]);
      setSelectedIds([...ids]);
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setBulkError(null);
    setBulkSuccess(null);
  };

  const bulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirmDialog({ title: t("deleteSelectedConfirm", { count: selectedIds.length }), destructive: true }))) return;
    setBulkError(null);
    setBulkSuccess(null);
    startBulk(async () => {
      const result = await bulkDeleteStudents({ studentIds: selectedIds });
      if (!result.ok) {
        setBulkError(result.error);
        return;
      }
      if (result.failures.length > 0) {
        setBulkSuccess(
          t("bulkDeletePartial", {
            deleted: result.deleted,
            failed: result.failures.length,
          }),
        );
        setSelectedIds(result.failures.map((f) => f.id));
      } else {
        setBulkSuccess(t("bulkDeleteSuccess", { count: result.deleted }));
        setSelectedIds([]);
      }
      router.refresh();
      setTimeout(() => setBulkSuccess(null), 4000);
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl space-y-6 p-6"
    >
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
          <p className="text-sm text-muted">
            {t("subtitle", { count: students.length })}
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-xl px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: "var(--brand)" }}
        >
          {t("addStudent")}
        </button>
      </div>

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full max-w-sm rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm
                   text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
      />

      {/* Bulk action bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[--brand]/30 bg-[--brand]/5 px-4 py-3">
          <span className="text-sm font-semibold text-ink">
            {t("selectedCount", { count: selectedIds.length })}
          </span>
          <button
            type="button"
            onClick={() => setShowBulkEdit(true)}
            className="rounded-lg border border-[--hair] bg-surface px-3 py-1.5 text-sm font-semibold text-ink hover:border-[--brand]"
          >
            {t("editProfiles")}
          </button>
          <button
            type="button"
            onClick={bulkDelete}
            disabled={bulkPending}
            className="rounded-lg border border-red-400/40 px-3 py-1.5 text-sm font-semibold text-red-400 hover:bg-red-400/10 disabled:opacity-50"
          >
            {bulkPending ? tShared("deleting") : t("deleteSelected")}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-sm text-muted hover:text-ink"
          >
            {t("clearSelection")}
          </button>
        </div>
      )}

      {bulkError && (
        <p className="rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
          {bulkError}
        </p>
      )}
      {bulkSuccess && (
        <p className="rounded-lg border border-green-400/30 bg-green-400/10 px-3 py-2 text-xs text-green-400">
          {bulkSuccess}
        </p>
      )}

      {/* Grid */}
      {filtered.length === 0 ? (
        <GlassPanel className="!p-0">
          <EmptyState
            title={search ? t("emptySearch") : t("empty")}
            action={
              !search ? (
                <button
                  onClick={() => setShowAdd(true)}
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white transition-opacity hover:opacity-90"
                >
                  {t("addStudent")}
                </button>
              ) : null
            }
          />
        </GlassPanel>
      ) : (
        <>
          {filtered.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleSelectAll}
                className="h-4 w-4 accent-[--brand]"
              />
              {t("selectAll")}
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((s) => (
              <StudentCard
                key={s.id}
                student={s}
                checked={selectedIds.includes(s.id)}
                onToggle={() => toggleStudent(s.id)}
                onClick={() => setSelected(s)}
              />
            ))}
          </div>
        </>
      )}

      {/* Panels */}
      <AnimatePresence>
        {selected && (
          <StudentPanel
            student={selected}
            allClasses={allClasses}
            onClose={() => setSelected(null)}
          />
        )}
        {showAdd && <AddStudentPanel onClose={() => setShowAdd(false)} />}
        {showBulkEdit && selectedStudents.length > 0 && (
          <BulkEditPanel
            students={selectedStudents}
            onClose={() => setShowBulkEdit(false)}
            onSaved={() => {
              clearSelection();
              setBulkSuccess(t("bulkUpdateSuccess", { count: selectedStudents.length }));
              setTimeout(() => setBulkSuccess(null), 4000);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
