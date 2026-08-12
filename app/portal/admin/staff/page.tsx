// ============================================================================
//  /portal/admin/staff — Staff roster + shift calendar.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { getBrandingCached } from "@/lib/branding";
import StaffManager from "@/components/admin/staff/StaffManager";
import { getWeekRange, addWeeks } from "@/lib/staff/week";
import { getStudioTimesheets } from "@/lib/timeclock/queries";
import type {
  StaffPortalRole,
  StaffRow,
  StaffShift,
  StaffOption,
  TeachingBlock,
} from "@/lib/staff/types";

type StaffMemberRow = {
  employment_type: string | null;
  work_location: string | null;
  location_names: string[] | null;
  schedule_notes: string | null;
  contract_notes: string | null;
  pay_notes: string | null;
  manager_id: string | null;
  start_date: string | null;
  end_date: string | null;
  active: boolean | null;
};

export default async function StaffPage() {
  const { supabase, studioId, role } = await requirePortalSession();
  if (role !== "admin") {
    const { redirect } = await import("next/navigation");
    redirect("/portal/office");
  }

  const { weekStart, weekEnd } = getWeekRange();
  const shiftRangeStart = addWeeks(weekStart, -8);
  const shiftRangeEnd = addWeeks(weekEnd, 8);

  // Four weeks back: long enough to cover a fortnightly pay run plus the one
  // that slipped, short enough that the queue is a to-do list and not an
  // archive. Approved entries come too so the tab can show what was signed off.
  const timesheetRange = { from: addWeeks(weekStart, -4), to: addWeeks(weekEnd, 1) };

  const [profilesRes, shiftsRes, classesRes, branding, timesheets] = await Promise.all([
    supabase
      .from("profiles")
      .select(`
        id, full_name, email, phone, role, created_at,
        staff_members!profile_id (
          employment_type, work_location, location_names, schedule_notes,
          contract_notes, pay_notes, manager_id, start_date, end_date, active
        )
      `)
      .eq("studio_id", studioId ?? "")
      .in("role", ["teacher", "office"])
      .order("full_name"),

    supabase
      .from("staff_shifts")
      .select("id, staff_id, shift_date, start_time, end_time, location_name, notes")
      .eq("studio_id", studioId ?? "")
      .gte("shift_date", shiftRangeStart)
      .lte("shift_date", shiftRangeEnd)
      .order("shift_date")
      .order("start_time"),

    supabase
      .from("classes")
      .select("id, name, teacher_id, day_of_week, start_time, end_time, room")
      .eq("studio_id", studioId ?? "")
      .not("teacher_id", "is", null),

    getBrandingCached(studioId ?? ""),

    getStudioTimesheets(supabase, studioId ?? "", { ...timesheetRange, includeApproved: true }),
  ]);

  const managerIds = new Set<string>();
  for (const p of profilesRes.data ?? []) {
    const sm = p.staff_members as StaffMemberRow | StaffMemberRow[] | null;
    const member = Array.isArray(sm) ? sm[0] : sm;
    if (member?.manager_id) managerIds.add(member.manager_id);
  }

  const managerNames = new Map<string, string | null>();
  if (managerIds.size > 0) {
    const { data: managers } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", [...managerIds]);
    for (const m of managers ?? []) {
      managerNames.set(m.id, m.full_name as string | null);
    }
  }

  const profileNameMap = new Map(
    (profilesRes.data ?? []).map((p) => [p.id, p.full_name as string | null]),
  );

  if (profilesRes.error) {
    console.error("[staff page] profiles query failed:", profilesRes.error.message);
  }

  const staff: StaffRow[] = (profilesRes.data ?? []).map((p) => {
    const sm = p.staff_members as StaffMemberRow | StaffMemberRow[] | null;
    const member = Array.isArray(sm) ? sm[0] : sm;
    const managerId = member?.manager_id ?? null;
    return {
      id: p.id,
      name: p.full_name as string | null,
      email: p.email as string | null,
      phone: p.phone as string | null,
      role: p.role as StaffPortalRole,
      employmentType: (member?.employment_type as StaffRow["employmentType"]) ?? null,
      workLocation: (member?.work_location as StaffRow["workLocation"]) ?? null,
      locationNames: member?.location_names ?? [],
      scheduleNotes: member?.schedule_notes ?? null,
      contractNotes: member?.contract_notes ?? null,
      payNotes: member?.pay_notes ?? null,
      managerId,
      managerName: managerId ? (managerNames.get(managerId) ?? null) : null,
      startDate: member?.start_date ?? null,
      endDate: member?.end_date ?? null,
      active: member?.active ?? true,
      createdAt: p.created_at as string,
    };
  });

  const shifts: StaffShift[] = (shiftsRes.data ?? []).map((s) => {
    const prof = profilesRes.data?.find((p) => p.id === s.staff_id);
    return {
      id: s.id,
      staffId: s.staff_id as string,
      staffName: (prof?.full_name as string | null) ?? null,
      staffRole: (prof?.role as StaffPortalRole) ?? "teacher",
      shiftDate: s.shift_date as string,
      startTime: (s.start_time as string).slice(0, 5),
      endTime: (s.end_time as string).slice(0, 5),
      locationName: s.location_name as string | null,
      notes: s.notes as string | null,
    };
  });

  const teachingBlocks: TeachingBlock[] = (classesRes.data ?? []).map((c) => ({
    id: c.id as string,
    staffId: c.teacher_id as string,
    staffName: profileNameMap.get(c.teacher_id as string) ?? null,
    className: c.name as string,
    dayOfWeek: c.day_of_week as number,
    startTime: (c.start_time as string | null)?.slice(0, 5) ?? "09:00",
    endTime: (c.end_time as string | null)?.slice(0, 5) ?? null,
    room: c.room as string | null,
  }));

  const staffOptions = staff.map((s) => ({ id: s.id, name: s.name, role: s.role }));
  const managerOptions = staff.map((s) => ({
    id: s.id,
    name: s.name,
    role: s.role as StaffOption["role"],
  }));
  const adminProfiles = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("studio_id", studioId ?? "")
    .eq("role", "admin");
  for (const a of adminProfiles.data ?? []) {
    managerOptions.push({
      id: a.id,
      name: a.full_name as string | null,
      role: "admin" as const,
    });
  }

  const locations = (branding?.siteSettings?.locations ?? []).map((l) => l.name);

  return (
    <StaffManager
      staff={staff}
      shifts={shifts}
      teachingBlocks={teachingBlocks}
      staffOptions={staffOptions}
      managerOptions={managerOptions}
      locations={locations}
      weekStart={weekStart}
      loadError={profilesRes.error?.message ?? null}
      timesheets={timesheets}
      timesheetRange={timesheetRange}
    />
  );
}
