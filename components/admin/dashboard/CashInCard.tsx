"use client";

// ============================================================================
//  CashInCard — "Cash in, 7 days": real succeeded-payments total + count from
//  the last 7 days, with a daily-bucketed sparkline. Dark/inverted glass
//  panel per the design (GlassPanel dark=true).
// ============================================================================

import { useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import type { CashInDay } from "./types";

function sparklinePoints(days: CashInDay[]): string {
  const max = Math.max(1, ...days.map((d) => d.amountCents));
  const stepX = 260 / Math.max(1, days.length - 1);
  return days
    .map((d, i) => {
      const x = Math.round(i * stepX);
      const y = Math.round(48 - (d.amountCents / max) * 40);
      return `${x},${y}`;
    })
    .join(" ");
}

export function CashInCard({
  totalCents,
  paymentCount,
  days,
}: {
  totalCents: number;
  paymentCount: number;
  days: CashInDay[];
}) {
  const t = useTranslations("admin.dashboard.cashIn");
  const locale = useLocale();
  const currency = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "NZD", maximumFractionDigits: 0 }),
    [locale],
  );
  const points = useMemo(() => sparklinePoints(days), [days]);
  const lastPoint = points.split(" ").at(-1)?.split(",").map(Number) ?? [260, 48];

  return (
    <GlassPanel dark>
      <div className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-60">{t("title")}</div>
      <div className="my-1.5 font-display text-[34px] font-medium leading-[1.05] tabular-nums">
        {currency.format(totalCents / 100)}
      </div>
      <div className="text-[11.5px] opacity-65">{t("fromPayments", { count: paymentCount })}</div>
      <svg viewBox="0 0 260 56" preserveAspectRatio="none" className="mt-3.5 block h-14 w-full">
        <polyline
          points={points}
          fill="none"
          stroke="var(--tg)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1400}
          style={{ strokeDasharray: 1400, animation: "admin-draw 1.4s cubic-bezier(.16,1,.3,1) forwards" }}
        />
        <circle cx={lastPoint[0]} cy={lastPoint[1]} r="3.4" fill="var(--tg)" className="animate-[admin-breathe_2.8s_ease-in-out_infinite]" />
      </svg>
    </GlassPanel>
  );
}
