// ============================================================================
//  /portal/admin/people — unified Students/Families/Leads directory. The
//  People rail item's new landing page. Fast "browse everyone, glance at
//  balance/status, act on one row" surface — bulk actions, enrollment, and
//  the leads Kanban still live on /students, /parents, /leads (linked from
//  each tab), not duplicated here.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { listStudioMemberProfileIds } from "@/lib/portal/studio-members";
import { fetchBadgeCatalogue } from "@/lib/portal/badges-data";
import { PeopleView } from "@/components/portal/admin/people/PeopleView";
import type { PeopleStudentRow, PeopleFamilyRow, PeopleLeadRow, PeopleBadge } from "@/components/portal/admin/people/types";

export const dynamic = "force-dynamic";

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

function nextClassLabel(
  enrollments: { dayOfWeek: number; startTime: string | null }[],
): string | null {
  if (enrollments.length === 0) return null;
  const now = new Date();
  const nowDow = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  let best: { dayOfWeek: number; startTime: string | null; deltaDays: number } | null = null;
  for (const e of enrollments) {
    const [h, m] = (e.startTime ?? "00:00").split(":").map(Number);
    const startMin = h * 60 + m;
    let deltaDays = (e.dayOfWeek - nowDow + 7) % 7;
    if (deltaDays === 0 && startMin <= nowMin) deltaDays = 7;
    if (!best || deltaDays < best.deltaDays) best = { ...e, deltaDays };
  }
  if (!best) return null;
  const label = best.startTime ? best.startTime.slice(0, 5) : "";
  return `${DOW_LABELS[best.dayOfWeek]}${label ? " " + label : ""}`;
}

