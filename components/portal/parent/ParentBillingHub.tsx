"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { formatMoney } from "@/lib/currency";
import type { AutoPayItem } from "@/components/portal/parent/AutoPaySetup";
import AutoPaySetup from "@/components/portal/parent/AutoPaySetup";
import { PayInvoiceModal } from "@/components/portal/parent/PayInvoiceModal";
import { TermInstallmentPayModal } from "@/components/portal/parent/TermInstallmentPayModal";
import type { AccountBillingSummary } from "@/app/portal/parent/billing/actions";
import { formatInvoiceNumber } from "@/lib/invoices/format-invoice-number";
import { TERM_INSTALLMENT_COUNT, splitTermInstallments } from "@/lib/term-payments";

export type BillingInvoice = {
  id: string;
  invoiceNumber: number;
  amountCents: number;
  status: string;
  dueDate: string | null;
  issuedAt: string | null;
  paidAt: string | null;
  studentName: string | null;
};

export type BillingPayment = {
  id: string;
  amountCents: number;
  status: string;
  createdAt: string;
  invoiceId: string | null;
  invoiceNumber: number | null;
};

export type BillingOrder = {
  id: string;
  totalCents: number;
  status: string;
  createdAt: string;
};

export type BillingPlanSummary = {
  id: string;
  totalCents: number;
  paidCents: number;
  installmentsPaid: number;
  installmentCount: number;
  nextDueCents: number | null;
  nextDueDate: string | null;
};

const STATUS_KEYS = ["paid", "sent", "overdue", "draft", "void", "refunded"] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  paid: { bg: "color-mix(in srgb, #22c55e 18%, transparent)", text: "#16a34a" },
  sent: { bg: "color-mix(in srgb, var(--brand-hot) 18%, transparent)", text: "var(--brand-deep)" },
  overdue: { bg: "color-mix(in srgb, #ef4444 18%, transparent)", text: "#dc2626" },
  draft: { bg: "color-mix(in srgb, var(--muted) 18%, transparent)", text: "var(--muted)" },
  void: { bg: "color-mix(in srgb, var(--muted) 10%, transparent)", text: "var(--muted)" },
  refunded: { bg: "color-mix(in srgb, #8b5cf6 18%, transparent)", text: "#7c3aed" },
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("parent.billing.invoiceStatus");
  const s = STATUS_STYLES[status] ?? { bg: "var(--hair)", text: "var(--muted)" };
  const label = (STATUS_KEYS as readonly string[]).includes(status)
    ? t(status as (typeof STATUS_KEYS)[number])
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

