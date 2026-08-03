"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { sendBulkPaymentReminders } from "@/app/portal/admin/billing/actions";
import { formatMoney } from "@/lib/currency";
import { formatShortDate } from "@/lib/xero/format";

export type CollectionsInvoice = {
  id: string;
  invoiceNumber: number;
  amountCents: number;
  dueDate: string;
  description: string | null;
  daysOverdue: number;
};

export type CollectionsFamily = {
  payerId: string;
  payerName: string;
  totalCents: number;
  maxDaysOverdue: number;
  invoices: CollectionsInvoice[];
};

function FamilyReminderButton({
  invoiceIds,
  onDone,
}: {
  invoiceIds: string[];
  onDone: () => void;
}) {
  const t = useTranslations("admin.money.collections");
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-0.5">
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErr(null);
          startTransition(async () => {
            const res = await sendBulkPaymentReminders(invoiceIds);
            if (!res.ok) setErr(res.error);
            else onDone();
          });
        }}
        className="rounded-lg border border-[--hair] bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-base disabled:opacity-50"
      >
        {pending ? t("sending") : t("remind")}
      </button>
      {err && <span className="text-[0.65rem] text-red-600">{err}</span>}
    </div>
  );
}

export function CollectionsDashboard({ queue }: { queue: CollectionsFamily[] }) {
  const t = useTranslations("admin.money.collections");
  const router = useRouter();
  const [bulkPending, startBulk] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<number | null>(null);

  const allInvoiceIds = useMemo(
    () => queue.flatMap((f) => f.invoices.map((i) => i.id)),
    [queue],
  );
  const totalCents = useMemo(() => queue.reduce((s, f) => s + f.totalCents, 0), [queue]);

  const remindAll = () => {
    setBulkError(null);
    setBulkResult(null);
    startBulk(async () => {
      const res = await sendBulkPaymentReminders(allInvoiceIds);
      if (!res.ok) setBulkError(res.error);
      else {
        setBulkResult(res.sent);
        router.refresh();
      }
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto max-w-6xl space-y-6 p-6"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-black tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
        </div>
        {queue.length > 0 && (
          <button
            type="button"
            onClick={remindAll}
            disabled={bulkPending}
            className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {bulkPending ? t("sending") : t("remindAll", { count: allInvoiceIds.length })}
          </button>
        )}
      </header>

      {bulkError && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {bulkError}
        </p>
      )}
      {bulkResult !== null && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {t("remindAllResult", { count: bulkResult })}
        </p>
      )}

      {queue.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[--hair] bg-base/50 p-14 text-center">
          <p className="text-sm font-semibold text-ink">{t("empty.title")}</p>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{t("empty.body")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[--hair] bg-surface">
          <div className="flex items-center gap-3 border-b border-[--hair] px-6 py-4">
            <h2 className="text-sm font-bold text-ink">{t("queueTitle")}</h2>
            <span className="text-xs text-muted">
              {t("queueSubtitle", { count: queue.length, amount: formatMoney(totalCents) })}
            </span>
          </div>
          <ul className="divide-y divide-[--hair]">
            {queue.map((f) => (
              <li key={f.payerId} className="px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-ink">{f.payerName}</p>
                      <span className="inline-flex items-center rounded-full bg-[rgba(220,38,38,.11)] px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-[#b91c1c]">
                        {t("overdueTag", { days: f.maxDaysOverdue })}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {t("invoiceList", {
                        refs: f.invoices
                          .map((i) => `#${i.invoiceNumber} (${formatShortDate(i.dueDate)})`)
                          .join(", "),
                      })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span
                      className="tabular-nums text-ink"
                      style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.1rem" }}
                    >
                      {formatMoney(f.totalCents)}
                    </span>
                    <FamilyReminderButton
                      invoiceIds={f.invoices.map((i) => i.id)}
                      onDone={() => router.refresh()}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
