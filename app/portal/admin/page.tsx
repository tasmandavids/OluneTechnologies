// ============================================================================
//  /portal/admin  —  server component.
//  Fetches live stats + weekly schedule (capacity + timetable) for this studio.
// ============================================================================

import { getTranslations } from "@/lib/i18n/server";
import { getPortalSession } from "@/lib/portal/session";
import { type StatData, type ScheduleClass, type AttentionData } from "@/components/admin/dashboard/types";
import type { TeacherOption } from "@/app/portal/admin/classes/page";
import { AdminDashboard } from "@/components/admin/dashboard/AdminDashboard";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const session = await getPortalSession();
  if (!session) throw new Error("Not signed in");

  const tCommon = await getTranslations("common");

  const { supabase, studioId } = session;

  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const todayDow = new Date().getDay();

  const [studioRes, studentsRes, paidRes, todayRes, capacityRes, teachersRes, overdueRes, leadsRes] =
    await Promise.all([
      supabase.from("studios").select("name").eq("id", studioId).single(),

      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "student")
        .eq("studio_id", studioId),

      supabase
        .from("invoices")
        .select("amount_cents")
        .eq("studio_id", studioId)
        .eq("status", "paid")
        .gte("created_at", startOfMonth),

      supabase
        .from("classes")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studioId)
        .eq("day_of_week", todayDow),

      supabase
        .from("class_capacity")
        .select(
          "id, name, discipline, level, room, day_of_week, start_time, end_time, enrolled, capacity, teacher_id",
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
        .from("invoices")
        .select("amount_cents, payer_id, due_date")
        .eq("studio_id", studioId)
        .eq("status", "overdue"),

      supabase
        .from("leads")
        .select("id, created_at")
        .eq("studio_id", studioId)
        .in("status", ["new", "trial"])
        .order("created_at", { ascending: true }),
    ]);

  const revenue =
    (paidRes.data ?? []).reduce((sum, r) => sum + (r.amount_cents ?? 0), 0) / 100;

  const stats: StatData[] = [
    { id: "students", value: studentsRes.count ?? 0, format: "number" },
    { id: "revenue", value: revenue, format: "currency" },
    { id: "today", value: todayRes.count ?? 0, format: "number" },
  ];

  const classRows = capacityRes.data ?? [];
  const classIds = classRows.map((r) => r.id as string);

  const priceMap = new Map<string, number>();
  const groupMap = new Map<string, string | null>();
  if (classIds.length) {
    const { data: priceRows } = await supabase
      .from("classes")
      .select("id, price_cents, recurring_group_id")
      .in("id", classIds);
    (priceRows ?? []).forEach((r) => {
      priceMap.set(r.id, r.price_cents ?? 0);
      groupMap.set(r.id, (r.recurring_group_id as string | null) ?? null);
    });
  }

  const teacherIds = [
    ...new Set(classRows.map((c) => c.teacher_id).filter(Boolean) as string[]),
  ];
  const teacherMap = new Map<string, string>();
  if (teacherIds.length) {
    const { data: teacherRows } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", teacherIds);
    (teacherRows ?? []).forEach((t) => {
      if (t.full_name) teacherMap.set(t.id, t.full_name);
    });
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
      priceCents: priceMap.get(r.id as string) ?? 0,
      teacherId,
      teacherName: teacherId ? (teacherMap.get(teacherId) ?? null) : null,
      recurringGroupId: groupMap.get(r.id as string) ?? null,
    };
  });

  const teachers: TeacherOption[] = (teachersRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.full_name,
    email: t.email,
  }));

  const overdueRows = overdueRes.data ?? [];
  const overdueDueDates = overdueRows
    .map((r) => (r.due_date ? new Date(r.due_date as string).getTime() : null))
    .filter((t): t is number => t !== null);
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const leadsRows = leadsRes.data ?? [];

  const attention: AttentionData = {
    overdueCount: overdueRows.length,
    overdueAmountCents: overdueRows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0),
    overdueFamilies: new Set(overdueRows.map((r) => r.payer_id)).size,
    overdueOldestDays: overdueDueDates.length
      ? Math.max(0, Math.floor((now - Math.min(...overdueDueDates)) / oneDayMs))
      : 0,
    leadsCount: leadsRows.length,
    leadsOldestDays: leadsRows.length
      ? Math.max(0, Math.floor((now - new Date(leadsRows[0].created_at as string).getTime()) / oneDayMs))
      : 0,
  };

  return (
    <AdminDashboard
      studioId={studioId}
      studioName={studioRes.data?.name ?? tCommon("yourStudio")}
      stats={stats}
      scheduleClasses={scheduleClasses}
      teachers={teachers}
      todayDow={todayDow}
      attention={attention}
    />
  );
}
