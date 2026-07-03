// ============================================================================
//  lib/enrollment-billing.ts
//
//  A class programme (e.g. "Advanced 2") may run on multiple days as separate
//  class rows. Students pay once per programme name, not per session day.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizeClassName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

type EnrollmentWithClass = {
  classes: { id: string; name: string } | { id: string; name: string }[];
};

function classFromRow(row: EnrollmentWithClass): { id: string; name: string } | null {
  const raw = row.classes;
  const c = Array.isArray(raw) ? raw[0] : raw;
  return c?.id ? c : null;
}

/**
 * True when the student already has an active enrollment in another class row
 * with the same programme name (typically a different day).
 */
export async function studentHasActiveEnrollmentForClassName(
  supabase: SupabaseClient,
  studentId: string,
  className: string,
  opts?: { excludeClassId?: string },
): Promise<boolean> {
  const target = normalizeClassName(className);
  if (!target) return false;

  const { data, error } = await supabase
    .from("enrollments")
    .select("id, classes!inner(id, name)")
    .eq("student_id", studentId)
    .eq("status", "active");

  if (error) return false;

  for (const row of data ?? []) {
    const cls = classFromRow(row as EnrollmentWithClass);
    if (!cls) continue;
    if (opts?.excludeClassId && cls.id === opts.excludeClassId) continue;
    if (normalizeClassName(cls.name) === target) return true;
  }

  return false;
}

/**
 * Billable cents for a new enrollment. Additional days of the same programme
 * name are included at no extra charge.
 *
 * `excludeClassId` must be the class row currently being billed — callers
 * that bill *after* inserting the enrollment (see enroll/actions.ts) would
 * otherwise find their own just-created row and conclude the student is
 * "already in the programme", zeroing out every charge.
 */
export async function enrollmentBillableCents(
  supabase: SupabaseClient,
  studentId: string,
  className: string,
  priceCents: number,
  opts?: { excludeClassId?: string },
): Promise<number> {
  if (priceCents <= 0) return 0;

  const alreadyInProgramme = await studentHasActiveEnrollmentForClassName(
    supabase,
    studentId,
    className,
    { excludeClassId: opts?.excludeClassId },
  );
  if (alreadyInProgramme) return 0;

  return priceCents;
}
