"use client";

// ============================================================================
//  MoneyPanel — right column of the redesigned Today screen. Big Fraunces
//  revenue figure with a real month-over-month trend, two stat rings (active
//  students, classes today — real numbers; the arc fill itself is decorative
//  chrome, same as the mockup's own hardcoded dasharray, not a claimed
//  percentage), and a real recent-activity feed from paid invoices + new
//  leads. No fabricated data (no attendance %, no renewals).
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

function Ring({ value, label, dashArray }: { value: number; label: string; dashArray: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] border border-[--hair] bg-surface p-3">
      <svg viewBox="0 0 44 44" className="h-11 w-11 shrink-0 -rotate-90">
        <circle cx="22" cy="22" r="18" fill="none" stroke="var(--hair)" strokeWidth="4" />
        <circle
          cx="22"
          cy="22"
          r="18"
          fill="none"
          stroke="var(--brand)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={dashArray}
        />
      </svg>
      <div className="min-w-0">
        <b className="block font-display text-[16px] font-medium text-ink tabular-nums">{value}</b>
        <span className="block text-[11px] leading-[1.35] text-muted">{label}</span>
      </div>
    </div>
  );
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
      <div className="rounded-[14px] border border-[--hair] bg-surface p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("collected")}</p>
        <p className="mt-1 font-display text-[34px] font-medium leading-none tracking-tight text-ink tabular-nums">
          {currency.format(revenueCents / 100)}
        </p>
        {lastMonthRevenueCents > 0 && (
          <p className="mt-0.5 flex items-center gap-[5px] text-xs text-muted">
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

      <div className="grid grid-cols-2 gap-2">
        <Ring value={activeStudents} label={t("activeStudents")} dashArray="88 113" />
        <Ring value={classesToday} label={t("classesToday")} dashArray="64 113" />
      </div>

      <div className="rounded-[14px] border border-[--hair] bg-surface p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{t("activityTitle")}</p>
        {activity.length === 0 ? (
          <p className="py-3 text-center text-xs text-muted">{t("activityEmpty")}</p>
        ) : (
          <div className="flex flex-col">
            {activity.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-[9px] border-b border-[--hair] py-[9px] text-[12.5px] last:border-b-0"
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
                <em className="shrink-0 text-[11px] not-italic text-muted">{timeAgo(item.createdAt, tShared)}</em>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
