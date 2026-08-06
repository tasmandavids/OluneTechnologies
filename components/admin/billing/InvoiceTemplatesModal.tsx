"use client";

import { confirmDialog } from "@/lib/feedback";
import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { InvoiceTemplate } from "@/app/portal/admin/billing/page";
import {
  createInvoiceTemplate,
  deleteInvoiceTemplate,
  updateInvoiceTemplate,
} from "@/app/portal/admin/billing/actions";
import { formatMoney } from "@/lib/currency";
import {
  LineItemRows,
  emptyLineItem,
  fromInvoiceLineItems,
  toLineItemPayload,
  type EditableLineItem,
} from "./InvoiceLineItemsEditor";

type FormState = {
  name: string;
  description: string;
  defaultDueDays: string;
  items: EditableLineItem[];
};

function emptyForm(): FormState {
  return { name: "", description: "", defaultDueDays: "14", items: [emptyLineItem()] };
}

function formFromTemplate(template: InvoiceTemplate): FormState {
  return {
    name: template.name,
    description: template.description ?? "",
    defaultDueDays: String(template.defaultDueDays),
    items: fromInvoiceLineItems(template.lineItems),
  };
}

export function InvoiceTemplatesModal({
  templates,
  onClose,
  onCreated,
  onUpdated,
  onDeleted,
}: {
  templates: InvoiceTemplate[];
  onClose: () => void;
  onCreated: (template: InvoiceTemplate) => void;
  onUpdated: (template: InvoiceTemplate) => void;
  onDeleted: (id: string) => void;
}) {
  const t = useTranslations("admin.billing.templates");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startCreate = () => {
    setForm(emptyForm());
    setError(null);
    setEditingId("new");
  };

  const startEdit = (template: InvoiceTemplate) => {
    setForm(formFromTemplate(template));
    setError(null);
    setEditingId(template.id);
  };

  const remove = async (id: string) => {
    if (!(await confirmDialog({ title: t("deleteConfirm"), destructive: true }))) return;
    setDeletingId(id);
    startTransition(async () => {
      const res = await deleteInvoiceTemplate(id);
      setDeletingId(null);
      if (res.ok) onDeleted(id);
      else setError(res.error);
    });
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) return setError(t("nameRequiredError"));

    const dueDays = Number.parseInt(form.defaultDueDays, 10);
    if (!Number.isFinite(dueDays) || dueDays < 0) return setError(t("validDueDaysError"));

    const parsed = toLineItemPayload(form.items);
    if (!parsed.ok) return setError(t("invalidLineItemsError"));

    const payload = {
      name,
      description: form.description.trim() || undefined,
      defaultDueDays: dueDays,
      lineItems: parsed.lineItems,
    };

    startTransition(async () => {
      if (editingId === "new") {
        const res = await createInvoiceTemplate(payload);
        if (!res.ok) return setError(res.error);
        onCreated({
          id: res.templateId,
          name,
          description: payload.description ?? null,
          defaultDueDays: dueDays,
          lineItems: parsed.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitCents: Math.round(li.unitDollars * 100),
          })),
        });
      } else if (editingId) {
        const res = await updateInvoiceTemplate(editingId, payload);
        if (!res.ok) return setError(res.error);
        onUpdated({
          id: editingId,
          name,
          description: payload.description ?? null,
          defaultDueDays: dueDays,
          lineItems: parsed.lineItems.map((li) => ({
            description: li.description,
            quantity: li.quantity,
            unitCents: Math.round(li.unitDollars * 100),
          })),
        });
      }
      setEditingId(null);
    });
  };

  const isEditing = editingId !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[--hair] bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-bold text-ink">{t("title")}</h2>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>

        {!isEditing && (
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={startCreate}
              className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper hover:opacity-90"
            >
              {t("newTemplate")}
            </button>

            {templates.length === 0 ? (
              <p className="box rounded-xl px-4 py-8 text-center text-sm text-muted">
                {t("empty")}
              </p>
            ) : (
              <ul className="space-y-2">
                {templates.map((tpl) => {
                  const total = tpl.lineItems.reduce((sum, li) => sum + li.unitCents * li.quantity, 0);
                  return (
                    <li
                      key={tpl.id}
                      className="box flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                    >
                      <div>
                        <p className="font-semibold text-ink">{tpl.name}</p>
                        <p className="text-xs text-muted">
                          {formatMoney(total)} · {t("dueDaysLabel", { count: tpl.defaultDueDays })}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(tpl)}
                          className="box-pill px-2.5 py-1 text-xs font-semibold text-ink"
                        >
                          {tCommon("edit")}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(tpl.id)}
                          disabled={pending && deletingId === tpl.id}
                          className="box-pill px-2.5 py-1 text-xs font-semibold text-[#dc2626] disabled:opacity-50"
                        >
                          {pending && deletingId === tpl.id ? tShared("deleting") : tCommon("delete")}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-muted hover:bg-base"
              >
                {tCommon("close")}
              </button>
            </div>
          </div>
        )}

        {isEditing && (
          <form onSubmit={save} className="mt-5 space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              {tCommon("name")}
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={t("namePlaceholder")}
                className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                autoFocus
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("descriptionLabel")}
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("dueDaysInputLabel")}
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={form.defaultDueDays}
                  onChange={(e) => setForm({ ...form, defaultDueDays: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>

            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("lineItems")}
              </span>
              <div className="mt-2">
                <LineItemRows
                  items={form.items}
                  onChange={(items) => setForm({ ...form, items })}
                  labels={{
                    description: t("itemDescription"),
                    quantity: t("qty"),
                    unitPrice: t("unitPrice"),
                    addLine: t("addLine"),
                    remove: tCommon("delete"),
                    total: tCommon("total"),
                  }}
                />
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-muted hover:bg-base"
              >
                {tCommon("cancel")}
              </button>
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper disabled:opacity-50"
              >
                {pending ? tShared("saving") : tCommon("save")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
