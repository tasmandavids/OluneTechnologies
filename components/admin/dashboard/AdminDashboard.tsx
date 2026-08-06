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
import { DashboardGrid } from "./DashboardGrid";
import type { WidgetId } from "./widget-registry";
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
  savedLayout,
}: {
  scheduleClasses: ScheduleClass[];
  teachers: TeacherOption[];
  todayDow: number;
  attention: AttentionData;
  pulse: PulseStat[];
  cashInTotalCents: number;
  cashInPaymentCount: number;
  cashInDays: CashInDay[];
  savedLayout: unknown;
}) {
  const t = useTranslations("admin.dashboard.header");
  const tLayout = useTranslations("admin.dashboard.layout");
  const tGreeting = useTranslations("common.greeting");
  const locale = useLocale();

  const widgets: Record<WidgetId, React.ReactNode> = {
    attention: (
      <GlassPanel className="h-full">
        <AttentionQueue attention={attention} />
      </GlassPanel>
    ),
    staff: (
      <GlassPanel className="h-full">
        <StaffToday scheduleClasses={scheduleClasses} teachers={teachers} todayDow={todayDow} />
      </GlassPanel>
    ),
    timeline: (
      <GlassPanel className="h-full">
        <TodayTimeline scheduleClasses={scheduleClasses} todayDow={todayDow} />
      </GlassPanel>
    ),
    cashin: <CashInCard totalCents={cashInTotalCents} paymentCount={cashInPaymentCount} days={cashInDays} />,
    quickactions: (
      <GlassPanel className="h-full">
        <QuickActions />
      </GlassPanel>
    ),
  };

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

      <motion.div variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}>
        <DashboardGrid
          savedLayout={savedLayout}
          widgets={widgets}
          labels={{ customize: tLayout("customize"), done: tLayout("done") }}
        />
      </motion.div>
    </motion.div>
  );
}
