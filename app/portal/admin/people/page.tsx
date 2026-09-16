// ============================================================================
//  /portal/admin/people — unified Students/Families/Leads directory. The one
//  door to every person in the studio: browse, search, filter, and act on a
//  row. It replaced the separate /students and /parents rosters (both now
//  redirect here), so it also owns the roster-level actions those screens had:
//  add student, add family, invite all, mass email, bulk edit/delete. Per-class
//  enrollment lives on the class detail panel; the leads Kanban on /leads.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { PageLinks } from "@/components/ui/PageLinks";
import { parsePage, PAGE_SIZE } from "@/lib/pagination";
import { fetchBadgeCatalogue } from "@/lib/portal/badges-data";
import { PeopleView, type PeopleTab } from "@/components/portal/admin/people/PeopleView";
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

const TABS = ["students", "families", "leads"] as const;

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string; filter?: string; class?: string; page?: string }>;
}) {
  const params = await searchParams;
  const { tab } = params;
  const page = parsePage(params.page);
  const initialTab = (TABS as readonly string[]).includes(tab ?? "") ? (tab as PeopleTab) : "students";

  const { supabase, studioId, role } = await requirePortalSession();
  const canMassEmail = role === "admin";

  const { data: directory, error: directoryError } = await supabase.rpc("portal_people_page", {
    p_studio_id: studioId, p_tab: initialTab, p_query: (params.q ?? "").trim().slice(0, 200),
    p_filter: params.filter ?? "all", p_class: params.class ?? "all", p_offset: (page - 1) * PAGE_SIZE,
  });
  if (directoryError || !directory) throw new Error("Unable to load people");
  const result = directory as { ids: string[]; childIds: string[]; total: number; counts: Record<PeopleTab, number>; classNames: string[] };
  const studentIds = initialTab === "students" ? result.ids : result.childIds;
  const parentIds = initialTab === "families" ? result.ids : [];
  const emptyId = "00000000-0000-0000-0000-000000000000";

  const [
    studentsRes,
    parentsRes,
    leadsRes,
    guardianshipsRes,
    invoicesRes,
    attendanceRes,
    profileBadgesRes,
    catalogue,
    classesRes,
  ] = await Promise.all([
    studentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("profiles")
          .select(`
            id, full_name, email, phone, created_at,
            enrollments!student_id ( status, classes ( id, name, day_of_week, start_time ) )
          `)
          .in("id", studentIds)
          .eq("role", "student")
          .eq("enrollments.studio_id", studioId)
          .eq("enrollments.status", "active")
          .order("full_name").order("id"),

    parentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase
          .from("profiles")
          .select("id, full_name, email, phone, created_at")
          .in("id", parentIds)
          .eq("role", "parent")
          .order("full_name").order("id"),

    supabase
      .from("leads")
      .select("id, first_name, last_name, email, phone, source, status, notes, created_at, updated_at")
      .eq("studio_id", studioId)
      .in("id", initialTab === "leads" && result.ids.length ? result.ids : [emptyId])
      .order("updated_at", { ascending: false }).order("id"),

    supabase
      .from("guardianships")
      .select("guardian_id, student_id, is_primary, profiles!guardian_id ( id, full_name, email, phone )")
      .eq("studio_id", studioId).in("student_id", studentIds.length ? studentIds : [emptyId]),

    supabase.rpc("portal_people_balances", { p_studio_id: studioId,
      p_ids: initialTab === "leads" ? [] : result.ids, p_families: initialTab === "families" }),

    supabase.rpc("portal_people_attendance", { p_studio_id: studioId,
      p_student_ids: initialTab === "students" ? studentIds : [] }),

    studentIds.length === 0
      ? Promise.resolve({ data: [] as never[] })
      : supabase.from("profile_badges").select("recipient_id, badge_id, awarded_at").in("recipient_id", studentIds).eq("studio_id", studioId),

    fetchBadgeCatalogue(supabase, studioId, "student"),

    // Class list for the mass-email "one class" scope. Admin-only feature.
    canMassEmail
      ? supabase.from("classes").select("id, name").eq("studio_id", studioId).order("name")
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  for (const response of [studentsRes, parentsRes, leadsRes, guardianshipsRes, invoicesRes, attendanceRes, profileBadgesRes]) {
    if ("error" in response && response.error) throw new Error("Unable to load people details");
  }

  // ── shared lookups ─────────────────────────────────────────────────────
  type GuardianProfile = { id: string; full_name: string | null; email: string | null; phone: string | null };
  const guardianshipRows = guardianshipsRes.data ?? [];
  const primaryGuardianByStudent = new Map<string, string | null>();
  for (const g of guardianshipRows) {
    const studentId = g.student_id as string;
    const prof = g.profiles as unknown as GuardianProfile | null;
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

  const invoiceRows = (invoicesRes.data ?? []) as { student_id: string | null; payer_id: string | null; amount_cents: number; status: string }[];
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

  const attendance = attendanceRes.data as { tracked: boolean; rows: { studentId: string; percent: number | null; weeks: number[] }[] };
  const studioTracksAttendance = attendance.tracked;
  const attendanceByStudent = new Map(attendance.rows.map(row => [row.studentId, row]));

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

    const marks = attendanceByStudent.get(p.id);
    const attendancePercent = marks?.percent ?? null;
    const attendanceWeeks = studioTracksAttendance ? (marks?.weeks ?? null) : null;

    const joinedAt = p.created_at as string;
    const isNew = now - new Date(joinedAt).getTime() < 14 * 24 * 60 * 60 * 1000;

    return {
      id: p.id,
      name: p.full_name,
      initials: initials(p.full_name),
      email: p.email,
      phone: p.phone,
      classNames,
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

  const classOptions = (classesRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: (c.name as string) || "Untitled class",
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

  const pagingQuery = new URLSearchParams({ tab: initialTab, q: params.q ?? "", filter: params.filter ?? "all", class: params.class ?? "all" });
  return (
    <>
    <PeopleView
      students={students}
      families={families}
      leads={leads}
      studioTracksAttendance={studioTracksAttendance}
      classOptions={classOptions}
      canMassEmail={canMassEmail}
      initialTab={initialTab}
      serverCounts={result.counts}
      serverClassNames={result.classNames}
    />
    <PageLinks page={page} total={result.total} baseHref={`/portal/admin/people?${pagingQuery}`} />
    </>
  );
}
