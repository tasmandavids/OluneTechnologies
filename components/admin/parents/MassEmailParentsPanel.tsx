"use client";

import { useEscToClose } from "@/lib/useEscToClose";
import { panelSlide } from "@/lib/motion";
import { confirmDialog } from "@/lib/feedback";
import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { massEmailParents } from "@/app/portal/admin/parents/actions";
import { isSendableParentEmail } from "@/lib/parents/mass-email";
import type { ParentRow } from "@/lib/parents/types";

export type ClassOption = { id: string; name: string };

type Scope = "all" | "selected" | "class";

export default function MassEmailParentsPanel({
  parents,
  classes,
  onClose,
  onResult,
}: {
  parents: Pick<ParentRow, "id" | "name" | "email">[];
  classes: ClassOption[];
  onClose: () => void;
  onResult: (message: string) => void;
}) {
  useEscToClose(onClose);
  const t = useTranslations("admin.parents.massEmail");
  const tCommon = useTranslations("common");

  const emailable = useMemo(
    () => parents.filter((p) => isSendableParentEmail(p.email)),
    [parents],
  );

  const [scope, setScope] = useState<Scope>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [classId, setClassId] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const estimatedCount =
    scope === "all"
      ? emailable.length
      : scope === "selected"
        ? selectedIds.length
        : null;

  const toggleParent = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const selectAllEmailable = () => {
    setSelectedIds(emailable.map((p) => p.id));
  };

  const canSubmit =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (scope === "all" ||
      (scope === "selected" && selectedIds.length > 0) ||
      (scope === "class" && Boolean(classId)));

  const submit = async () => {
    setError(null);
    const countHint =
      estimatedCount === null
        ? t("confirmClass")
        : t("confirmCount", { count: estimatedCount });

    if (
      !(await confirmDialog({
        title: t("confirmTitle"),
        body: countHint,
        confirmLabel: t("send"),
      }))
    ) {
      return;
    }

    startTransition(async () => {
      const res = await massEmailParents({
        subject: subject.trim(),
        body: body.trim(),
        scope,
        parentIds: scope === "selected" ? selectedIds : undefined,
        classId: scope === "class" ? classId : undefined,
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      const msg = t("result", {
        sent: res.sent,
        skipped: res.skipped,
        failed: res.failed,
      });
      onResult(msg);
      onClose();
    });
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
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-lg flex-col border-l border-[--hair] bg-surface shadow-2xl"
        {...panelSlide}
      >
        <div className="flex items-center justify-between border-b border-[--hair] px-6 py-4">
          <div>
            <h2 className="font-black text-ink">{t("title")}</h2>
            <p className="text-xs text-muted">{t("subtitle")}</p>
          </div>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
              {t("recipients")}
            </legend>
            {(
              [
                { id: "all" as const, label: t("scopeAll", { count: emailable.length }) },
                { id: "selected" as const, label: t("scopeSelected") },
                { id: "class" as const, label: t("scopeClass") },
              ] as const
            ).map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="radio"
                  name="mass-email-scope"
                  checked={scope === opt.id}
                  onChange={() => setScope(opt.id)}
                />
                {opt.label}
              </label>
            ))}
          </fieldset>

          {scope === "selected" && (
            <div className="space-y-2 rounded-xl border border-[--hair] bg-base/50 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs text-muted">
                  {t("selectedCount", { count: selectedIds.length })}
                </p>
                <button
                  type="button"
                  onClick={selectAllEmailable}
                  className="text-xs font-semibold text-ink underline"
                >
                  {t("selectAll")}
                </button>
              </div>
              {emailable.length === 0 ? (
                <p className="text-sm text-muted">{t("noEmailable")}</p>
              ) : (
                <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                  {emailable.map((p) => (
                    <li key={p.id}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm text-ink">
                        <input
                          type="checkbox"
                          className="mt-0.5"
                          checked={selectedIds.includes(p.id)}
                          onChange={() => toggleParent(p.id)}
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-medium">
                            {p.name ?? tCommon("unknown")}
                          </span>
                          <span className="block truncate text-xs text-muted">{p.email}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {scope === "class" && (
            <div>
              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                {t("classLabel")}
              </label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
              >
                <option value="">{t("classPlaceholder")}</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {classes.length === 0 && (
                <p className="mt-1 text-xs text-muted">{t("noClasses")}</p>
              )}
            </div>
          )}

          <div>
            <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
              {t("subject")}
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={200}
              placeholder={t("subjectPlaceholder")}
              className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
              {t("body")}
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={10_000}
              rows={10}
              placeholder={t("bodyPlaceholder")}
              className="w-full resize-y rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
            />
            <p className="mt-1 text-[0.65rem] text-muted">{t("bodyHint")}</p>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[--hair] px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-ink"
          >
            {tCommon("cancel")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit || pending}
            className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper disabled:opacity-50"
          >
            {pending ? t("sending") : t("send")}
          </button>
        </div>
      </motion.aside>
    </>
  );
}
