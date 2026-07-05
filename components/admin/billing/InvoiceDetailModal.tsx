"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { InvoiceLineItem, InvoiceRow } from "@/app/portal/admin/billing/page";
import { updateInvoice } from "@/app/portal/admin/billing/actions";
import { formatMoney } from "@/lib/currency";
import { formatShortDate } from "@/lib/xero/format";
import { openInXeroUrl } from "@/lib/xero/links";
import { formatInvoiceNumber } from "@/lib/invoices/format-invoice-number";
import {
  LineItemRows,
  emptyLineItem,
  fromInvoiceLineItems,
  lineItemsTotalCents,
  toLineItemPayload,
  type EditableLineItem,
} from "./InvoiceLineItemsEditor";

const LOCKED_STATUSES = ["paid", "refunded", "void"];

export function InvoiceDetailModal({
  invoice,
  onClose,
  onUpdated,
}: {
  invoice: InvoiceRow;
  onClose: () => void;
  onUpdated: (patch: Partial<InvoiceRow>) => void;
}) {
  const t = useTranslations("admin.billing.detailModal");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("admin.shared.status");

  const isLocked = LOCKED_STATUSES.includes(invoice.status);
  const isDraft = invoice.status === "draft";

  const [dueDate, setDueDate] = useState(invoice.dueDate ?? "");
  const [description, setDescription] = useState(invoice.description ?? "");
  const [itemized, setItemized] = useState(invoice.lineItems.length > 0);
  const [items, setItems] = useState<EditableLineItem[]>(
    invoice.lineItems.length > 0 ? fromInvoiceLineItems(invoice.lineItems) : [emptyLineItem()],
  );
  const [flatAmount, setFlatAmount] = useState((invoice.amountCents / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload: Parameters<typeof updateInvoice>[0] = {
      invoiceId: invoice.id,
      dueDate: dueDate || undefined,
      description,
    };

    const patch: Partial<InvoiceRow> = {
      dueDate: dueDate || null,
      description: description.trim() || null,
    };

    if (isDraft) {
      if (itemized) {
        const parsed = toLineItemPayload(items);
        if (!parsed.ok) return setError(t("invalidLineItemsError"));
        payload.lineItems = parsed.lineItems;
        patch.amountCents = parsed.lineItems.reduce(
          (sum, li) => sum + Math.round(li.unitDollars * 100) * li.quantity,
          0,
        );
        patch.lineItems = parsed.lineItems.map(
          (li, idx): InvoiceLineItem => ({
            id: `${invoice.id}-${idx}`,
            description: li.description,
            quantity: li.quantity,
            unitCents: Math.round(li.unitDollars * 100),
            lineTotalCents: Math.round(li.unitDollars * 100) * li.quantity,
            sortOrder: idx,
          }),
        );
      } else {
        const dollars = Number.parseFloat(flatAmount);
        if (!Number.isFinite(dollars) || dollars <= 0) return setError(t("validAmountError"));
        payload.amountDollars = dollars;
        patch.amountCents = Math.round(dollars * 100);
        patch.lineItems = [];
      }
    }

    startTransition(async () => {
      const res = await updateInvoice(payload);
      if (!res.ok) setError(res.error);
      else {
        onUpdated(patch);
        onClose();
      }
    });
  };

  const displayAmountCents = isDraft && itemized ? lineItemsTotalCents(items) : invoice.amountCents;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[--hair] bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">
              {t("title", { number: formatInvoiceNumber(invoice.invoiceNumber) })}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {isLocked ? t("lockedNotice") : isDraft ? t("draftNotice") : t("sentNotice")}
            </p>
          </div>
          <span className="rounded-full bg-base px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
            {tStatus(invoice.status as "paid")}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">{tCommon("parent")}</dt>
          <dd className="text-right font-medium text-ink">{invoice.payerName ?? tShared("dash")}</dd>
          <dt className="text-muted">{t("student")}</dt>
          <dd className="text-right font-medium text-ink">{invoice.studentName ?? tShared("dash")}</dd>
          <dt className="text-muted">{t("issued")}</dt>
          <dd className="text-right text-ink">
            {invoice.issuedAt ? formatShortDate(invoice.issuedAt.slice(0, 10)) : tShared("dash")}
          </dd>
          <dt className="text-muted">{t("paid")}</dt>
          <dd className="text-right text-ink">
            {invoice.paidAt ? formatShortDate(invoice.paidAt.slice(0, 10)) : tShared("dash")}
          </dd>
          {invoice.xeroInvoiceId && (
            <>
              <dt className="text-muted">Xero</dt>
              <dd className="text-right">
                <a
                  href={openInXeroUrl(null, "invoice", invoice.xeroInvoiceId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-[#13B5EA] hover:underline"
                >
                  {tShared("viewInXero")}
                </a>
              </dd>
            </>
          )}
        </dl>

        <form onSubmit={submit} className="mt-5 space-y-4">
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
            {t("dueDateLabel")}
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isLocked}
              className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink disabled:opacity-60"
            />
          </label>

          <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
            {t("descriptionLabel")}
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLocked}
              className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink disabled:opacity-60"
            />
          </label>

          <div>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                {t("lineItems")}
              </span>
              {isDraft && (
                <label className="flex items-center gap-1.5 text-xs text-ink">
                  <input
                    type="checkbox"
                    checked={itemized}
                    onChange={(e) => setItemized(e.target.checked)}
                    className="rounded border-[--hair]"
                  />
                  {t("itemize")}
                </label>
              )}
            </div>

            <div className="mt-2">
              {isDraft && itemized ? (
                <LineItemRows
                  items={items}
                  onChange={setItems}
                  labels={{
                    description: t("itemDescription"),
                    quantity: t("qty"),
                    unitPrice: t("unitPrice"),
                    addLine: t("addLine"),
                    remove: tCommon("delete"),
                    total: tCommon("total"),
                  }}
                />
              ) : isDraft ? (
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                  {t("amountLabel")}
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={flatAmount}
                    onChange={(e) => setFlatAmount(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                  />
                </label>
              ) : invoice.lineItems.length > 0 ? (
                <ul className="space-y-1 rounded-lg border border-[--hair] bg-base p-3 text-sm">
                  {invoice.lineItems.map((li) => (
                    <li key={li.id} className="flex justify-between gap-2">
                      <span className="text-ink">
                        {li.quantity > 1 ? `${li.quantity}× ` : ""}
                        {li.description}
                      </span>
                      <span className="font-medium tabular-nums text-ink">
                        {formatMoney(li.lineTotalCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">{t("noLineItems")}</p>
              )}
            </div>

            <div className="mt-2 flex justify-between text-sm">
              <span className="font-semibold text-ink">{tCommon("total")}</span>
              <span className="font-bold tabular-nums text-ink">{formatMoney(displayAmountCents)}</span>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-muted hover:bg-base"
            >
              {isLocked ? tCommon("close") : tCommon("cancel")}
            </button>
            {!isLocked && (
              <button
                type="submit"
                disabled={pending}
                className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper disabled:opacity-50"
              >
                {pending ? tShared("saving") : tCommon("save")}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
