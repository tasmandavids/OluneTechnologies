"use client";

// ============================================================================
//  AdminDashboard — the "Today" screen. Receives already-fetched data as
//  props (page.tsx does the Supabase queries server-side), so this stays a
//  pure, testable presentation layer. Restructured per the Olune redesign
//  strategy doc into a 3-column attention/schedule/money layout. The full
//  drag-and-drop weekly schedule editor lives on the Classes page now, not
//  here — Today only shows a compact read-only glance.
// ============================================================================

import { motion } from "framer-motion";
import { AttentionQueue } from "./AttentionQueue";
import { QuickActions } from "./QuickActions";
import { StaffToday } from "./StaffToday";
import { TodayTimeline } from "./TodayTimeline";
import { MoneyPanel, type ActivityItem } from "./MoneyPanel";
import type { StatData, ScheduleClass, AttentionData } from "./types";
import type { TeacherOption } from "@/app/portal/admin/classes/page";

export function AdminDashboard({
  stats: statsData,
  scheduleClasses,
  teachers,
  todayDow,
  attention,
  lastMonthRevenueCents,
  activity,
}: {
  stats: StatData[];
  scheduleClasses: ScheduleClass[];
  teachers: TeacherOption[];
  todayDow: number;
  attention: AttentionData;
  lastMonthRevenueCents: number;
  activity: ActivityItem[];
}) {
  const activeStudents = statsData.find((s) => s.id === "students")?.value ?? 0;
  const revenueCents = Math.round((statsData.find((s) => s.id === "revenue")?.value ?? 0) * 100);
  const classesTodayCount = statsData.find((s) => s.id === "today")?.value ?? 0;

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
      className="mx-auto max-w-6xl space-y-6 px-7 py-6"
    >
      <motion.div
        variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
        className="grid gap-5 lg:grid-cols-[320px_1fr_320px]"
      >
        <div className="flex flex-col gap-[18px]">
          <AttentionQueue attention={attention} />
          <QuickActions />
          <StaffToday scheduleClasses={scheduleClasses} teachers={teachers} todayDow={todayDow} />
        </div>

        <TodayTimeline scheduleClasses={scheduleClasses} todayDow={todayDow} />

        <MoneyPanel
          revenueCents={revenueCents}
          lastMonthRevenueCents={lastMonthRevenueCents}
          activeStudents={activeStudents}
          classesToday={classesTodayCount}
          activity={activity}
        />
      </motion.div>
    </motion.div>
  );
}
