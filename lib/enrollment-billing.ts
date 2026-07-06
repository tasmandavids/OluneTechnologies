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
  opts?: { excludeClassIds?: string[] },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("id, classes!inner(id, recurring_group_id)")
    .eq("student_id", studentId)
    .eq("status", "active");

  if (error) return false;

  const excluded = new Set(opts?.excludeClassIds ?? []);

  for (const row of data ?? []) {
    const cls = classFromRow(row as EnrollmentWithClass);
    if (!cls) continue;
    if (excluded.has(cls.id)) continue;
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
    { excludeClassIds: [classId] },
  );
  if (alreadyInProgramme) return 0;

  return priceCents;
}

/**
 * Billable cents per class for a batch of classes being enrolled and invoiced
 * together in one session (e.g. EnrollModal's pay-later/pay-monthly flow,
 * which inserts every selected class's `enrollments` row before billing runs).
 * Calling `enrollmentBillableCents` per class in that situation double-counts:
 * by the time billing runs, every class in a linked series is already active,
 * so each one's "is another sibling already active" check finds the others
 * and zeroes ALL of them out instead of all-but-one.
 *
 * Processes classes in the given order, excluding every class in this batch
 * (not just itself) from the "already active" DB check — so only a genuinely
 * prior, external enrollment in the same series zeroes it out — and tracks
 * which recurring groups this batch has already billed locally, so the first
 * class encountered per group in this batch bills in full and every later
 * sibling (in this batch or already active elsewhere) is free.
 */
export async function batchEnrollmentBillableCents(
  supabase: SupabaseClient,
  studentId: string,
  classes: { classId: string; priceCents: number }[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!classes.length) return result;

  const batchClassIds = classes.map((c) => c.classId);

  const { data: classRows } = await supabase
    .from("classes")
    .select("id, recurring_group_id")
    .in("id", batchClassIds);
  const groupByClassId = new Map(
    (classRows ?? []).map((r) => [r.id as string, (r.recurring_group_id as string | null) ?? null]),
  );

  const paidGroups = new Set<string>();

  for (const cls of classes) {
    if (cls.priceCents <= 0) {
      result.set(cls.classId, 0);
      continue;
    }

    const recurringGroupId = groupByClassId.get(cls.classId) ?? null;
    if (!recurringGroupId) {
      result.set(cls.classId, cls.priceCents);
      continue;
    }

    if (paidGroups.has(recurringGroupId)) {
      result.set(cls.classId, 0);
      continue;
    }

    const alreadyInProgramme = await studentHasActiveEnrollmentInProgrammeGroup(
      supabase,
      studentId,
      recurringGroupId,
      { excludeClassIds: batchClassIds },
    );

    result.set(cls.classId, alreadyInProgramme ? 0 : cls.priceCents);
    paidGroups.add(recurringGroupId);
  }

  return result;
}
