"use client";

// ============================================================================
//  BulkEditStudentsPanel — edit name/email/phone for a selection of students in
//  one pass. Lifted out of the retired /portal/admin/students roster; it is
//  also the only place an admin can correct a single student's contact details,
//  so selecting one row and opening it is the "edit profile" path.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEscToClose } from "@/lib/useEscToClose";
import { panelSlide } from "@/lib/motion";
import { bulkUpdateStudents } from "@/app/portal/admin/students/actions";

export type BulkEditStudent = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
};

type ProfileFormRow = { id: string; fullName: string; email: string; phone: string };

export default function BulkEditStudentsPanel({
  students,
  onClose,
  onSaved,
}: {
  students: BulkEditStudent[];
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
