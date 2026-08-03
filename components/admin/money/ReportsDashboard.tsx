"use client";

import { confirmDialog } from "@/lib/feedback";
import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
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
import type { AccountingSnapshot } from "@/lib/xero/accounting-data";
import { openInXeroUrl } from "@/lib/xero/links";
import { formatMonthKey, formatShortDate, formatSyncTime } from "@/lib/xero/format";
import { disconnectXero, refreshAccountingData } from "@/app/portal/admin/accounting/actions";
import { formatMoney } from "@/lib/currency";

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
    <div className="rounded-2xl border border-[--hair] bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className="mt-1 tabular-nums tracking-tight text-ink"
        style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.9rem" }}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

function ComingSoonCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[--hair] bg-base/50 p-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{title}</p>
      <p className="mt-2 text-sm text-muted">{body}</p>
    </div>
  );
}

export function ReportsDashboard({
  snapshot,
  redirectUri,
  bannerError,
  bannerConnected,
  gstMonthCents,
  gstQuarterCents,
  aged,
}: {
  snapshot: AccountingSnapshot;
  redirectUri: string;
  bannerError: string | null;
  bannerConnected: boolean;
  gstMonthCents: number;
  gstQuarterCents: number;
  aged: AgedReceivables;
}) {
  const t = useTranslations("admin.accounting");
  const tShared = useTranslations("admin.shared");
  const tReports = useTranslations("admin.money.reports");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const summary = snapshot.summary;
  const orgShortCode = snapshot.connection?.org_short_code ?? null;

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

  const onDisconnect = async () => {
    setActionError(null);
    if (!(await confirmDialog({ title: t("disconnectConfirm"), destructive: true }))) return;
    startTransition(async () => {
      const res = await disconnectXero();
      if (!res.ok) setActionError(res.error);
    });
  };

  const displayError =
    bannerError ?? actionError ?? snapshot.fetchError ?? snapshot.connection?.sync_error ?? null;

  const agedRows: { key: string; label: string; bucket: AgedBucket }[] = [
    { key: "current", label: tReports("aged.current"), bucket: aged.current },
    { key: "d1to30", label: tReports("aged.d1to30"), bucket: aged.d1to30 },
    { key: "d31to60", label: tReports("aged.d31to60"), bucket: aged.d31to60 },
    { key: "d61plus", label: tReports("aged.d61plus"), bucket: aged.d61plus },
  ];
  const agedTotalCents = agedRows.reduce((s, r) => s + r.bucket.cents, 0);

  return (
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
          <h1
            className="text-2xl font-black tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            {tReports("title")}
          </h1>
          <p className="mt-1 text-sm text-muted">{tReports("subtitle")}</p>
        </div>
        {snapshot.connected && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing || pending}
              className="rounded-xl border border-[--hair] bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:bg-base disabled:opacity-50"
            >
              {refreshing ? tShared("refreshing") : t("refresh")}
            </button>
            <a
              href={openInXeroUrl(orgShortCode, "dashboard")}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-[#13B5EA] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-105"
            >
              <XeroMark />
              {t("openInXero")}
            </a>
          </div>
        )}
      </motion.header>

      {(displayError || bannerConnected) && (
        <motion.div variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0 } }}>
          {bannerConnected && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {t("connectedSuccess")}
            </div>
          )}
          {displayError && (
            <div className={`rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 ${bannerConnected ? "mt-2" : ""}`}>
              {displayError}
            </div>
          )}
        </motion.div>
      )}

      <motion.div
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="rounded-2xl border border-[--hair] bg-surface p-5"
      >
        {!snapshot.configured ? (
          <p className="text-sm text-muted">{t("notConfigured")}</p>
        ) : snapshot.connected ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-ink">{snapshot.connection?.tenant_name}</p>
              <p className="text-xs text-muted">
                {t("lastSynced", {
                  time: snapshot.connection?.last_sync_at
                    ? formatSyncTime(snapshot.connection.last_sync_at)
                    : t("lastSyncedJustNow"),
                })}
              </p>
            </div>
            <button
              type="button"
              onClick={onDisconnect}
              disabled={pending || refreshing}
              className="rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-semibold text-muted hover:text-ink disabled:opacity-50"
            >
              {pending ? tShared("disconnecting") : t("disconnect")}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-muted">{t("connectDescription")}</p>
            <Link
              href="/api/xero/oauth/connect"
              className="inline-flex items-center gap-2 rounded-xl bg-[#13B5EA] px-4 py-2.5 text-sm font-bold text-white"
            >
              <XeroMark />
              {t("connectXero")}
            </Link>
          </div>
        )}
      </motion.div>

      {snapshot.connected && summary && (
        <>
          <motion.div
            variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <StatCard label={t("stats.incomeMtd")} value={NZD.format(summary.incomeMtdCents / 100)} />
            <StatCard label={t("stats.expensesMtd")} value={NZD.format(summary.expenseMtdCents / 100)} />
            <StatCard label={t("stats.netMtd")} value={NZD.format(summary.netMtdCents / 100)} />
            <StatCard label={t("stats.netYtd")} value={NZD.format(summary.netYtdCents / 100)} />
          </motion.div>

          <motion.div
            variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
            className="rounded-2xl border border-[--hair] bg-surface p-6"
          >
            <h2 className="mb-5 text-sm font-bold text-ink">{t("chart.title")}</h2>
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
          </motion.div>
        </>
      )}

      <motion.div
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <StatCard
          label={tReports("gst.month")}
          value={formatMoney(gstMonthCents)}
          sub={tReports("gst.sub")}
        />
        <StatCard
          label={tReports("gst.quarter")}
          value={formatMoney(gstQuarterCents)}
          sub={tReports("gst.sub")}
        />
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
        className="overflow-hidden rounded-2xl border border-[--hair] bg-surface"
      >
        <div className="border-b border-[--hair] px-6 py-4">
          <h2 className="text-sm font-bold text-ink">{tReports("aged.title")}</h2>
          <p className="text-xs text-muted">
            {tReports("aged.subtitle", { total: formatMoney(agedTotalCents) })}
          </p>
        </div>
        <div className="grid gap-px bg-[--hair] sm:grid-cols-4">
          {agedRows.map((r) => (
            <div key={r.key} className="bg-surface p-5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">{r.label}</p>
              <p
                className="mt-1 tabular-nums text-ink"
                style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.5rem" }}
              >
                {formatMoney(r.bucket.cents)}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                {tReports("aged.count", { count: r.bucket.count })}
              </p>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="grid gap-4 sm:grid-cols-2"
      >
        <ComingSoonCard title={tReports("comingSoon.programme")} body={tReports("comingSoon.programmeBody")} />
        <ComingSoonCard title={tReports("comingSoon.export")} body={tReports("comingSoon.exportBody")} />
      </motion.div>
    </motion.div>
  );
}

function XeroMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="10" fill="white" fillOpacity="0.2" />
      <text x="12" y="16" textAnchor="middle" fontSize="11" fontWeight="700" fill="currentColor">
        X
      </text>
    </svg>
  );
}
