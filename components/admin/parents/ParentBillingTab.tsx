"use client";

import { useTranslations } from "next-intl";
import type { ParentInvoice, ParentOrder, ParentPayment } from "@/lib/parents/types";
import { formatMoney } from "@/lib/currency";
import { formatInvoiceNumber } from "@/lib/invoices/format-invoice-number";

const STATUS_KEYS = ["paid", "sent", "overdue", "draft", "void", "refunded"] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  paid: { bg: "#dcfce7", text: "#16a34a" },
  sent: { bg: "#fef9c3", text: "#ca8a04" },
  overdue: { bg: "#fee2e2", text: "#dc2626" },
  draft: { bg: "#f1f5f9", text: "#64748b" },
  void: { bg: "#f1f5f9", text: "#94a3b8" },
  refunded: { bg: "#ede9fe", text: "#7c3aed" },
};

function StatusBadge({ status }: { status: string }) {
  const tStatus = useTranslations("admin.shared.status");
  const s = STATUS_STYLES[status] ?? { bg: "#f1f5f9", text: "#64748b" };
  const label = (STATUS_KEYS as readonly string[]).includes(status)
    ? tStatus(status as (typeof STATUS_KEYS)[number])
    : status;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider"
      style={{ background: s.bg, color: s.text }}
    >
      {label}
    </span>
  );
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ParentBillingTab({
  invoices,
  payments,
  orders,
}: {
  invoices: ParentInvoice[];
  payments: ParentPayment[];
  orders: ParentOrder[];
}) {
  const t = useTranslations("admin.parents.billing");
  const tShared = useTranslations("admin.shared");

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.amountCents, 0);

  const totalPaid = payments.reduce((sum, p) => sum + p.amountCents, 0);

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[--hair] bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("outstanding")}</p>
          <p className="mt-1 text-xl font-black text-ink">{formatMoney(outstanding)}</p>
        </div>
        <div className="rounded-2xl border border-[--hair] bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("totalReceived")}</p>
          <p className="mt-1 text-xl font-black text-ink">{formatMoney(totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-[--hair] bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("invoices")}</p>
          <p className="mt-1 text-xl font-black text-ink">{invoices.length}</p>
        </div>
      </div>

      <section>
        <h3 className="mb-3 text-sm font-bold text-ink">{t("invoicesTitle")}</h3>
        {invoices.length === 0 ? (
          <p className="text-sm italic text-muted">{t("noInvoices")}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[--hair]">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-[--hair] bg-surface/60 text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 font-semibold">{t("table.number")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.issued")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.student")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.amount")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.due")}</th>
                  <th className="px-4 py-3 font-semibold">{t("table.status")}</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-[--hair] last:border-0">
                    <td className="px-4 py-3 font-mono text-xs text-ink">
                      {formatInvoiceNumber(inv.invoiceNumber)}
                    </td>
                    <td className="px-4 py-3 text-ink">{fmtDate(inv.issuedAt)}</td>
                    <td className="px-4 py-3 text-muted">{inv.studentName ?? tShared("dash")}</td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {formatMoney(inv.amountCents)}
                    </td>
                    <td className="px-4 py-3 text-muted">{fmtDate(inv.dueDate)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-ink">{t("paymentReceipts")}</h3>
        {payments.length === 0 ? (
          <p className="text-sm italic text-muted">{t("noPayments")}</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[--hair]">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead>
                <tr className="border-b border-[--hair] bg-surface/60 text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 font-semibold">{t("receiptsTable.date")}</th>
                  <th className="px-4 py-3 font-semibold">{t("receiptsTable.amount")}</th>
                  <th className="px-4 py-3 font-semibold">{t("receiptsTable.invoice")}</th>
                  <th className="px-4 py-3 font-semibold">{t("receiptsTable.reference")}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-[--hair] last:border-0">
                    <td className="px-4 py-3 text-ink">{fmtDate(p.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {formatMoney(p.amountCents)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {p.invoiceNumber != null
                        ? formatInvoiceNumber(p.invoiceNumber)
                        : tShared("dash")}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {p.stripePaymentIntentId?.slice(0, 16) ?? tShared("dash")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {orders.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-bold text-ink">{t("shopOrders")}</h3>
          <div className="overflow-x-auto rounded-2xl border border-[--hair]">
            <table className="w-full min-w-[400px] text-left text-sm">
              <thead>
                <tr className="border-b border-[--hair] bg-surface/60 text-xs uppercase tracking-wider text-muted">
                  <th className="px-4 py-3 font-semibold">{t("ordersTable.date")}</th>
                  <th className="px-4 py-3 font-semibold">{t("ordersTable.amount")}</th>
                  <th className="px-4 py-3 font-semibold">{t("ordersTable.status")}</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-[--hair] last:border-0">
                    <td className="px-4 py-3 text-ink">{fmtDate(o.createdAt)}</td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {formatMoney(o.totalCents)}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted">{o.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
