"use client";

// ============================================================================
//  MoneyPanel — right column of the redesigned Today screen. Big Fraunces
//  revenue figure with a real month-over-month trend, two real stat tiles
//  (active students, classes today — reusing already-fetched stats, not
//  invented percentages), and a real recent-activity feed built from paid
//  invoices + new leads. No fabricated data (no attendance %, no renewals).
// ============================================================================

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { IconTrendingUp, IconCreditCard, IconUserPlus } from "./icons";

export interface ActivityItem {
  id: string;
  kind: "payment" | "lead";
  name: string;
  invoiceNumber?: number | null;
  createdAt: string;
}

function timeAgo(
  iso: string,
  t: (key: string, values?: Record<string, string | number | Date>) => string,
): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return t("justNow");
  if (mins < 60) return t("timeAgoMinutes", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("timeAgoHours", { count: hours });
  return t("timeAgoDays", { count: Math.floor(hours / 24) });
}

export function MoneyPanel({
  revenueCents,
  lastMonthRevenueCents,
  activeStudents,
  classesToday,
  activity,
}: {
  revenueCents: number;
  lastMonthRevenueCents: number;
  activeStudents: number;
  classesToday: number;
  activity: ActivityItem[];
}) {
  const t = useTranslations("admin.dashboard.money");
  const tShared = useTranslations("admin.shared");
  const locale = useLocale();

  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "NZD", maximumFractionDigits: 0 }),
    [locale],
  );

  const trendPercent =
    lastMonthRevenueCents > 0 ? Math.round(((revenueCents - lastMonthRevenueCents) / lastMonthRevenueCents) * 100) : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[--hair] bg-surface p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{t("collected")}</p>
        <p className="mt-1 font-display text-[34px] font-medium leading-none tracking-tight text-ink tabular-nums">
          {currency.format(revenueCents / 100)}
        </p>
        {lastMonthRevenueCents > 0 && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <IconTrendingUp
              className="h-3.5 w-3.5"
              style={{ color: trendPercent >= 0 ? "#16a34a" : "#dc2626", transform: trendPercent < 0 ? "scaleY(-1)" : undefined }}
            />
            {trendPercent > 0
              ? t("trendUp", { percent: trendPercent })
              : trendPercent < 0
                ? t("trendDown", { percent: trendPercent })
                : t("trendFlat")}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[--hair] bg-surface p-4 text-center">
          <p className="font-display text-2xl font-medium text-ink tabular-nums">{activeStudents}</p>
          <p className="mt-0.5 text-[11px] text-muted">{t("activeStudents")}</p>
        </div>
        <div className="rounded-2xl border border-[--hair] bg-surface p-4 text-center">
          <p className="font-display text-2xl font-medium text-ink tabular-nums">{classesToday}</p>
          <p className="mt-0.5 text-[11px] text-muted">{t("classesToday")}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-[--hair] bg-surface p-4">
        <p className="mb-2.5 text-xs font-semibold uppercase tracking-widest text-muted">{t("activityTitle")}</p>
        {activity.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted">{t("activityEmpty")}</p>
        ) : (
          <div className="flex flex-col">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-2.5 border-b border-[--hair] py-2.5 text-xs last:border-b-0"
              >
                {item.kind === "payment" ? (
                  <IconCreditCard className="h-3.5 w-3.5 shrink-0 text-muted" />
                ) : (
                  <IconUserPlus className="h-3.5 w-3.5 shrink-0 text-muted" />
                )}
                <span className="min-w-0 flex-1 truncate text-muted">
                  {item.kind === "payment"
                    ? t("activityPaid", { name: item.name, number: item.invoiceNumber ?? "" })
                    : t("activityLead", { name: item.name })}
                </span>
                <span className="shrink-0 text-muted">{timeAgo(item.createdAt, tShared)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
