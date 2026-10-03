"use client";

// ============================================================================
//  Xero numbers on Money → Accounting, shown only when Xero is the studio's
//  accounting choice: P&L straight from the Xero org, plus GST and aged
//  receivables computed from Olune's own invoices. Connection state and the
//  switch controls live in AccountingHome above this.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
import type { AccountingSnapshot } from "@/lib/xero/accounting-data";
import { formatMonthKey } from "@/lib/xero/format";
import { refreshAccountingData } from "@/app/portal/admin/accounting/actions";
import { formatMoney } from "@/lib/currency";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const NZD = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 });
const NZD2 = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

export type AgedBucket = { cents: number; count: number };
export type AgedReceivables = {
  current: AgedBucket;
  d1to30: AgedBucket;
  d31to60: AgedBucket;
  d61plus: AgedBucket;
};

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <GlassPanel className="!p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className="mt-1 tabular-nums tracking-tight text-ink"
        style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.9rem" }}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </GlassPanel>
  );
}

export function XeroReports({
  snapshot,
  gstMonthCents,
  gstQuarterCents,
  aged,
}: {
  snapshot: AccountingSnapshot;
  gstMonthCents: number;
  gstQuarterCents: number;
  aged: AgedReceivables;
}) {
  const t = useTranslations("admin.accounting");
  const tShared = useTranslations("admin.shared");
  const tReports = useTranslations("admin.money.reports");
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const summary = snapshot.summary;

  const chartData = useMemo(
    () =>
      (summary?.monthlySeries ?? []).map((row) => ({
        month: formatMonthKey(row.month),
        income: row.incomeCents / 100,
        expenses: row.expenseCents / 100,
      })),
    [summary?.monthlySeries],
  );

  const onRefresh = () => {
    setActionError(null);
    startRefresh(async () => {
      const res = await refreshAccountingData();
      if (!res.ok) setActionError(res.error);
      else router.refresh();
    });
  };

  const displayError = actionError ?? snapshot.fetchError ?? null;

  const agedRows: { key: string; label: string; bucket: AgedBucket }[] = [
    { key: "current", label: tReports("aged.current"), bucket: aged.current },
    { key: "d1to30", label: tReports("aged.d1to30"), bucket: aged.d1to30 },
    { key: "d31to60", label: tReports("aged.d31to60"), bucket: aged.d31to60 },
    { key: "d61plus", label: tReports("aged.d61plus"), bucket: aged.d61plus },
  ];
  const agedTotalCents = agedRows.reduce((s, r) => s + r.bucket.cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-ink">{tReports("title")}</h2>
          <p className="text-xs text-muted">{tReports("subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="rounded-xl border border-(--hair) bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-base disabled:opacity-50"
        >
          {refreshing ? tShared("refreshing") : t("refresh")}
        </button>
      </div>

      {displayError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {displayError}
        </div>
      )}

      {summary && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("stats.incomeMtd")} value={NZD.format(summary.incomeMtdCents / 100)} />
            <StatCard label={t("stats.expensesMtd")} value={NZD.format(summary.expenseMtdCents / 100)} />
            <StatCard label={t("stats.netMtd")} value={NZD.format(summary.netMtdCents / 100)} />
            <StatCard label={t("stats.netYtd")} value={NZD.format(summary.netYtdCents / 100)} />
          </div>

          <GlassPanel className="!p-6">
            <h3 className="mb-5 text-sm font-bold text-ink">{t("chart.title")}</h3>
            {chartData.length === 0 ? (
              <p className="text-sm text-muted">{t("chart.noData")}</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
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
                    formatter={(value: unknown, name: unknown) => [
                      NZD2.format(Number(value)),
                      name === "income" ? tShared("income") : tShared("expenses"),
                    ]}
                    contentStyle={{ background: "var(--base)", border: "1px solid var(--hair)", borderRadius: 12, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name={tShared("income")} fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="expenses" name={tShared("expenses")} fill="#64748b" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </GlassPanel>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard label={tReports("gst.month")} value={formatMoney(gstMonthCents)} sub={tReports("gst.sub")} />
        <StatCard label={tReports("gst.quarter")} value={formatMoney(gstQuarterCents)} sub={tReports("gst.sub")} />
      </div>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="border-b border-(--hair) px-6 py-4">
          <h3 className="text-sm font-bold text-ink">{tReports("aged.title")}</h3>
          <p className="text-xs text-muted">{tReports("aged.subtitle", { total: formatMoney(agedTotalCents) })}</p>
        </div>
        <div className="grid gap-px bg-(--hair) sm:grid-cols-4">
          {agedRows.map((r) => (
            <div key={r.key} className="bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{r.label}</p>
              <p
                className="mt-1 tabular-nums text-ink"
                style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.5rem" }}
              >
                {formatMoney(r.bucket.cents)}
              </p>
              <p className="mt-0.5 text-xs text-muted">{tReports("aged.count", { count: r.bucket.count })}</p>
            </div>
          ))}
        </div>
      </GlassPanel>
    </div>
  );
}
