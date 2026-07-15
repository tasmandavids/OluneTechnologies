"use client";

// ============================================================================
//  AdminDashboard — composes the overview. Receives already-fetched data as
//  props (page.tsx does the Supabase queries server-side), so this stays a
//  pure, testable presentation layer.
// ============================================================================

import { motion } from "framer-motion";
import { useTranslations, useLocale } from "next-intl";
import { StatCard } from "./StatCard";
import { ScheduleBoard } from "./ScheduleBoard";
import { AttentionQueue } from "./AttentionQueue";
import { QuickActions } from "./QuickActions";
import { StaffToday } from "./StaffToday";
import type { Stat, StatData, ScheduleClass, StatId, AttentionData } from "./types";
import type { TeacherOption } from "@/app/portal/admin/classes/page";

const STAT_LABEL_KEYS: Record<StatId, string> = {
  students: "activeStudents",
  revenue: "revenueThisMonth",
  today: "classesToday",
};

const STAT_HINT_KEYS: Record<StatId, string> = {
  students: "activeStudentsHint",
  revenue: "revenueHint",
  today: "classesTodayHint",
};

function toStats(data: StatData[], t: (key: string) => string): Stat[] {
  return data.map((s) => ({
    ...s,
    label: t(STAT_LABEL_KEYS[s.id]),
    hint: t(STAT_HINT_KEYS[s.id]),
  }));
}

export function AdminDashboard({
  studioId,
  studioName,
  stats: statsData,
  scheduleClasses,
  teachers,
  todayDow,
  attention,
}: {
  studioId: string;
  studioName: string;
  stats: StatData[];
  scheduleClasses: ScheduleClass[];
  teachers: TeacherOption[];
  todayDow: number;
  attention: AttentionData;
}) {
  const tGreeting = useTranslations("common.greeting");
  const tStats = useTranslations("admin.dashboard.stats");
  const locale = useLocale();
  const stats = toStats(statsData, tStats);
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? tGreeting("morning") : h < 18 ? tGreeting("afternoon") : tGreeting("evening");
  })();

  return (
    <motion.div
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
      className="mx-auto max-w-6xl space-y-8 p-6"
    >
      <motion.header
        variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0 } }}
        className="flex flex-wrap items-end justify-between gap-3"
      >
        <div>
          <p className="text-sm text-muted">{greeting},</p>
          <h1 className="text-2xl font-black tracking-tight text-ink">{studioName}</h1>
        </div>
        <p className="text-sm text-muted">
          {new Date().toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" })}
        </p>
      </motion.header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s, i) => <StatCard key={s.id} stat={s} index={i} />)}
      </div>

      <motion.div
        variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}
        className="grid gap-4 lg:grid-cols-3"
      >
        <AttentionQueue attention={attention} />
        <QuickActions />
        <StaffToday scheduleClasses={scheduleClasses} teachers={teachers} todayDow={todayDow} />
      </motion.div>

      <motion.div variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0 } }}>
        <ScheduleBoard
          key={studioId}
          studioId={studioId}
          classes={scheduleClasses}
          teachers={teachers}
        />
      </motion.div>
    </motion.div>
  );
}
