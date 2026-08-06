"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { inviteCoParent } from "@/app/portal/parent/family/actions";

type Relationship = "mother" | "father" | "guardian" | "other";

export function InviteCoParentModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("parent.hub");
  const [email, setEmail] = useState("");
  const [relationship, setRelationship] = useState<Relationship>("guardian");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await inviteCoParent({ email, relationship });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSuccess(res.linked ? t("inviteCoParentLinked") : t("inviteCoParentSent"));
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
          className="w-full max-w-md rounded-2xl border border-[--hair] bg-surface p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 className="text-lg font-black text-ink">{t("inviteCoParentTitle")}</h2>
          <p className="mt-1 text-sm text-muted">{t("inviteCoParentDescription")}</p>

          {success ? (
            <>
              <p className="box mt-4 rounded-xl px-4 py-3 text-sm text-ink">
                {success}
              </p>
              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white"
                >
                  {t("closeInviteCoParent")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4 space-y-3">
                <input
                  required
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("coParentEmailPlaceholder")}
                  className="field-premium w-full"
                />
                <div>
                  <label className="mb-1 block text-xs font-semibold text-muted">
                    {t("coParentRelationshipLabel")}
                  </label>
                  <select
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value as Relationship)}
                    className="field-premium w-full"
                  >
                    <option value="mother">{t("relationshipMother")}</option>
                    <option value="father">{t("relationshipFather")}</option>
                    <option value="guardian">{t("relationshipGuardian")}</option>
                    <option value="other">{t("relationshipOther")}</option>
                  </select>
                </div>
              </div>

              {error && <p className="mt-3 text-sm text-red-400">{error}</p>}

              <div className="mt-6 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-[--hair] px-4 py-2.5 text-sm font-semibold text-muted"
                >
                  {t("cancelInviteCoParent")}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 rounded-xl bg-brand px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {pending ? t("invitingCoParent") : t("inviteCoParentSubmit")}
                </button>
              </div>
            </>
          )}
        </motion.form>
      </motion.div>
    </AnimatePresence>
  );
}
