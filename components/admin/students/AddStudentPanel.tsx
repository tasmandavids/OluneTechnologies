"use client";

// ============================================================================
//  AddStudentPanel — slide-over that creates a student profile. Lifted out of
//  the retired /portal/admin/students roster so the People directory can open
//  it directly.
// ============================================================================

import { useState, useTransition } from "react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useEscToClose } from "@/lib/useEscToClose";
import { panelSlide } from "@/lib/motion";
import { addStudent } from "@/app/portal/admin/students/actions";

export default function AddStudentPanel({ onClose }: { onClose: () => void }) {
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