export default async function PeoplePage() {
  const { supabase, studioId } = await requirePortalSession();

  const [studentIds, parentIds] = await Promise.all([
    listStudioMemberProfileIds(supabase, studioId, "student"),
    listStudioMemberProfileIds(supabase, studioId, "parent"),
  ]);

  const twelveWeeksAgo = new Date(Date.now() - 12 * 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    studentsRes,
    parentsRes,
    leadsRes,
    guardianshipsRes,
    invoicesRes,
    attendanceRes,
    profileBadgesRes,
    catalogue,
  ] = await Promise.all([
    studentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("profiles")
          .select(`
            id, full_name, email, created_at,
            enrollments!student_id ( status, classes ( id, name, day_of_week, start_time ) )
          `)
          .in("id", studentIds)
          .eq("role", "student")
          .order("full_name"),

    parentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("profiles")
          .select("id, full_name, email, phone, created_at")
          .in("id", parentIds)
          .eq("role", "parent")
          .order("full_name"),

    supabase
      .from("leads")
      .select("id, first_name, last_name, email, phone, source, status, notes, created_at, updated_at")
      .eq("studio_id", studioId)
      .order("updated_at", { ascending: false }),

    supabase
      .from("guardianships")
      .select("guardian_id, student_id, is_primary, profiles!guardian_id ( full_name )")
      .eq("studio_id", studioId),

    supabase
      .from("invoices")
      .select("student_id, payer_id, amount_cents, status")
      .eq("studio_id", studioId)
      .in("status", ["sent", "overdue"]),

    studentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("attendance")
          .select("student_id, date, status")
          .in("student_id", studentIds)
          .gte("date", twelveWeeksAgo),

    studentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase.from("profile_badges").select("recipient_id, badge_id, awarded_at").in("recipient_id", studentIds),

    fetchBadgeCatalogue(supabase, studioId, "student"),
  ]);

  // ── shared lookups ─────────────────────────────────────────────────────
  const guardianshipRows = guardianshipsRes.data ?? [];
  const primaryGuardianByStudent = new Map<string, string | null>();
  for (const g of guardianshipRows) {
    const studentId = g.student_id as string;
    const prof = g.profiles as unknown as { full_name: string | null } | null;
    if (!primaryGuardianByStudent.has(studentId) || g.is_primary) {
      primaryGuardianByStudent.set(studentId, prof?.full_name ?? null);
    }
  }
  const childrenByGuardian = new Map<string, string[]>();
  for (const g of guardianshipRows) {
    const guardianId = g.guardian_id as string;
    const studentId = g.student_id as string;
    // Student name filled in below once studentsRes is mapped.
    childrenByGuardian.set(guardianId, [...(childrenByGuardian.get(guardianId) ?? []), studentId]);
  }

  const invoiceRows = invoicesRes.data ?? [];
  const balanceByStudent = new Map<string, number>();
  const balanceByPayer = new Map<string, number>();
  for (const inv of invoiceRows) {
    const cents = (inv.amount_cents as number) ?? 0;
    const sId = inv.student_id as string | null;
    const pId = inv.payer_id as string | null;
    if (sId) balanceByStudent.set(sId, (balanceByStudent.get(sId) ?? 0) + cents);
    if (pId) balanceByPayer.set(pId, (balanceByPayer.get(pId) ?? 0) + cents);
  }
  const hasOverdueByStudent = new Set(
    invoiceRows.filter((r) => r.status === "overdue" && r.student_id).map((r) => r.student_id as string),
  );

  const attendanceRows = attendanceRes.data ?? [];
  const studioTracksAttendance = attendanceRows.length > 0;
  const attendanceByStudent = new Map<string, { date: string; present: boolean }[]>();
  for (const row of attendanceRows) {
    const sId = row.student_id as string;
    const list = attendanceByStudent.get(sId) ?? [];
    list.push({ date: row.date as string, present: row.status === "present" || row.status === "late" });
    attendanceByStudent.set(sId, list);
  }

  const badgeById = new Map(catalogue.map((b) => [b.id, b]));
  const badgesByStudent = new Map<string, PeopleBadge[]>();
  for (const row of profileBadgesRes.data ?? []) {
    const def = badgeById.get(row.badge_id as string);
    if (!def) continue;
    const sId = row.recipient_id as string;
    badgesByStudent.set(sId, [...(badgesByStudent.get(sId) ?? []), { name: def.name, tier: def.tier }]);
  }

  // ── students ────────────────────────────────────────────────────────────
  const now = Date.now();
  const students: PeopleStudentRow[] = (studentsRes.data ?? []).map((p) => {
    const enrollmentRows = (
      p.enrollments as unknown as {
        status: string;
        classes: { id: string; name: string; day_of_week: number; start_time: string | null } | null;
      }[]
    ).filter((e) => e.status === "active" && e.classes);

    const classNames = [...new Set(enrollmentRows.map((e) => e.classes!.name))];
    const programme = classNames.length === 0 ? null : classNames.length === 1 ? classNames[0] : `${classNames[0]} +${classNames.length - 1}`;

    let attendancePercent: number | null = null;
    let attendanceWeeks: number[] | null = null;
    const marks = attendanceByStudent.get(p.id) ?? [];
    if (studioTracksAttendance) {
      const weekBuckets: { present: number; total: number }[] = Array.from({ length: 12 }, () => ({ present: 0, total: 0 }));
      for (const m of marks) {
        const ageMs = now - new Date(m.date).getTime();
        const weekIdx = 11 - Math.min(11, Math.floor(ageMs / (7 * 24 * 60 * 60 * 1000)));
        if (weekIdx < 0 || weekIdx > 11) continue;
        weekBuckets[weekIdx].total += 1;
        if (m.present) weekBuckets[weekIdx].present += 1;
      }
      attendanceWeeks = weekBuckets.map((w) => (w.total > 0 ? Math.round((w.present / w.total) * 100) : 0));
      const recent = marks.filter((m) => now - new Date(m.date).getTime() < 28 * 24 * 60 * 60 * 1000);
      attendancePercent = recent.length > 0 ? Math.round((recent.filter((m) => m.present).length / recent.length) * 100) : null;
    }

    const joinedAt = p.created_at as string;
    const isNew = now - new Date(joinedAt).getTime() < 14 * 24 * 60 * 60 * 1000;

    return {
      id: p.id,
      name: p.full_name,
      initials: initials(p.full_name),
      programme,
      attendancePercent,
      balanceCents: balanceByStudent.get(p.id) ?? 0,
      flag: hasOverdueByStudent.has(p.id) ? "overdue" : isNew ? "new" : null,
      guardianName: primaryGuardianByStudent.get(p.id) ?? null,
      joinedAt,
      nextClassLabel: nextClassLabel(enrollmentRows.map((e) => ({ dayOfWeek: e.classes!.day_of_week, startTime: e.classes!.start_time }))),
      badges: badgesByStudent.get(p.id) ?? [],
      attendanceWeeks,
    };
  });

  // ── families ────────────────────────────────────────────────────────────
  const studentNameById = new Map(students.map((s) => [s.id, s.name]));
  const families: PeopleFamilyRow[] = (parentsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.full_name,
    initials: initials(p.full_name),
    email: p.email,
    phone: p.phone,
    childrenNames: (childrenByGuardian.get(p.id) ?? []).map((sid) => studentNameById.get(sid) ?? null).filter((n): n is string => !!n),
    balanceCents: balanceByPayer.get(p.id) ?? 0,
    joinedAt: p.created_at as string,
  }));

  // ── leads ───────────────────────────────────────────────────────────────
  const leads: PeopleLeadRow[] = (leadsRes.data ?? []).map((l) => ({
    id: l.id,
    name: [l.first_name, l.last_name].filter(Boolean).join(" ") || "—",
    email: l.email,
    phone: l.phone,
    source: l.source,
    status: l.status as PeopleLeadRow["status"],
    notes: l.notes,
    createdAt: l.created_at,
  }));

  return <PeopleView students={students} families={families} leads={leads} studioTracksAttendance={studioTracksAttendance} />;
}
