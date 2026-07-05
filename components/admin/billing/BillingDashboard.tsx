"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  BillingSubscriptionRow,
  InvoiceRow,
  InvoiceTemplate,
  ParentOption,
  RevenueSeries,
  SourceBreakdown,
  UnpaidAccount,
} from "@/app/portal/admin/billing/page";
import {
  createInvoice,
  sendAllDraftInvoices,
  sendBulkPaymentReminders,
  sendInvoiceNow,
  sendPaymentReminder,
  voidInvoice,
} from "@/app/portal/admin/billing/actions";
import { refundSale } from "@/app/portal/admin/billing/refund-actions";
import { SubscriptionCancelActions } from "@/components/admin/subscriptions/SubscriptionCancelActions";
import { InvoiceDetailModal } from "@/components/admin/billing/InvoiceDetailModal";
import { InvoiceTemplatesModal } from "@/components/admin/billing/InvoiceTemplatesModal";
import {
  LineItemRows,
  emptyLineItem,
  fromInvoiceLineItems,
  lineItemsTotalCents,
  toLineItemPayload,
  type EditableLineItem,
} from "@/components/admin/billing/InvoiceLineItemsEditor";
import { openInXeroUrl } from "@/lib/xero/links";
import { formatMoney } from "@/lib/currency";
import { formatMonthKey, formatShortDate } from "@/lib/xero/format";
import { intervalLabel, type BillingInterval } from "@/lib/subscriptions/pricing";
import Link from "next/link";
import { formatInvoiceNumber } from "@/lib/invoices/format-invoice-number";

const NZD = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
const NZD2 = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

const SUBSCRIPTION_STATUS_KEYS = [
  "active",
  "trialing",
  "past_due",
  "unpaid",
  "incomplete",
  "canceled",
] as const;

function subscriptionBillingLabel(interval: string) {
  try {
    return intervalLabel(interval as BillingInterval);
  } catch {
    return interval;
  }
}

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

const SUBSCRIPTION_STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  active: { bg: "#dcfce7", text: "#16a34a" },
  trialing: { bg: "#dbeafe", text: "#2563eb" },
  past_due: { bg: "#fef3c7", text: "#d97706" },
  unpaid: { bg: "#fef3c7", text: "#d97706" },
  incomplete: { bg: "#f1f5f9", text: "#64748b" },
  canceled: { bg: "#fee2e2", text: "#dc2626" },
};

