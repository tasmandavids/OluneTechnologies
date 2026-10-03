"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { addChildToFamily } from "@/app/portal/parent/children/actions";

export function AddChildModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const t = useTranslations("parent.hub");
  const [fullName, setFullName] = useState("");
  const [birthday, setBirthday] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await addChildToFamily({ fullName, birthday, email });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onAdded();
      onClose();
    });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4"
        onClick={onClose}
      >
        <motion.form
          initial={{ scale: 0.96, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.96, opacity: 0 }}
          onSubmit={submit}
          className="w-full max-w-md rounded-2xl border border-(--hair) bg-surface p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-black text-ink">{t("addChildTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("addChildDescription")}</p>

          <div className="mt-4 space-y-3">
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder={t("childNamePlaceholder")}
              className="field-premium w-full"
            />
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              className="field-premium w-full"
            />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("childEmailOptional")}
              className="field-premium w-full"
            />
          </div>

          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

          <div className="mt-6 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-(--hair) px-4 py-2.5 text-sm font-semibold text-muted"
            >
              {t("cancelAddChild")}
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {pending ? t("addingChild") : t("addChildSubmit")}
            </button>
          </div>
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
