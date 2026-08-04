"use client";

// ============================================================================
//  AdminDashboard — the "Today" screen, glass redesign. Receives already-
//  fetched data as props (page.tsx does the Supabase queries server-side).
//  Layout: header + pulse pills, then a 3-column grid — Needs-you/Staff-today
//  (left), Live-today schedule (centre), Cash-in/Quick-actions (right).
// ============================================================================

import { motion } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { PulseRow } from "./PulseRow";
import { CashInCard } from "./CashInCard";
import { AttentionQueue } from "./AttentionQueue";
import { QuickActions } from "./QuickActions";
import { StaffToday } from "./StaffToday";
import { TodayTimeline } from "./TodayTimeline";
import type { ScheduleClass, AttentionData, PulseStat, CashInDay } from "./types";
import type { TeacherOption } from "@/app/portal/admin/classes/page";

export function AdminDashboard({
  scheduleClasses,
  teachers,
  todayDow,
  attention,
  pulse,
  cashInTotalCents,
  cashInPaymentCount,
  cashInDays,
}: {
  scheduleClasses: ScheduleClass[];
  teachers: TeacherOption[];
  todayDow: number;
  attention: AttentionData;
  pulse: PulseStat[];
  cashInTotalCents: number;
  cashInPaymentCount: number;
  cashInDays: CashInDay[];
}) {
  const t = useTranslations("admin.dashboard.header");
  const tGreeting = useTranslations("common.greeting");
  const locale = useLocale();

  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? tGreeting("morning") : h < 18 ? tGreeting("afternoon") : tGreeting("evening");
  })();

  const openCount =
    Number(attention.overdueCount > 0) +
    Number(attention.leadsCount > 0) +
    Number(attention.unassignedCount > 0) +
    Number(attention.conflictCount > 0);

  const dateLabel = new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
      className="mx-auto max-w-[1180px] py-2"
    >
      <motion.div variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }} className="mb-[22px] mt-3.5 flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="mb-2.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-muted">{dateLabel}</div>
          <h1 className="font-display text-[36px] font-medium leading-[1.03] tracking-tight text-ink md:text-[42px]">{greeting}.</h1>
          <p className="mt-2 max-w-[46ch] text-[14.5px] leading-[1.5] text-muted">{t("subhead", { count: openCount })}</p>
        </div>
        <PulseRow pulse={pulse} />
      </motion.div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,320px)_1fr_minmax(0,320px)]"
      >
        <div className="flex flex-col gap-4">
          <GlassPanel>
            <AttentionQueue attention={attention} />
          </GlassPanel>
          <GlassPanel>
            <StaffToday scheduleClasses={scheduleClasses} teachers={teachers} todayDow={todayDow} />
          </GlassPanel>
        </div>

        <GlassPanel>
          <TodayTimeline scheduleClasses={scheduleClasses} todayDow={todayDow} />
        </GlassPanel>

        <div className="flex flex-col gap-4">
          <CashInCard totalCents={cashInTotalCents} paymentCount={cashInPaymentCount} days={cashInDays} />
          <GlassPanel>
            <QuickActions />
          </GlassPanel>
        </div>
      </motion.div>
    </motion.div>
  );
}
