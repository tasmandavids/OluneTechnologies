// ============================================================================
//  /portal/admin  —  server component.
//  Fetches live stats + weekly schedule (capacity + timetable) for this studio.
// ============================================================================

import { getPortalSession } from "@/lib/portal/session";
import {
  type ScheduleClass,
  type AttentionData,
  type PulseStat,
  type CashInDay,
} from "@/components/admin/dashboard/types";
import type { TeacherOption } from "@/app/portal/admin/classes/page";
import { AdminDashboard } from "@/components/admin/dashboard/AdminDashboard";
import { listWhosIn } from "@/lib/checkin/roster";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await getPortalSession();
  if (!session) throw new Error("Not signed in");

  const { supabase, studioId } = session;

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const todayDow = new Date().getDay();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    studentsRes,
    totalsRes,
    capacityRes,
    teachersRes,
    dashboardLayoutRes,
    buildingRoster,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student")
        .eq("studio_id", studioId),

      supabase.rpc("portal_dashboard_totals", {
        p_studio_id: studioId, p_month_start: startOfMonth, p_cash_start: sevenDaysAgo,
      }),

      supabase
        .from("class_capacity")
        .select(
          "id, name, discipline, level, room, day_of_week, start_time, end_time, enrolled, capacity, teacher_id, price_cents, recurring_group_id",
        )
        .eq("studio_id", studioId)
        .order("name"),

      supabase
        .from("profiles")
        .select("id, full_name, email")
        .eq("studio_id", studioId)
        .eq("role", "teacher")
        .order("full_name"),

      supabase
        .from("dashboard_layouts")
        .select("layout")
        .eq("studio_id", studioId)
        .maybeSingle(),

      listWhosIn(supabase, studioId),
    ]);

  // A failed money query must never be presented as a zero balance.
  if (totalsRes.error || !totalsRes.data || studentsRes.error || capacityRes.error || teachersRes.error || dashboardLayoutRes.error) {
    throw new Error("Unable to load dashboard");
  }
  const totals = totalsRes.data as {
    paidCents: number;
    overdue: { count: number; amountCents: number; families: number; oldestDueDate: string | null };
    leads: { count: number; oldestCreatedAt: string | null };
    cash: { count: number; amountCents: number };
    days: CashInDay[];
  };
  const classRows = capacityRes.data ?? [];
  const teacherMap = new Map((teachersRes.data ?? []).map(t => [t.id, t.full_name]));

  const missingTeacherIds = [...new Set(classRows.map(c => c.teacher_id).filter((id): id is string => !!id && !teacherMap.has(id)))];
  if (missingTeacherIds.length) {
    const { data, error } = await supabase.from("profiles").select("id, full_name").in("id", missingTeacherIds);
    if (error) throw new Error("Unable to load assigned teachers");
    for (const teacher of data ?? []) teacherMap.set(teacher.id, teacher.full_name);
  }

  const scheduleClasses: ScheduleClass[] = classRows.map((r) => {
    let durationMin = 60;
    const startRaw = r.start_time as string | null;
    const endRaw = r.end_time as string | null;
    if (startRaw && endRaw) {
      const [sh, sm] = startRaw.split(":").map(Number);
      const [eh, em] = endRaw.split(":").map(Number);
      durationMin = (eh * 60 + em) - (sh * 60 + sm);
    }
    const startTime = startRaw ? startRaw.slice(0, 5) : null;
    const endTime = endRaw ? endRaw.slice(0, 5) : null;
    const teacherId = r.teacher_id as string | null;

    return {
      id: r.id as string,
      name: r.name as string,
      discipline: (r.discipline as string | null) ?? "",
      level: (r.level as string | null) ?? "",
      room: (r.room as string | null) ?? null,
      durationMin,
      dayOfWeek: (r.day_of_week as number | null) ?? null,
      startTime,
      endTime,
      enrolled: Number(r.enrolled ?? 0),
      capacity: Number(r.capacity ?? 0),
      priceCents: r.price_cents ?? 0,
      teacherId,
      teacherName: teacherId ? (teacherMap.get(teacherId) ?? null) : null,
      recurringGroupId: r.recurring_group_id ?? null,
    };
  });

  const teachers: TeacherOption[] = (teachersRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.full_name,
    email: t.email,
  }));

  // Two cheap, real "needs you" checks derived from this week's schedule —
  // no new query, just a pass over scheduleClasses already fetched above.
  const unassigned = scheduleClasses
    .filter((c) => !c.teacherId && c.dayOfWeek !== null)
    .sort((a, b) => (a.dayOfWeek! - b.dayOfWeek!) || (a.startTime ?? "").localeCompare(b.startTime ?? ""));
  const unassignedNext = unassigned[0];
  const unassignedNextLabel = unassignedNext
    ? `${unassignedNext.name} · ${DOW_LABELS[unassignedNext.dayOfWeek!]}${unassignedNext.startTime ? " " + unassignedNext.startTime : ""}`
    : null;

  const byRoomDay = new Map<string, ScheduleClass[]>();
  for (const c of scheduleClasses) {
    if (!c.room || c.dayOfWeek === null || !c.startTime) continue;
    const key = `${c.dayOfWeek}:${c.room}`;
    (byRoomDay.get(key) ?? byRoomDay.set(key, []).get(key)!).push(c);
  }
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  let conflictCount = 0;
  let conflictLabel: string | null = null;
  for (const [key, group] of byRoomDay) {
    const sorted = [...group].sort((a, b) => toMinutes(a.startTime!) - toMinutes(b.startTime!));
    for (let i = 0; i < sorted.length - 1; i++) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const aEnd = toMinutes(a.startTime!) + a.durationMin;
      if (toMinutes(b.startTime!) < aEnd) {
        conflictCount++;
        if (!conflictLabel) {
          const [dow, room] = key.split(":");
          conflictLabel = `${room} · ${DOW_LABELS[Number(dow)]} — ${a.name} vs ${b.name}`;
        }
      }
    }
  }

  const totalEnrolled = scheduleClasses.reduce((s, c) => s + c.enrolled, 0);
  const totalCapacity = scheduleClasses.reduce((s, c) => s + c.capacity, 0);
  const occupancyPercent = totalCapacity > 0 ? Math.round((totalEnrolled / totalCapacity) * 100) : 0;

  const ageDays = (date: string | null) => date
    ? Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 86_400_000)) : 0;
  const attention: AttentionData = {
    overdueCount: totals.overdue.count,
    overdueAmountCents: totals.overdue.amountCents,
    overdueFamilies: totals.overdue.families,
    overdueOldestDays: ageDays(totals.overdue.oldestDueDate),
    leadsCount: totals.leads.count,
    leadsOldestDays: ageDays(totals.leads.oldestCreatedAt),
    unassignedCount: unassigned.length,
    unassignedNextLabel,
    conflictCount,
    conflictLabel,
  };

  const paidCentsThisMonth = totals.paidCents;
  const collectedDenomCents = paidCentsThisMonth + attention.overdueAmountCents;
  const collectedPercent = collectedDenomCents > 0 ? Math.round((paidCentsThisMonth / collectedDenomCents) * 100) : 100;

  const pulse: PulseStat[] = [
    { id: "occupancy", value: occupancyPercent, format: "percent" },
    { id: "enrolled", value: studentsRes.count ?? 0, format: "number" },
    { id: "collected", value: collectedPercent, format: "percent" },
  ];

  const cashInTotalCents = totals.cash.amountCents;
  const dayBuckets = new Map<string, number>();
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayBuckets.set(d.toISOString().slice(0, 10), 0);
  }
  for (const row of totals.days) {
    const key = row.date;
    if (dayBuckets.has(key)) dayBuckets.set(key, (dayBuckets.get(key) ?? 0) + row.amountCents);
  }
  const cashInDays: CashInDay[] = [...dayBuckets.entries()].map(([date, amountCents]) => ({ date, amountCents }));

  return (
    <AdminDashboard
      scheduleClasses={scheduleClasses}
      teachers={teachers}
      todayDow={todayDow}
      attention={attention}
      pulse={pulse}
      cashInTotalCents={cashInTotalCents}
      cashInPaymentCount={totals.cash.count}
      cashInDays={cashInDays}
      buildingCount={buildingRoster.length}
      savedLayout={dashboardLayoutRes.data?.layout ?? null}
    />
  );
}
