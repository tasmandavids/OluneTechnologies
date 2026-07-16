"use client";

// ============================================================================
//  AdminDashboard — the "Today" screen. Receives already-fetched data as
//  props (page.tsx does the Supabase queries server-side), so this stays a
//  pure, testable presentation layer. Restructured per the Olune redesign
//  strategy doc into a 3-column attention/schedule/money layout; the full
//  drag-and-drop weekly ScheduleBoard is kept, just repositioned below.
// ============================================================================

import { motion } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { ScheduleBoard } from "./ScheduleBoard";
import { AttentionQueue } from "./AttentionQueue";
import { QuickActions } from "./QuickActions";
import { StaffToday } from "./StaffToday";
import { TodayTimeline } from "./TodayTimeline";
import { MoneyPanel, type ActivityItem } from "./MoneyPanel";
import type { StatData, ScheduleClass, AttentionData } from "./types";
import type { TeacherOption } from "@/app/portal/admin/classes/page";

const SCHEDULE_BOARD_ID = "full-schedule-board";

export function AdminDashboard({
  studioId,
  studioName,
  stats: statsData,
  scheduleClasses,
  teachers,
  todayDow,
  attention,
  lastMonthRevenueCents,
  activity,
}: {
  studioId: string;
  studioName: string;
  stats: StatData[];
  scheduleClasses: ScheduleClass[];
  teachers: TeacherOption[];
  todayDow: number;
  attention: AttentionData;
  lastMonthRevenueCents: number;
  activity: ActivityItem[];
}) {
  const tGreeting = useTranslations("common.greeting");
  const locale = useLocale();
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? tGreeting("morning") : h < 18 ? tGreeting("afternoon") : tGreeting("evening");
  })();

  const activeStudents = statsData.find((s) => s.id === "students")?.value ?? 0;
  const revenueCents = Math.round((statsData.find((s) => s.id === "revenue")?.value ?? 0) * 100);
  const classesTodayCount = statsData.find((s) => s.id === "today")?.value ?? 0;

  function scrollToFullSchedule() {
    document.getElementById(SCHEDULE_BOARD_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
      className="mx-auto max-w-6xl space-y-6 px-7 py-6"
    >
      <motion.header
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-sm text-muted">{greeting},</p>
          <h1 className="font-display text-[26px] font-medium leading-tight tracking-tight text-ink">
            {studioName}
          </h1>
        </div>
        <p className="text-[12.5px] text-muted">
          {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </motion.header>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
        className="grid gap-5 lg:grid-cols-[320px_1fr_320px]"
      >
        <div className="flex flex-col gap-[18px]">
          <AttentionQueue attention={attention} />
          <QuickActions />
          <StaffToday scheduleClasses={scheduleClasses} teachers={teachers} todayDow={todayDow} />
        </div>

        <TodayTimeline scheduleClasses={scheduleClasses} todayDow={todayDow} onFullTimetable={scrollToFullSchedule} />

        <MoneyPanel
          revenueCents={revenueCents}
          lastMonthRevenueCents={lastMonthRevenueCents}
          activeStudents={activeStudents}
          classesToday={classesTodayCount}
          activity={activity}
        />
      </motion.div>

      <motion.div id={SCHEDULE_BOARD_ID} variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}>
        <ScheduleBoard key={studioId} studioId={studioId} classes={scheduleClasses} teachers={teachers} />
      </motion.div>
    </motion.div>
  );
}