function SubscriptionStatusBadge({ status }: { status: string }) {
  const tSubs = useTranslations("admin.subscriptions");
  const s = SUBSCRIPTION_STATUS_STYLES[status] ?? { bg: "#f1f5f9", text: "#64748b" };
  const label = SUBSCRIPTION_STATUS_KEYS.includes(status as (typeof SUBSCRIPTION_STATUS_KEYS)[number])
    ? tSubs(`status.${status}` as "status.active")
    : status.replace("_", " ");
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider"
      style={{ background: s.bg, color: s.text }}
    >
      {label}
    </span>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-[--hair] bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function CreateInvoiceModal({
  parents,
  templates,
  onClose,
  onCreated,
  onManageTemplates,
}: {
  parents: ParentOption[];
  templates: InvoiceTemplate[];
  onClose: () => void;
  onCreated: () => void;
  onManageTemplates: () => void;
}) {
  const t = useTranslations("admin.billing");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [payerId, setPayerId] = useState(parents[0]?.id ?? "");
  const [studentId, setStudentId] = useState("");
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [description, setDescription] = useState("");
  const [sendNow, setSendNow] = useState(true);
  const [templateId, setTemplateId] = useState("");
  const [itemized, setItemized] = useState(false);
  const [items, setItems] = useState<EditableLineItem[]>([emptyLineItem()]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedParent = parents.find((p) => p.id === payerId);
  const students = selectedParent?.students ?? [];

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((tpl) => tpl.id === id);
    if (!template) return;
    setDescription(template.description ?? template.name);
    const due = new Date();
    due.setDate(due.getDate() + template.defaultDueDays);
    setDueDate(due.toISOString().slice(0, 10));
    setItemized(true);
    setItems(fromInvoiceLineItems(template.lineItems));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!payerId) return setError(t("createModal.selectParentError"));

    let amountDollars: number;
    let lineItemsPayload: { description: string; quantity: number; unitDollars: number }[] | undefined;

    if (itemized) {
      const parsed = toLineItemPayload(items);
      if (!parsed.ok) return setError(t("createModal.invalidLineItemsError"));
      lineItemsPayload = parsed.lineItems;
      amountDollars = lineItemsTotalCents(items) / 100;
    } else {
      amountDollars = Number.parseFloat(amount);
      if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
        return setError(t("createModal.validAmountError"));
      }
    }

    startTransition(async () => {
      const res = await createInvoice({
        payerId,
        studentId: studentId || undefined,
        amountDollars,
        dueDate,
        description: description.trim() || undefined,
        sendNow,
        lineItems: lineItemsPayload,
      });
      if (!res.ok) setError(res.error);
      else {
        if (res.xeroError) {
          setError(t("createModal.xeroSyncError", { error: res.xeroError }));
        }
        onCreated();
        if (!res.xeroError) onClose();
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[--hair] bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-ink">{t("createModal.title")}</h2>
            <p className="mt-1 text-sm text-muted">{t("createModal.description")}</p>
          </div>
          <button
            type="button"
            onClick={onManageTemplates}
            className="shrink-0 text-xs font-semibold text-ink underline hover:opacity-80"
          >
            {t("templates.manage")}
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 space-y-4">
          {templates.length > 0 && (
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              {t("templates.useTemplate")}
              <select
                value={templateId}
                onChange={(e) => applyTemplate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
              >
                <option value="">{t("templates.noTemplate")}</option>
                {templates.map((tpl) => (
                  <option key={tpl.id} value={tpl.id}>
                    {tpl.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
            {t("createModal.parent")}
            <select
              value={payerId}
              onChange={(e) => {
                setPayerId(e.target.value);
                setStudentId("");
              }}
              className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
            >
              {parents.length === 0 && <option value="">{tShared("noParentsFound")}</option>}
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.email ? ` · ${p.email}` : ""}
                </option>
              ))}
            </select>
          </label>

          {students.length > 0 && (
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              {t("createModal.student")}{" "}
              <span className="font-normal normal-case">{tShared("optional")}</span>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
              >
                <option value="">{tShared("notLinkedStudent")}</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className={itemized ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
            {!itemized && (
              <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
                {t("createModal.amount")}
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t("createModal.amountPlaceholder")}
                  className="mt-1 w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                  required
                />
              </label>
            )}
            <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
              {t("createModal.dueDate")}
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
            {t("createModal.descriptionLabel")}
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("createModal.descriptionPlaceholder")}
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
              {t("templates.itemize")}
            </label>
            {itemized && (
              <div className="mt-2">
                <LineItemRows
                  items={items}
                  onChange={setItems}
                  labels={{
                    description: t("detailModal.itemDescription"),
                    quantity: t("detailModal.qty"),
                    unitPrice: t("detailModal.unitPrice"),
                    addLine: t("detailModal.addLine"),
                    remove: tCommon("delete"),
                    total: tCommon("total"),
                  }}
                />
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow(e.target.checked)}
              className="rounded border-[--hair]"
            />
            {t("createModal.sendNow")}
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[--hair] px-4 py-2 text-sm font-semibold text-muted hover:bg-base"
            >
              {tCommon("cancel")}
            </button>
            <button
              type="submit"
              disabled={pending || parents.length === 0}
              className="rounded-xl bg-ink px-4 py-2 text-sm font-bold text-paper disabled:opacity-50"
            >
              {pending
                ? tShared("creating")
                : sendNow
                  ? t("createModal.createAndSend")
                  : t("createModal.saveDraft")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SendInvoiceButton({
  invoice,
  onSent,
}: {
  invoice: InvoiceRow;
  onSent: (id: string) => void;
}) {
  const t = useTranslations("admin.billing");
  const tShared = useTranslations("admin.shared");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [xeroWarn, setXeroWarn] = useState<string | null>(null);

  if (invoice.status !== "draft") return null;

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErr(null);
          setXeroWarn(null);
          startTransition(async () => {
            const res = await sendInvoiceNow(invoice.id);
            if (res.ok) {
              onSent(invoice.id);
              if (res.xeroError) setXeroWarn(t("sendXeroSyncError", { error: res.xeroError }));
            } else {
              setErr(res.error);
            }
          });
        }}
        className="rounded-lg border border-[--hair] bg-ink px-2.5 py-1 text-[0.7rem] font-semibold text-paper hover:opacity-90 disabled:opacity-50"
      >
        {pending ? tShared("sending") : t("send")}
      </button>
      {err && <span className="text-[0.65rem] text-[#dc2626]">{err}</span>}
      {xeroWarn && <span className="text-[0.65rem] text-amber-700">{xeroWarn}</span>}
    </div>
  );
}

function RemindButton({
  invoiceId,
  label,
  onDone,
}: {
  invoiceId: string;
  label?: string;
  onDone?: () => void;
}) {
  const tShared = useTranslations("admin.shared");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const res = await sendPaymentReminder(invoiceId);
            if (!res.ok) setErr(res.error);
            else onDone?.();
          });
        }}
        className="rounded-lg border border-[--hair] bg-base px-2.5 py-1 text-[0.7rem] font-semibold text-ink hover:bg-surface disabled:opacity-50"
      >
        {pending ? tShared("sending") : (label ?? tShared("remind"))}
      </button>
      {err && <p className="mt-0.5 text-[0.65rem] text-red-600">{err}</p>}
    </div>
  );
}

function RefundButton({ invoice, onDone }: { invoice: InvoiceRow; onDone: (id: string) => void }) {
  const t = useTranslations("admin.billing");
  const tShared = useTranslations("admin.shared");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const maxDollars = invoice.amountCents / 100;
  const [amountStr, setAmountStr] = useState(maxDollars.toFixed(2));

  if (invoice.status !== "paid") return <span className="text-muted">{tShared("dash")}</span>;
  if (!invoice.stripePaymentIntentId) {
    return <span className="text-[0.7rem] text-muted">{tShared("noCardPayment")}</span>;
  }

  function doRefund() {
    const dollars = parseFloat(amountStr);
    if (Number.isNaN(dollars) || dollars <= 0) {
      setErr("Enter a valid amount.");
      return;
    }
    const cents = Math.round(dollars * 100);
    if (cents > invoice.amountCents) {
      setErr(`Max refundable is ${NZD2.format(maxDollars)}.`);
      return;
    }
    const isPartial = cents < invoice.amountCents;
    const label = isPartial
      ? `Issue partial refund of ${NZD2.format(dollars)} to ${invoice.payerName ?? "this payer"}?`
      : `Fully refund ${NZD2.format(dollars)} to ${invoice.payerName ?? "this payer"}?`;
    if (!window.confirm(label)) return;
    setErr(null);
    startTransition(async () => {
      const res = await refundSale("invoice", invoice.id, isPartial ? cents : undefined);
      if (res.ok) {
        onDone(invoice.id);
        setOpen(false);
      } else {
        setErr(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => { setErr(null); setAmountStr(maxDollars.toFixed(2)); setOpen(true); }}
        className="rounded-lg border border-[--hair] px-2.5 py-1 text-[0.7rem] font-semibold text-[#dc2626] hover:bg-[#fee2e2]"
      >
        {tShared("refund")}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <span className="text-[0.7rem] text-muted">$</span>
        <input
          type="number"
          min="0.01"
          max={maxDollars}
          step="0.01"
          value={amountStr}
          onChange={(e) => setAmountStr(e.target.value)}
          className="w-20 rounded border border-[--hair] px-1.5 py-0.5 text-[0.7rem] tabular-nums focus:outline-none focus:ring-1 focus:ring-brand"
          autoFocus
        />
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={doRefund}
          disabled={pending}
          className="rounded-lg border border-[--hair] px-2 py-0.5 text-[0.7rem] font-semibold text-[#dc2626] hover:bg-[#fee2e2] disabled:opacity-50"
        >
          {pending ? tShared("refunding") : "Confirm"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-[--hair] px-2 py-0.5 text-[0.7rem] text-muted hover:bg-surface"
        >
          Cancel
        </button>
      </div>
      {err && <span className="text-[0.65rem] text-[#dc2626]">{err}</span>}
    </div>
  );
}

function VoidButton({ invoice, onDone }: { invoice: InvoiceRow; onDone: (id: string) => void }) {
  const t = useTranslations("admin.billing");
  const tShared = useTranslations("admin.shared");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [xeroWarn, setXeroWarn] = useState<string | null>(null);

  if (!["draft", "sent", "overdue"].includes(invoice.status)) {
    return null;
  }

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={() => {
          setErr(null);
          setXeroWarn(null);
          if (
            !window.confirm(
              t("voidConfirm", {
                amount: NZD2.format(invoice.amountCents / 100),
                payer: invoice.payerName ?? tShared("unknown"),
              }),
            )
          ) {
            return;
          }
          startTransition(async () => {
            const res = await voidInvoice(invoice.id);
            if (res.ok) {
              onDone(invoice.id);
              if (res.xeroError) {
                setXeroWarn(t("voidXeroSyncError", { error: res.xeroError }));
              }
            } else {
              setErr(res.error);
            }
          });
        }}
        disabled={pending}
        className="rounded-lg border border-[--hair] px-2.5 py-1 text-[0.7rem] font-semibold text-muted hover:bg-surface disabled:opacity-50"
      >
        {pending ? tShared("voiding") : tShared("void")}
      </button>
      {err && <span className="text-[0.65rem] text-[#dc2626]">{err}</span>}
      {xeroWarn && <span className="text-[0.65rem] text-amber-700">{xeroWarn}</span>}
    </div>
  );
}

export function BillingDashboard({
  invoices: initialInvoices,
  unpaidInvoices,
  unpaidAccounts,
  parents,
  revenue,
  sources,
  mrrCents,
  activeSubs,
  totalPaidCents,
  totalOutstandingCents,
  overdueCount,
  subscriptions: initialSubscriptions,
  templates: initialTemplates,
}: {
  invoices: InvoiceRow[];
  unpaidInvoices: InvoiceRow[];
  unpaidAccounts: UnpaidAccount[];
  parents: ParentOption[];
  revenue: RevenueSeries;
  sources: SourceBreakdown;
  mrrCents: number;
  activeSubs: number;
  totalPaidCents: number;
  totalOutstandingCents: number;
  overdueCount: number;
  subscriptions: BillingSubscriptionRow[];
  templates: InvoiceTemplate[];
}) {
  const t = useTranslations("admin.billing");
  const tSubs = useTranslations("admin.subscriptions");
  const tShared = useTranslations("admin.shared");
  const tStatus = useTranslations("admin.shared.status");
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [showInsights, setShowInsights] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [viewingInvoice, setViewingInvoice] = useState<InvoiceRow | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [invoices, setInvoices] = useState<InvoiceRow[]>(initialInvoices);
  const [subscriptions, setSubscriptions] = useState(initialSubscriptions);
  const [templates, setTemplates] = useState<InvoiceTemplate[]>(initialTemplates);
  const [bulkPending, startBulk] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [draftBulkPending, startDraftBulk] = useTransition();
  const [draftBulkError, setDraftBulkError] = useState<string | null>(null);
  const [draftBulkResult, setDraftBulkResult] = useState<{ sent: number; failed: number } | null>(null);

  const markRefunded = (id: string) =>
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status: "refunded" } : i)));

  const markVoided = (id: string) =>
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status: "void" } : i)));

  const markSent = (id: string) => {
    setInvoices((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: "sent", issuedAt: new Date().toISOString() } : i)),
    );
    router.refresh();
  };

  const applyInvoiceUpdate = (id: string, patch: Partial<InvoiceRow>) => {
    setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
    router.refresh();
  };

  const addTemplate = (template: InvoiceTemplate) => setTemplates((prev) => [...prev, template]);
  const replaceTemplate = (template: InvoiceTemplate) =>
    setTemplates((prev) => prev.map((t) => (t.id === template.id ? template : t)));
  const removeTemplate = (id: string) => setTemplates((prev) => prev.filter((t) => t.id !== id));

  const markSubscriptionCanceled = (id: string, immediate: boolean) => {
    setSubscriptions((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              status: immediate ? "canceled" : s.status,
              cancelAtPeriodEnd: immediate ? false : true,
            }
          : s,
      ),
    );
  };

  const cancelableSubscriptions = useMemo(
    () =>
      subscriptions.filter(
        (s) =>
          s.status !== "canceled" &&
          (["active", "trialing", "past_due", "unpaid"].includes(s.status) || s.cancelAtPeriodEnd),
      ),
    [subscriptions],
  );

  const refresh = () => router.refresh();

  const overdueIds = useMemo(
    () => unpaidInvoices.filter((i) => i.status === "overdue").map((i) => i.id),
    [unpaidInvoices],
  );

  const remindAllOverdue = () => {
    setBulkError(null);
    startBulk(async () => {
      const res = await sendBulkPaymentReminders(overdueIds);
      if (!res.ok) setBulkError(res.error);
      else refresh();
    });
  };

  const draftIds = useMemo(() => invoices.filter((i) => i.status === "draft").map((i) => i.id), [invoices]);

  const sendAllDrafts = () => {
    setDraftBulkError(null);
    setDraftBulkResult(null);
    startDraftBulk(async () => {
      const res = await sendAllDraftInvoices();
      if (!res.ok) setDraftBulkError(res.error);
      else {
        setDraftBulkResult({ sent: res.sent, failed: res.failed.length });
        refresh();
      }
    });
  };

  const filtered = invoices.filter((inv) => {
    if (statusFilter !== "all" && inv.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        inv.studentName?.toLowerCase().includes(q) ||
        inv.payerName?.toLowerCase().includes(q) ||
        inv.id.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const chartData = revenue.map((r) => ({
    month: formatMonthKey(r.month),
    revenue: r.revenueCents / 100,
  }));

  const sourceTotal = sources.tuitionCents + sources.shopCents + sources.eventsCents;

  const reminderHeaders = [
    t("reminders.table.parent"),
    t("reminders.table.student"),
    t("reminders.table.amount"),
    t("reminders.table.due"),
    t("reminders.table.status"),
    "",
  ];

  const invoiceHeaders = [
    t("allInvoices.table.number"),
    t("allInvoices.table.dancer"),
    t("allInvoices.table.parent"),
    t("allInvoices.table.amount"),
    t("allInvoices.table.status"),
    t("allInvoices.table.due"),
    t("allInvoices.table.paid"),
    "",
  ];

  return (
    <>
      {showCreate && (
        <CreateInvoiceModal
          parents={parents}
          templates={templates}
          onClose={() => setShowCreate(false)}
          onCreated={refresh}
          onManageTemplates={() => setShowTemplates(true)}
        />
      )}

      {showTemplates && (
        <InvoiceTemplatesModal
          templates={templates}
          onClose={() => setShowTemplates(false)}
          onCreated={addTemplate}
          onUpdated={replaceTemplate}
          onDeleted={removeTemplate}
        />
      )}

      {viewingInvoice && (
        <InvoiceDetailModal
          invoice={viewingInvoice}
          onClose={() => setViewingInvoice(null)}
          onUpdated={(patch) => applyInvoiceUpdate(viewingInvoice.id, patch)}
        />
      )}

      <motion.div
        initial="hidden"
        animate="show"
        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
        className="mx-auto max-w-6xl space-y-8 p-6"
      >
        <motion.header
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
          className="flex flex-wrap items-start justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl font-black tracking-tight text-ink">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-paper shadow-sm hover:opacity-90"
          >
            {t("createInvoice")}
          </button>
        </motion.header>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <StatCard
            label={t("stats.outstanding")}
            value={NZD.format(totalOutstandingCents / 100)}
            sub={t("stats.outstandingSub", { unpaid: unpaidInvoices.length, overdue: overdueCount })}
          />
          <StatCard
            label={t("stats.familiesOwing")}
            value={String(unpaidAccounts.length)}
            sub={
              overdueCount > 0 ? t("stats.familiesOwingPrioritize") : t("stats.familiesOwingCurrent")
            }
          />
          <StatCard
            label={t("stats.collectedYtd")}
            value={NZD.format(totalPaidCents / 100)}
            sub={t("stats.collectedSub")}
          />
          <StatCard
            label={t("stats.mrr")}
            value={NZD.format(mrrCents / 100)}
            sub={t("stats.mrrSub", { count: activeSubs })}
          />
        </motion.div>

        <motion.section
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
          className="rounded-2xl border border-[--hair] bg-surface"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-[--hair] px-6 py-4">
            <div className="mr-auto">
              <h2 className="text-sm font-bold text-ink">{t("subscriptions.title")}</h2>
              <p className="text-xs text-muted">{t("subscriptions.subtitle")}</p>
            </div>
            <Link
              href="/portal/admin/subscriptions"
              className="text-xs font-semibold text-ink underline hover:opacity-80"
            >
              {t("subscriptions.manageAll")}
            </Link>
          </div>

          {cancelableSubscriptions.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">{t("subscriptions.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-[--hair]">
                    {[
                      tSubs("table.plan"),
                      tSubs("table.payer"),
                      tSubs("table.student"),
                      tSubs("table.monthly"),
                      tSubs("table.status"),
                      tSubs("table.nextCharge"),
                      "",
                    ].map((h, idx) => (
                      <th
                        key={h || `sub-col-${idx}`}
                        className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cancelableSubscriptions.map((sub) => (
                    <tr
                      key={sub.id}
                      className="border-b border-[--hair] last:border-0 hover:bg-[color-mix(in_srgb,var(--brand)_3%,transparent)]"
                    >
                      <td className="px-4 py-3 font-medium text-ink">
                        {sub.planLabel ?? tSubs("defaultPlan")}
                      </td>
                      <td className="px-4 py-3 text-muted">{sub.payerName ?? tShared("dash")}</td>
                      <td className="px-4 py-3 text-muted">{sub.studentName ?? tShared("dash")}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {formatMoney(sub.monthlyAmountCents)}
                        <span className="block text-xs font-normal text-muted">
                          {subscriptionBillingLabel(sub.billingInterval)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <SubscriptionStatusBadge status={sub.status} />
                        {sub.cancelAtPeriodEnd && sub.status !== "canceled" && (
                          <span className="ml-1.5 text-[0.6rem] font-semibold text-amber-600">
                            {tShared("ending")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {sub.cancelAtPeriodEnd || !sub.currentPeriodEnd
                          ? tShared("dash")
                          : formatShortDate(sub.currentPeriodEnd.slice(0, 10))}
                      </td>
                      <td className="px-4 py-3">
                        <SubscriptionCancelActions
                          subscription={sub}
                          onCanceled={markSubscriptionCanceled}
                          align="start"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>

        <motion.section
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
          className="rounded-2xl border border-[--hair] bg-surface"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-[--hair] px-6 py-4">
            <div className="mr-auto">
              <h2 className="text-sm font-bold text-ink">{t("reminders.title")}</h2>
              <p className="text-xs text-muted">{t("reminders.subtitle")}</p>
            </div>
            {overdueIds.length > 0 && (
              <button
                type="button"
                onClick={remindAllOverdue}
                disabled={bulkPending}
                className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                {bulkPending
                  ? tShared("sending")
                  : t("reminders.remindAllOverdue", { count: overdueIds.length })}
              </button>
            )}
          </div>

          {bulkError && (
            <p className="border-b border-[--hair] px-6 py-2 text-sm text-red-600">{bulkError}</p>
          )}

          {unpaidInvoices.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted">{t("reminders.empty")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[--hair]">
                    {reminderHeaders.map((h) => (
                      <th
                        key={h || "actions"}
                        className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unpaidInvoices.map((inv) => (
                    <tr
                      key={inv.id}
                      className={`border-b border-[--hair] last:border-0 ${
                        inv.status === "overdue" ? "bg-red-50/40" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-ink">{inv.payerName ?? tShared("dash")}</td>
                      <td className="px-4 py-3 text-muted">{inv.studentName ?? tShared("dash")}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{formatMoney(inv.amountCents)}</td>
                      <td className="px-4 py-3 text-muted">
                        {inv.dueDate ? formatShortDate(inv.dueDate) : tShared("dash")}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-4 py-3">
                        <RemindButton
                          invoiceId={inv.id}
                          label={
                            inv.status === "overdue"
                              ? tShared("chasePayment")
                              : tShared("sendReminder")
                          }
                          onDone={refresh}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.section>

        {unpaidAccounts.length > 0 && (
          <motion.section
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
            className="rounded-2xl border border-[--hair] bg-surface p-6"
          >
            <h2 className="text-sm font-bold text-ink">{t("accounts.title")}</h2>
            <p className="mt-1 text-xs text-muted">{t("accounts.subtitle")}</p>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {unpaidAccounts.slice(0, 8).map((acct) => (
                <li
                  key={acct.payerId}
                  className="flex items-center justify-between rounded-xl border border-[--hair] bg-base px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-ink">{acct.payerName}</p>
                    <p className="text-xs text-muted">
                      {t("accounts.invoiceMeta", {
                        count: acct.invoiceCount,
                        oldest: acct.oldestDueDate ? formatShortDate(acct.oldestDueDate) : "empty",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold tabular-nums text-ink">{formatMoney(acct.totalCents)}</p>
                    {acct.overdueCents > 0 && (
                      <p className="text-[0.65rem] font-semibold text-red-600">
                        {tShared("overdueAmount", { amount: formatMoney(acct.overdueCents) })}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </motion.section>
        )}

        <motion.section variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}>
          <button
            type="button"
            onClick={() => setShowInsights((v) => !v)}
            className="flex w-full items-center justify-between rounded-2xl border border-[--hair] bg-surface px-6 py-4 text-left"
          >
            <div>
              <h2 className="text-sm font-bold text-ink">{t("insights.title")}</h2>
              <p className="text-xs text-muted">{t("insights.subtitle")}</p>
            </div>
            <span className="text-muted">{showInsights ? "▲" : "▼"}</span>
          </button>

          {showInsights && (
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-[--hair] bg-surface p-6">
                <div className="mb-4 flex items-baseline justify-between">
                  <h3 className="text-sm font-bold text-ink">{t("insights.bySource")}</h3>
                  <span className="text-xs text-muted">
                    {t("insights.last12Months", { total: NZD.format(sourceTotal / 100) })}
                  </span>
                </div>
                {sourceTotal === 0 ? (
                  <p className="text-sm text-muted">{t("insights.noRevenue")}</p>
                ) : (
                  <ul className="grid gap-2 sm:grid-cols-3">
                    {[
                      { label: t("insights.tuitionFees"), cents: sources.tuitionCents },
                      { label: t("insights.merchandise"), cents: sources.shopCents },
                      { label: t("insights.events"), cents: sources.eventsCents },
                    ].map((s) => (
                      <li key={s.label} className="flex justify-between text-xs">
                        <span className="text-muted">{s.label}</span>
                        <span className="font-semibold tabular-nums">{formatMoney(s.cents)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="rounded-2xl border border-[--hair] bg-surface p-6">
                <h3 className="mb-5 text-sm font-bold text-ink">{t("insights.monthlyTuition")}</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--hair)" />
                    <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted)" }} axisLine={false} tickLine={false} />
                    <YAxis
                      tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      tick={{ fontSize: 11, fill: "var(--muted)" }}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                    />
                    <Tooltip
                      formatter={(value: unknown) => [NZD2.format(Number(value)), tShared("revenue")]}
                      contentStyle={{
                        background: "var(--base)",
                        border: "1px solid var(--hair)",
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                    />
                    <Bar dataKey="revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={48} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </motion.section>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
          className="rounded-2xl border border-[--hair] bg-surface"
        >
          <div className="flex flex-wrap items-center gap-3 border-b border-[--hair] px-6 py-4">
            <h2 className="mr-auto text-sm font-bold text-ink">
              {t("allInvoices.title")}
              <span className="ml-2 font-normal text-muted">({filtered.length})</span>
            </h2>
            {draftIds.length > 0 && (
              <button
                type="button"
                onClick={sendAllDrafts}
                disabled={draftBulkPending}
                className="rounded-xl border border-[--hair] bg-base px-3 py-1.5 text-xs font-semibold text-ink hover:bg-surface disabled:opacity-50"
              >
                {draftBulkPending
                  ? tShared("sending")
                  : t("allInvoices.sendAllDrafts", { count: draftIds.length })}
              </button>
            )}
            <input
              type="text"
              placeholder={t("allInvoices.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 rounded-lg border border-[--hair] bg-base px-3 py-1.5 text-xs text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-[--hair] bg-base px-3 py-1.5 text-xs text-ink"
            >
              <option value="all">{tShared("invoiceStatus.all")}</option>
              <option value="paid">{tStatus("paid")}</option>
              <option value="sent">{tStatus("sent")}</option>
              <option value="overdue">{tStatus("overdue")}</option>
              <option value="draft">{tStatus("draft")}</option>
              <option value="refunded">{tStatus("refunded")}</option>
            </select>
          </div>

          {draftBulkError && (
            <p className="border-b border-[--hair] px-6 py-2 text-sm text-red-600">{draftBulkError}</p>
          )}
          {draftBulkResult && (
            <p className="border-b border-[--hair] px-6 py-2 text-sm text-muted">
              {draftBulkResult.failed > 0
                ? t("allInvoices.draftsSentWithFailures", {
                    sent: draftBulkResult.sent,
                    failed: draftBulkResult.failed,
                  })
                : t("allInvoices.draftsSent", { sent: draftBulkResult.sent })}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-[--hair]">
                  {invoiceHeaders.map((h, idx) => (
                    <th
                      key={h || `col-${idx}`}
                      className="px-4 py-3 text-left text-[0.62rem] font-semibold uppercase tracking-wider text-muted"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-muted">
                      {t("allInvoices.empty")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((inv) => (
                    <tr
                      key={inv.id}
                      className="border-b border-[--hair] last:border-0 hover:bg-[color-mix(in_srgb,var(--brand)_3%,transparent)]"
                    >
                      <td className="px-4 py-3 font-mono text-xs">
                        <button
                          type="button"
                          onClick={() => setViewingInvoice(inv)}
                          className="text-ink underline decoration-dotted hover:opacity-70"
                        >
                          {formatInvoiceNumber(inv.invoiceNumber)}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-ink">
                        {inv.studentName ?? <span className="text-muted">{tShared("dash")}</span>}
                      </td>
                      <td className="px-4 py-3 text-muted">{inv.payerName ?? tShared("dash")}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{formatMoney(inv.amountCents)}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={inv.status} />
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {inv.dueDate ? formatShortDate(inv.dueDate) : tShared("dash")}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {inv.paidAt ? formatShortDate(inv.paidAt.slice(0, 10)) : tShared("dash")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <button
                            type="button"
                            onClick={() => setViewingInvoice(inv)}
                            className="rounded-lg border border-[--hair] bg-base px-2.5 py-1 text-[0.7rem] font-semibold text-ink hover:bg-surface"
                          >
                            {t("view")}
                          </button>
                          <SendInvoiceButton invoice={inv} onSent={markSent} />
                          {["sent", "overdue"].includes(inv.status) && (
                            <RemindButton invoiceId={inv.id} onDone={refresh} />
                          )}
                          <VoidButton invoice={inv} onDone={markVoided} />
                          <RefundButton invoice={inv} onDone={markRefunded} />
                          {inv.xeroInvoiceId && (
                            <a
                              href={openInXeroUrl(null, "invoice", inv.xeroInvoiceId)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[0.65rem] font-semibold text-[#13B5EA] hover:underline"
                            >
                              {tShared("viewInXero")}
                            </a>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>
    </>
  );
}