function fmtDate(iso: string | null, locale: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ParentBillingHub({
  invoices,
  payments,
  orders,
  autoPayItems,
  stripeConfigured,
  accountSummary,
  paymentPlans = [],
  autopayActive = false,
}: {
  invoices: BillingInvoice[];
  payments: BillingPayment[];
  orders: BillingOrder[];
  autoPayItems: AutoPayItem[];
  stripeConfigured: boolean;
  accountSummary: AccountBillingSummary | null;
  paymentPlans?: BillingPlanSummary[];
  autopayActive?: boolean;
}) {
  const t = useTranslations("parent.billing");
  const locale = useLocale();
  const [payInvoice, setPayInvoice] = useState<BillingInvoice | null>(null);
  const [showTermPay, setShowTermPay] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((sum, i) => sum + i.amountCents, 0);

  const termFirstInstallment =
    outstanding > 0 ? splitTermInstallments(outstanding)[0] ?? 0 : 0;
  const activePlan = accountSummary?.activePlan;

  const totalPaid = payments.reduce((sum, p) => sum + p.amountCents, 0);

  async function openPaymentPortal() {
    if (!stripeConfigured) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const res = await fetch("/api/payments/billing-portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setPortalError(data.error ?? t("portalFailed"));
        return;
      }
      window.location.href = data.url;
    } catch {
      setPortalError(t("portalFailed"));
    } finally {
      setPortalLoading(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-5xl space-y-10 p-6"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/portal/parent" className="text-xs font-semibold text-muted hover:text-ink">
            {t("backToHub")}
          </Link>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        {stripeConfigured && (
          <button
            type="button"
            onClick={openPaymentPortal}
            disabled={portalLoading}
            className="rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-base disabled:opacity-50"
          >
            {portalLoading ? t("openingPortal") : t("managePaymentMethods")}
          </button>
        )}
      </header>

      {!stripeConfigured && (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
          {t("stripeNotConfigured")}
        </p>
      )}

      {portalError && (
        <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{portalError}</p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[--hair] bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("outstanding")}</p>
          <p className="mt-1 text-xl font-black text-ink">{formatMoney(outstanding)}</p>
        </div>
        <div className="rounded-2xl border border-[--hair] bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("totalPaid")}</p>
          <p className="mt-1 text-xl font-black text-ink">{formatMoney(totalPaid)}</p>
        </div>
        <div className="rounded-2xl border border-[--hair] bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("invoiceCount")}</p>
          <p className="mt-1 text-xl font-black text-ink">{invoices.length}</p>
        </div>
      </div>

      {/* Wallet summary band — plan progress, subscriptions, saved payment
          method access. Merged here from the old Family Wallet page (1.6.1). */}
      {(paymentPlans.length > 0 || autopayActive) && (
        <section className="rounded-2xl border border-[--hair] bg-surface p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-bold text-ink">{t("summaryBand.title")}</h2>
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-ink">
              <span
                className={`h-2 w-2 rounded-full ${autopayActive ? "bg-[#22c55e]" : "bg-[--muted]"}`}
              />
              {t("summaryBand.autopay")}:{" "}
              {autopayActive ? t("summaryBand.autopayOn") : t("summaryBand.autopayOff")}
            </span>
          </div>

          {paymentPlans.length > 0 && (
            <div className="mt-4 space-y-4">
              {paymentPlans.map((plan) => (
                <div key={plan.id}>
                  <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {t("summaryBand.planLabel", {
                        paid: plan.installmentsPaid,
                        total: plan.installmentCount,
                      })}
                    </p>
                    {plan.nextDueDate && plan.nextDueCents != null && (
                      <p className="text-xs text-muted">
                        {t("summaryBand.nextInstalment", {
                          amount: formatMoney(plan.nextDueCents),
                          date: fmtDate(plan.nextDueDate, locale),
                        })}
                      </p>
                    )}
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--brand)_15%,transparent)]">
                    <div
                      className="h-full rounded-full bg-brand transition-all"
                      style={{
                        width: `${Math.min(100, plan.totalCents > 0 ? (plan.paidCents / plan.totalCents) * 100 : 0)}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-[0.65rem] text-muted">
                    <span>{t("summaryBand.paid", { amount: formatMoney(plan.paidCents) })}</span>
                    <span>{t("summaryBand.total", { amount: formatMoney(plan.totalCents) })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <p className="text-sm text-muted">
        {t("contactStudioBilling")}{" "}
        <Link href="/portal/parent/chat?topic=billing" className="font-semibold text-brand hover:underline">
          {t("contactStudioBillingLink")}
        </Link>
      </p>

      {stripeConfigured && outstanding > 0 && (
        <section className="rounded-2xl border border-[--brand]/30 bg-[color-mix(in_srgb,var(--brand)_6%,transparent)] p-5">
          <h2 className="text-sm font-bold text-ink">{t("termPlanTitle")}</h2>
          <p className="mt-1 text-sm text-muted">
            {activePlan
              ? t("termPlanActiveHint", {
                  paid: activePlan.installmentsPaid,
                  total: activePlan.installmentCount,
                  next: activePlan.nextDueCents
                    ? formatMoney(activePlan.nextDueCents)
                    : "—",
                })
              : t("termPlanIntro", {
                  count: TERM_INSTALLMENT_COUNT,
                  total: formatMoney(outstanding),
                  installment: formatMoney(termFirstInstallment),
                })}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setShowTermPay(true)}
              className="rounded-xl px-4 py-2.5 text-sm font-bold text-white"
              style={{ background: "var(--brand)" }}
            >
              {activePlan ? t("payNextInstallment") : t("startTermPlan")}
            </button>
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">{t("invoicesTitle")}</h2>
        {invoices.length === 0 ? (
          <div className="rounded-2xl border border-[--hair] bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">{t("noInvoices")}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[--hair] bg-surface">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[--hair]">
                  {[t("table.number"), t("table.issued"), t("table.student"), t("table.amount"), t("table.due"), t("table.status"), t("table.actions")].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className={`border-b border-[--hair] last:border-0 ${
                      inv.status === "overdue" ? "bg-[color-mix(in_srgb,#ef4444_4%,transparent)]" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-ink">
                      {formatInvoiceNumber(inv.invoiceNumber)}
                    </td>
                    <td className="px-4 py-3 text-ink">{fmtDate(inv.issuedAt, locale)}</td>
                    <td className="px-4 py-3 text-ink">{inv.studentName ?? "—"}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-ink">
                      {formatMoney(inv.amountCents)}
                    </td>
                    <td className="px-4 py-3 text-muted">{fmtDate(inv.dueDate, locale)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={inv.status} />
                    </td>
                    <td className="px-4 py-3">
                      {(inv.status === "sent" || inv.status === "overdue") && stripeConfigured && (
                        <button
                          type="button"
                          onClick={() => setPayInvoice(inv)}
                          className="rounded-lg border border-[--brand] px-3 py-1.5 text-xs font-bold text-[--brand] transition hover:bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]"
                        >
                          {t("payNow")}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">{t("paymentsTitle")}</h2>
        {payments.length === 0 ? (
          <div className="rounded-2xl border border-[--hair] bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">{t("noPayments")}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[--hair] bg-surface">
            <table className="w-full min-w-[400px] text-sm">
              <thead>
                <tr className="border-b border-[--hair]">
                  {[t("paymentsTable.date"), t("paymentsTable.amount"), t("paymentsTable.invoice")].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-[--hair] last:border-0">
                    <td className="px-4 py-3 text-ink">{fmtDate(p.createdAt, locale)}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-ink">
                      {formatMoney(p.amountCents)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted">
                      {p.invoiceNumber != null ? formatInvoiceNumber(p.invoiceNumber) : "—"}
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
          <h2 className="mb-3 text-xs uppercase tracking-widest text-muted">{t("ordersTitle")}</h2>
          <div className="overflow-hidden rounded-2xl border border-[--hair] bg-surface">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b border-[--hair]">
                  {[t("ordersTable.date"), t("ordersTable.amount"), t("ordersTable.status")].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-[--hair] last:border-0">
                    <td className="px-4 py-3 text-ink">{fmtDate(o.createdAt, locale)}</td>
                    <td className="px-4 py-3 font-semibold tabular-nums text-ink">
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

      {autoPayItems.length > 0 && (
        <section className="border-t border-[--hair] pt-8">
          <AutoPaySetup items={autoPayItems} />
        </section>
      )}

      {showTermPay && (
        <TermInstallmentPayModal
          onClose={() => setShowTermPay(false)}
          onPaid={() => window.location.reload()}
        />
      )}

      {payInvoice && (
        <PayInvoiceModal
          invoiceId={payInvoice.id}
          amountCents={payInvoice.amountCents}
          label={payInvoice.studentName ?? t("invoiceFallback")}
          onClose={() => setPayInvoice(null)}
          onPaid={() => window.location.reload()}
        />
      )}
    </motion.div>
  );
}
