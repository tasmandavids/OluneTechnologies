"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/currency";
import { formatMonthKey } from "@/lib/xero/format";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const NZD2 = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

type Range = "7d" | "30d" | "12m";

function StatCard({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-[16px] border border-[--hair] bg-surface p-4">
      <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="mt-1 font-display text-[26px] font-medium tabular-nums tracking-tight" style={{ color: warn ? "#b91c1c" : "var(--text)" }}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function OverviewDashboard({
  outstandingCents,
  unpaidCount,
  overdueCount,
  overdueCents,
  overdueTop,
  draftCount,
  totalPaidCents,
  gstThisMonthCents,
  mrrCents,
  activeSubs,
  revenue,
  dailyRevenue,
  stripeConnected,
  balanceAvailableCents,
  balancePendingCents,
  payouts,
  sources,
}: {
  outstandingCents: number;
  unpaidCount: number;
  overdueCount: number;
  overdueCents: number;
  overdueTop: { id: string; name: string | null; amountCents: number; days: number }[];
  draftCount: number;
  totalPaidCents: number;
  gstThisMonthCents: number;
  mrrCents: number;
  activeSubs: number;
  revenue: { month: string; revenueCents: number }[];
  dailyRevenue: { date: string; revenueCents: number }[];
  stripeConnected: boolean;
  balanceAvailableCents: number | null;
  balancePendingCents: number | null;
  payouts: { amountCents: number; createdAt: string }[];
  sources: { classesCents: number; shopCents: number };
}) {
  const t = useTranslations("admin.money.overview");
  const tShared = useTranslations("admin.shared");
  const locale = useLocale();
  const [range, setRange] = useState<Range>("30d");

  const chartData = useMemo(() => {
    if (range === "12m") {
      const payoutByMonth = new Map<string, number>();
      for (const p of payouts) {
        const key = p.createdAt.slice(0, 7);
        payoutByMonth.set(key, (payoutByMonth.get(key) ?? 0) + p.amountCents);
      }
      return revenue.map((r) => ({
        label: formatMonthKey(r.month),
        in: r.revenueCents / 100,
        out: (payoutByMonth.get(r.month) ?? 0) / 100,
      }));
    }
    const days = range === "7d" ? dailyRevenue.slice(-7) : dailyRevenue;
    const payoutByDay = new Map<string, number>();
    for (const p of payouts) {
      const key = p.createdAt.slice(0, 10);
      payoutByDay.set(key, (payoutByDay.get(key) ?? 0) + p.amountCents);
    }
    return days.map((d) => ({
      label: new Date(d.date).toLocaleDateString(locale, { day: "numeric", month: "short" }),
      in: d.revenueCents / 100,
      out: (payoutByDay.get(d.date) ?? 0) / 100,
    }));
  }, [range, revenue, dailyRevenue, payouts, locale]);

  const hasChartData = chartData.some((d) => d.in > 0 || d.out > 0);

  const attention: { key: string; title: string; detail: string; href: string; warn: boolean }[] = [];
  if (draftCount > 0) {
    attention.push({
      key: "drafts",
      title: t("attention.draftsTitle", { count: draftCount }),
      detail: t("attention.draftsDetail"),
      href: "/portal/admin/money?tab=invoices",
      warn: false,
    });
  }
  if (gstThisMonthCents > 0) {
    attention.push({
      key: "gst",
      title: t("attention.gstTitle", { amount: formatMoney(gstThisMonthCents) }),
      detail: t("attention.gstDetail"),
      href: "/portal/admin/money?tab=reports",
      warn: false,
    });
  }

  const sourcesTotal = sources.classesCents + sources.shopCents;

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto max-w-6xl space-y-4 p-6"
    >
      <motion.header variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}>
        <h1 className="font-display text-[28px] font-medium tracking-tight text-ink md:text-[34px]">{t("liveTitle")}</h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </motion.header>

      <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <GlassPanel className="!p-[22px]">
          <div className="flex flex-wrap items-start gap-4">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-muted">{t("balance.available")}</p>
              {stripeConnected ? (
                <>
                  <p className="my-1.5 font-display text-[42px] font-medium leading-[1.02] tabular-nums text-ink">
                    {formatMoney(balanceAvailableCents ?? 0)}
                  </p>
                  {balancePendingCents !== null && balancePendingCents > 0 && (
                    <p className="text-[12px] text-muted">{t("balance.pending", { amount: formatMoney(balancePendingCents) })}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="my-1.5 font-display text-[24px] font-medium text-ink">{t("balance.notConnectedTitle")}</p>
                  <Link href="/portal/admin/money?tab=payouts" className="text-[12.5px] font-semibold text-ink underline">
                    {t("balance.connectCta")}
                  </Link>
                </>
              )}
            </div>
            <div className="flex-1" />
            <div className="flex gap-1 rounded-[11px] p-1" style={{ background: "var(--glass2)", border: "1px solid var(--hair)" }}>
              {(["7d", "30d", "12m"] as Range[]).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className="rounded-[8px] px-2.5 py-1.5 text-[11px] font-semibold transition-all"
                  style={{ color: range === r ? "var(--ink, var(--text))" : "var(--muted)", background: range === r ? "var(--t3)" : "transparent" }}
                >
                  {t(`balance.range.${r}`)}
                </button>
              ))}
            </div>
          </div>

          {!hasChartData ? (
            <p className="mt-6 text-sm text-muted">{t("chart.noData")}</p>
          ) : (
            <ResponsiveContainer width="100%" height={200} className="mt-4">
              <AreaChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="moneyRevenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--hair)" />
                <XAxis dataKey="label" tick={{ fontSize: 10.5, fill: "var(--muted)" }} axisLine={false} tickLine={false} minTickGap={24} />
                <YAxis
                  tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                  tick={{ fontSize: 10.5, fill: "var(--muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={44}
                />
                <Tooltip
                  formatter={(value: unknown, key: unknown) => [NZD2.format(Number(value)), key === "in" ? t("chart.moneyIn") : t("chart.moneyOut")]}
                  contentStyle={{ background: "var(--surface)", border: "1px solid var(--hair)", borderRadius: 12, fontSize: 12 }}
                />
                <Area type="monotone" dataKey="in" stroke="var(--brand-deep)" strokeWidth={2.2} fill="url(#moneyRevenueFill)" />
                <Line type="monotone" dataKey="out" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2.5 flex gap-5 text-[11.5px] text-muted">
            <span className="inline-flex items-center gap-[7px]">
              <span className="h-[2.5px] w-3.5 rounded-full" style={{ background: "var(--brand-deep)" }} />
              {t("chart.moneyIn")}
            </span>
            <span className="inline-flex items-center gap-[7px]">
              <span className="h-0 w-3.5 border-t-2 border-dashed" style={{ borderColor: "var(--muted)" }} />
              {t("chart.moneyOut")}
            </span>
          </div>
        </GlassPanel>

        <div className="flex flex-col gap-4">
          <GlassPanel>
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("overdueQueue.title")}</h2>
            {overdueTop.length === 0 ? (
              <p className="text-[12.5px] text-muted">{t("overdueQueue.empty")}</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {overdueTop.map((row) => (
                  <div key={row.id} className="flex items-center gap-2.5 rounded-[10px] px-2 py-1.5" style={{ background: "var(--surface)" }}>
                    <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: row.days > 14 ? "#dc2626" : "#d97706" }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{row.name ?? tShared("unknown")}</p>
                      <p className="text-[11px] text-muted">{t("overdueQueue.daysOverdue", { days: row.days })}</p>
                    </div>
                    <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: "#dc2626" }}>
                      {formatMoney(row.amountCents)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {overdueCount > overdueTop.length && (
              <Link href="/portal/admin/money?tab=collections" className="mt-2.5 block text-[11.5px] font-semibold text-ink hover:underline">
                {t("overdueQueue.seeAll", { count: overdueCount })} →
              </Link>
            )}
          </GlassPanel>

          <GlassPanel>
            <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("sources.title")}</h2>
            {sourcesTotal === 0 ? (
              <p className="text-[12.5px] text-muted">{t("sources.empty")}</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {[
                  { key: "classes", cents: sources.classesCents, color: "var(--brand-deep)" },
                  { key: "shop", cents: sources.shopCents, color: "var(--muted)" },
                ].map((s) => (
                  <div key={s.key}>
                    <div className="mb-1 flex items-center justify-between text-[12px]">
                      <span className="text-ink">{t(`sources.${s.key}`)}</span>
                      <span className="font-semibold tabular-nums text-ink">{formatMoney(s.cents)}</span>
                    </div>
                    <div className="h-[5px] overflow-hidden rounded-full" style={{ background: "var(--hair)" }}>
                      <div className="h-full rounded-full" style={{ width: `${sourcesTotal > 0 ? (s.cents / sourcesTotal) * 100 : 0}%`, background: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassPanel>
        </div>
      </motion.div>

      {attention.length > 0 && (
        <motion.section variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }} className="rounded-2xl border border-[--hair] bg-surface">
          <div className="border-b border-[--hair] px-6 py-4">
            <h2 className="text-sm font-bold text-ink">{t("attention.title")}</h2>
          </div>
          <ul className="divide-y divide-[--hair]">
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_3%,transparent)]">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.warn ? "#dc2626" : "var(--brand)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-ink">{a.title}</p>
                    <p className="text-xs text-muted">{a.detail}</p>
                  </div>
                  <span className="text-muted">→</span>
                </Link>
              </li>
            ))}
          </ul>
        </motion.section>
      )}

      <motion.div variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("stats.outstanding")} value={formatMoney(outstandingCents)} sub={t("stats.outstandingSub", { count: unpaidCount })} />
        <StatCard label={t("stats.overdue")} value={formatMoney(overdueCents)} warn={overdueCount > 0} sub={t("stats.overdueSub", { count: overdueCount })} />
        <StatCard label={t("stats.collectedYtd")} value={formatMoney(totalPaidCents)} sub={t("stats.collectedSub")} />
        <StatCard label={t("stats.mrr")} value={formatMoney(mrrCents)} sub={t("stats.mrrSub", { count: activeSubs })} />
      </motion.div>
    </motion.div>
  );
}
