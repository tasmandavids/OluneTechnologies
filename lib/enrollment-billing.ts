// ============================================================================
//  lib/enrollment-billing.ts
//
//  A class programme (e.g. "Advanced 2") may run on multiple days as separate
//  class rows sharing one `recurring_group_id` (set when an admin creates a
//  Mon/Wed/Fri series together via createRecurringClasses). Students pay once
//  per programme group, not per session day.
//
//  This intentionally does NOT match by class name — two classes an admin
//  happened to both name "Intermediate" without linking them as a recurring
//  series are two distinct, separately billable classes. Only an explicit
//  shared recurring_group_id means "same programme, don't double-charge".
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

type EnrollmentWithClass = {
  classes: { id: string; recurring_group_id: string | null } | { id: string; recurring_group_id: string | null }[];
};

function classFromRow(row: EnrollmentWithClass): { id: string; recurringGroupId: string | null } | null {
  const raw = row.classes;
  const c = Array.isArray(raw) ? raw[0] : raw;
  return c?.id ? { id: c.id, recurringGroupId: c.recurring_group_id } : null;
}

/**
 * True when the student already has an active enrollment in another class row
 * that's an explicit linked recurring-series sibling (same recurring_group_id).
 */
export async function studentHasActiveEnrollmentInProgrammeGroup(
  supabase: SupabaseClient,
  studentId: string,
  recurringGroupId: string,
  opts?: { excludeClassId?: string },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, classes!inner(id, recurring_group_id)")
    .eq("student_id", studentId)
    .eq("status", "active");

  if (error) return false;

  for (const row of data ?? []) {
    const cls = classFromRow(row as EnrollmentWithClass);
    if (!cls) continue;
    if (opts?.excludeClassId && cls.id === opts.excludeClassId) continue;
    if (cls.recurringGroupId && cls.recurringGroupId === recurringGroupId) return true;
  }

  return false;
}

/**
 * Billable cents for a new enrollment. Additional days of the same linked
 * recurring series are included at no extra charge; a standalone class
 * (no recurring_group_id) always bills in full.
 */
export async function enrollmentBillableCents(
  supabase: SupabaseClient,
  studentId: string,
  classId: string,
  priceCents: number,
): Promise<number> {
  if (priceCents <= 0) return 0;

  const { data: cls } = await supabase
    .from("classes")
    .select("recurring_group_id")
    .eq("id", classId)
    .single();

  const recurringGroupId = (cls?.recurring_group_id as string | null) ?? null;
  if (!recurringGroupId) return priceCents;

  const alreadyInProgramme = await studentHasActiveEnrollmentInProgrammeGroup(
    supabase,
    studentId,
    recurringGroupId,
    { excludeClassId: classId },
  );
  if (alreadyInProgramme) return 0;

  return priceCents;
}
