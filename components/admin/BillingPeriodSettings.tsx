"use client";

import { confirmDialog } from "@/lib/feedback";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  updateBillingPeriod,
  createStudioTerm,
  updateStudioTerm,
  deleteStudioTerm,
} from "@/app/portal/admin/settings/actions";
import { termLengthMonths } from "@/lib/subscriptions/pricing";

export type StudioTermInfo = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  invoiceLeadDays: number;
};

type DraftTerm = {
  name: string;
  startDate: string;
  endDate: string;
  invoiceLeadDays: string;
};

const EMPTY_DRAFT: DraftTerm = { name: "", startDate: "", endDate: "", invoiceLeadDays: "14" };

function formatDate(ymd: string) {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BillingPeriodSettings({
  billingPeriod,
  terms: initialTerms,
}: {
  billingPeriod: "monthly" | "termly";
  terms: StudioTermInfo[];
}) {
  const t = useTranslations("admin.settings");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");

  const [period, setPeriod] = useState(billingPeriod);
  const [periodPending, startPeriodTransition] = useTransition();
  const [periodStatus, setPeriodStatus] = useState<string | null>(null);

  const [terms, setTerms] = useState(initialTerms);
  const [draft, setDraft] = useState<DraftTerm>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savePending, startSaveTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletePending, startDeleteTransition] = useTransition();

  const onChangePeriod = (next: "monthly" | "termly") => {
    setPeriod(next);
    startPeriodTransition(async () => {
      const res = await updateBillingPeriod({ billingPeriod: next });
      if (!res.ok) {
        setPeriod(billingPeriod);
        setPeriodStatus(res.error);
      } else {
        setPeriodStatus("saved");
      }
      setTimeout(() => setPeriodStatus(null), 2500);
    });
  };

  const startEdit = (term: StudioTermInfo) => {
    setEditingId(term.id);
    setFormError(null);
    setDraft({
      name: term.name,
      startDate: term.startDate,
      endDate: term.endDate,
      invoiceLeadDays: String(term.invoiceLeadDays),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(EMPTY_DRAFT);
    setFormError(null);
  };

  const submitDraft = () => {
    setFormError(null);
    const leadDays = Number(draft.invoiceLeadDays);
    if (!draft.name.trim()) return setFormError(t("billingPeriod.termNameRequired"));
    if (!draft.startDate || !draft.endDate) return setFormError(t("billingPeriod.termDatesRequired"));
    if (draft.endDate <= draft.startDate) return setFormError(t("billingPeriod.termEndAfterStart"));
    if (!Number.isFinite(leadDays) || leadDays < 0) return setFormError(t("billingPeriod.termLeadInvalid"));

    startSaveTransition(async () => {
      const payload = {
        name: draft.name.trim(),
        startDate: draft.startDate,
        endDate: draft.endDate,
        invoiceLeadDays: leadDays,
      };

      if (editingId) {
        const res = await updateStudioTerm({ id: editingId, ...payload });
        if (!res.ok) return setFormError(res.error);
        setTerms((prev) =>
          prev
            .map((term) => (term.id === editingId ? { id: editingId, ...payload } : term))
            .sort((a, b) => a.startDate.localeCompare(b.startDate)),
        );
      } else {
        const res = await createStudioTerm(payload);
        if (!res.ok) return setFormError(res.error);
        setTerms((prev) =>
          [...prev, { id: res.id, ...payload }].sort((a, b) => a.startDate.localeCompare(b.startDate)),
        );
      }
      cancelEdit();
    });
  };

  const onDelete = async (id: string) => {
    if (!(await confirmDialog({ title: t("billingPeriod.deleteConfirm"), destructive: true }))) return;
    setDeletingId(id);
    startDeleteTransition(async () => {
      const res = await deleteStudioTerm({ id });
      if (res.ok) {
        setTerms((prev) => prev.filter((term) => term.id !== id));
        if (editingId === id) cancelEdit();
      } else {
        setFormError(res.error);
      }
      setDeletingId(null);
    });
  };

  return (
    <div className="space-y-5 border-t border-[--hair] pt-5">
      <div>
        <h3 className="text-sm font-semibold text-ink">{t("billingPeriod.title")}</h3>
        <p className="mt-1 text-sm text-muted">{t("billingPeriod.description")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={periodPending}
          onClick={() => onChangePeriod("monthly")}
          className={`rounded-xl border p-4 text-left transition disabled:opacity-60 ${
            period === "monthly"
              ? "border-[--brand] bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]"
              : "border-[--hair] hover:bg-base"
          }`}
        >
          <p className="font-semibold text-ink">{t("billingPeriod.monthly")}</p>
          <p className="mt-1 text-xs text-muted">{t("billingPeriod.monthlyDescription")}</p>
        </button>
        <button
          type="button"
          disabled={periodPending}
          onClick={() => onChangePeriod("termly")}
          className={`rounded-xl border p-4 text-left transition disabled:opacity-60 ${
            period === "termly"
              ? "border-[--brand] bg-[color-mix(in_srgb,var(--brand)_8%,var(--surface))]"
              : "border-[--hair] hover:bg-base"
          }`}
        >
          <p className="font-semibold text-ink">{t("billingPeriod.termly")}</p>
          <p className="mt-1 text-xs text-muted">{t("billingPeriod.termlyDescription")}</p>
        </button>
      </div>
      {periodStatus && (
        <p className="text-sm" style={{ color: periodStatus === "saved" ? "var(--brand-hot)" : "#ef4444" }}>
          {periodStatus === "saved" ? tShared("saved") : periodStatus}
        </p>
      )}

      {period === "termly" && (
        <div className="space-y-4 rounded-xl border border-[--hair] bg-base p-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-widest text-muted">
              {t("billingPeriod.termsHeading")}
            </h4>
            <p className="mt-1 text-xs text-muted">{t("billingPeriod.termsHelp")}</p>
          </div>

          {terms.length === 0 ? (
            <p className="text-sm text-muted">{t("billingPeriod.noTerms")}</p>
          ) : (
            <ul className="space-y-2">
              {terms.map((term) => {
                const months = termLengthMonths(term.startDate, term.endDate);
                return (
                  <li
                    key={term.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[--hair] bg-surface px-3 py-2.5"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{term.name}</p>
                      <p className="text-xs text-muted">
                        {formatDate(term.startDate)} – {formatDate(term.endDate)}
                        {" · "}
                        {t("billingPeriod.termInvoiceLead", { days: term.invoiceLeadDays })}
                        {" · "}
                        {t("billingPeriod.termMultiplier", { months: months.toFixed(1) })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(term)}
                        className="rounded-lg border border-[--hair] px-2.5 py-1 text-xs font-semibold text-ink hover:bg-base"
                      >
                        {tCommon("edit")}
                      </button>
                      <button
                        type="button"
                        disabled={deletePending && deletingId === term.id}
                        onClick={() => onDelete(term.id)}
                        className="rounded-lg border border-[--hair] px-2.5 py-1 text-xs font-semibold text-[#dc2626] hover:bg-[#fee2e2] disabled:opacity-50"
                      >
                        {tCommon("delete")}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-3 rounded-lg border border-dashed border-[--hair] p-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">
              {editingId ? t("billingPeriod.editTerm") : t("billingPeriod.addTerm")}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-semibold text-muted">
                {t("billingPeriod.termName")}
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder={t("billingPeriod.termNamePlaceholder")}
                  className="mt-1 w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                {t("billingPeriod.termLeadDays")}
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={draft.invoiceLeadDays}
                  onChange={(e) => setDraft((d) => ({ ...d, invoiceLeadDays: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                {t("billingPeriod.termStart")}
                <input
                  type="date"
                  value={draft.startDate}
                  onChange={(e) => setDraft((d) => ({ ...d, startDate: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="block text-xs font-semibold text-muted">
                {t("billingPeriod.termEnd")}
                <input
                  type="date"
                  value={draft.endDate}
                  onChange={(e) => setDraft((d) => ({ ...d, endDate: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
            {formError && <p className="text-sm text-red-600">{formError}</p>}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={submitDraft}
                disabled={savePending}
                className="btn-glow btn-glow--solid px-4 py-2 text-sm disabled:opacity-50"
              >
                {savePending
                  ? tShared("saving")
                  : editingId
                    ? t("billingPeriod.saveTerm")
                    : t("billingPeriod.addTerm")}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-muted hover:bg-surface"
                >
                  {tCommon("cancel")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
