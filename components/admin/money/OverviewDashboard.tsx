"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/currency";
import { formatMonthKey } from "@/lib/xero/format";

const NZD2 = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[--hair] bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className="mt-1 tabular-nums tracking-tight"
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 900,
          fontSize: "1.9rem",
          color: warn ? "#b91c1c" : "var(--text)",
        }}
      >
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
  draftCount,
  totalPaidCents,
  gstThisMonthCents,
  mrrCents,
  activeSubs,
  revenue,
}: {
  outstandingCents: number;
  unpaidCount: number;
  overdueCount: number;
  overdueCents: number;
  draftCount: number;
  totalPaidCents: number;
  gstThisMonthCents: number;
  mrrCents: number;
  activeSubs: number;
  revenue: { month: string; revenueCents: number }[];
}) {
  const t = useTranslations("admin.money.overview");

  const chartData = revenue.map((r) => ({
    month: formatMonthKey(r.month),
    revenue: r.revenueCents / 100,
  }));
  const hasRevenue = chartData.some((d) => d.revenue > 0);

  const attention: { key: string; title: string; detail: string; href: string; warn: boolean }[] = [];
  if (overdueCount > 0) {
    attention.push({
      key: "overdue",
      title: t("attention.overdueTitle", { count: overdueCount }),
      detail: t("attention.overdueDetail", { amount: formatMoney(overdueCents) }),
      href: "/portal/admin/money?tab=invoices",
      warn: true,
    });
  }
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

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
      className="mx-auto max-w-6xl space-y-8 p-6"
    >
      <motion.header variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}>
        <h1
          className="text-2xl font-black tracking-tight text-ink"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {t("title")}
        </h1>
        <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
      </motion.header>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <StatCard
          label={t("stats.outstanding")}
          value={formatMoney(outstandingCents)}
          sub={t("stats.outstandingSub", { count: unpaidCount })}
        />
        <StatCard
          label={t("stats.overdue")}
          value={formatMoney(overdueCents)}
          warn={overdueCount > 0}
          sub={t("stats.overdueSub", { count: overdueCount })}
        />
        <StatCard
          label={t("stats.collectedYtd")}
          value={formatMoney(totalPaidCents)}
          sub={t("stats.collectedSub")}
        />
        <StatCard
          label={t("stats.mrr")}
          value={formatMoney(mrrCents)}
          sub={t("stats.mrrSub", { count: activeSubs })}
        />
      </motion.div>

      {attention.length > 0 && (
        <motion.section
          variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
          className="rounded-2xl border border-[--hair] bg-surface"
        >
          <div className="border-b border-[--hair] px-6 py-4">
            <h2 className="text-sm font-bold text-ink">{t("attention.title")}</h2>
          </div>
          <ul className="divide-y divide-[--hair]">
            {attention.map((a) => (
              <li key={a.key}>
                <Link
                  href={a.href}
                  className="flex items-center gap-3 px-6 py-4 transition-colors hover:bg-[color-mix(in_srgb,var(--brand)_3%,transparent)]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: a.warn ? "#dc2626" : "var(--brand)" }}
                  />
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

      <motion.div
        variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
        className="rounded-2xl border border-[--hair] bg-surface p-6"
      >
        <h2 className="mb-5 text-sm font-bold text-ink">{t("chart.title")}</h2>
        {!hasRevenue ? (
          <p className="text-sm text-muted">{t("chart.noData")}</p>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="moneyRevenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--hair)" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v: number) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                axisLine={false}
                tickLine={false}
                width={48}
              />
              <Tooltip
                formatter={(value: unknown) => [NZD2.format(Number(value)), t("chart.revenue")]}
                contentStyle={{
                  background: "var(--base)",
                  border: "1px solid var(--hair)",
                  borderRadius: 12,
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--brand-deep)"
                strokeWidth={2.2}
                fill="url(#moneyRevenueFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
        <p className="mt-4 text-xs text-muted">{t("chart.footnote")}</p>
      </motion.div>
    </motion.div>
  );
}
