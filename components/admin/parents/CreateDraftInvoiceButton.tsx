"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { createInvoice } from "@/app/portal/admin/billing/actions";
import {
  LineItemRows,
  emptyLineItem,
  lineItemsTotalCents,
  toLineItemPayload,
  type EditableLineItem,
} from "@/components/admin/billing/InvoiceLineItemsEditor";

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export default function CreateDraftInvoiceButton({
  parentId,
  parentName,
  children,
}: {
  parentId: string;
  parentName: string;
  children: { id: string; name: string | null }[];
}) {
  const t = useTranslations("admin.parents.billing");
  const tBilling = useTranslations("admin.billing");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [description, setDescription] = useState("");
  const [itemized, setItemized] = useState(false);
  const [items, setItems] = useState<EditableLineItem[]>([emptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setStudentId("");
    setAmount("");
    setDueDate(defaultDueDate());
    setDescription("");
    setItemized(false);
    setItems([emptyLineItem()]);
    setError(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let amountDollars: number;
    let lineItemsPayload: { description: string; quantity: number; unitDollars: number }[] | undefined;

    if (itemized) {
      const parsed = toLineItemPayload(items);
      if (!parsed.ok) return setError(tBilling("createModal.invalidLineItemsError"));
      lineItemsPayload = parsed.lineItems;
      amountDollars = lineItemsTotalCents(items) / 100;
    } else {
      amountDollars = Number.parseFloat(amount);
      if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
        return setError(tBilling("createModal.validAmountError"));
      }
    }

    startTransition(async () => {
      const res = await createInvoice({
        payerId: parentId,
        studentId: studentId || undefined,
        amountDollars,
        dueDate,
        description: description.trim() || undefined,
        sendNow: false,
        lineItems: lineItemsPayload,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.xeroError) {
        setError(tBilling("createModal.xeroSyncError", { error: res.xeroError }));
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-ink hover:bg-surface"
      >
        {t("createDraftInvoiceButton")}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-[--hair] bg-surface p-6 shadow-xl">
            <h2 className="text-lg font-bold text-ink">
              {t("draftInvoiceModal.title", { name: parentName })}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("draftInvoiceModal.description")}</p>

            <form onSubmit={submit} className="mt-5 space-y-4">
              {children.length > 0 && (
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                  {tBilling("createModal.student")}{" "}
                  <span className="font-normal normal-case">{tShared("optional")}</span>
                  <select
                    value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                  >
                    <option value="">{tShared("notLinkedStudent")}</option>
                    {children.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name ?? tCommon("student")}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <div className={itemized ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
                {!itemized && (
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                    {tBilling("createModal.amount")}
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={tBilling("createModal.amountPlaceholder")}
                      className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                      required
                    />
                  </label>
                )}
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                  {tBilling("createModal.dueDate")}
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                    required
                  />
                </label>
              </div>

              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                {tBilling("createModal.descriptionLabel")}
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={tBilling("createModal.descriptionPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                />
              </label>

              <div>
                <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted">
                  <input
                    type="checkbox"
                    checked={itemized}
                    onChange={(e) => {
                      setItemized(e.target.checked);
                      if (e.target.checked && items.length === 0) setItems([emptyLineItem()]);
                    }}
                    className="rounded border-[--hair]"
                  />
                  {tBilling("templates.itemize")}
                </label>
                {itemized && (
                  <div className="mt-2">
                    <LineItemRows
                      items={items}
                      onChange={setItems}
                      labels={{
                        description: tBilling("detailModal.itemDescription"),
                        quantity: tBilling("detailModal.qty"),
                        unitPrice: tBilling("detailModal.unitPrice"),
                        addLine: tBilling("detailModal.addLine"),
                        remove: tCommon("delete"),
                        total: tCommon("total"),
                      }}
                    />
                  </div>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    reset();
                    setOpen(false);
                  }}
                  className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-muted hover:bg-base"
                >
                  {tCommon("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper disabled:opacity-50"
                >
                  {pending ? tShared("creating") : tBilling("createModal.saveDraft")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
