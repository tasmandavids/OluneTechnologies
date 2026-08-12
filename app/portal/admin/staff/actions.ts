"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminStudio } from "@/lib/portal/access";
import type {
  StaffEmploymentType,
  StaffPortalRole,
  StaffWorkLocation,
} from "@/lib/staff/types";
import {
  EMPLOYMENT_TYPES,
  STAFF_PORTAL_ROLES,
  WORK_LOCATIONS,
} from "@/lib/staff/types";
import { studioLocalYmd } from "@/lib/date/studio-date";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

const STAFF_PATHS = ["/portal/admin/staff", "/portal/office"];

function revalidateStaffPaths(staffId?: string) {
  for (const path of STAFF_PATHS) revalidatePath(path);
  if (staffId) revalidatePath(`/portal/admin/staff/${staffId}`);
}

const StaffRoleSchema = z.enum(STAFF_PORTAL_ROLES as [StaffPortalRole, StaffPortalRole]);
const EmploymentSchema = z.enum(EMPLOYMENT_TYPES as [StaffEmploymentType, ...StaffEmploymentType[]]).optional().nullable();
const WorkLocationSchema = z.enum(WORK_LOCATIONS as [StaffWorkLocation, ...StaffWorkLocation[]]).optional().nullable();

const CreateStaffSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(120),
  email: z.string().email("Valid email required"),
  phone: z.string().max(30).optional().or(z.literal("")),
  role: StaffRoleSchema,
  employmentType: EmploymentSchema,
  workLocation: WorkLocationSchema,
  locationNames: z.array(z.string()).default([]),
  scheduleNotes: z.string().max(2000).optional().or(z.literal("")),
  contractNotes: z.string().max(2000).optional().or(z.literal("")),
  payNotes: z.string().max(2000).optional().or(z.literal("")),
  managerId: z.string().uuid().optional().nullable().or(z.literal("")),
  startDate: z.string().optional().nullable().or(z.literal("")),
});

const UpdateStaffSchema = CreateStaffSchema.extend({
  id: z.string().uuid(),
  active: z.boolean().optional(),
  endDate: z.string().optional().nullable().or(z.literal("")),
}).omit({ email: true });

const UpdateProfileSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  role: StaffRoleSchema,
});

const ShiftSchema = z.object({
  staffId: z.string().uuid(),
  shiftDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  endTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  locationName: z.string().max(120).optional().or(z.literal("")),
  notes: z.string().max(500).optional().or(z.literal("")),
});

function normalizeTime(t: string): string {
  return t.length === 5 ? `${t}:00` : t;
}

function getStaffAdminClient(): ReturnType<typeof createAdminClient> | { error: string } {
  try {
    return createAdminClient();
  } catch {
    return {
      error:
        "Adding staff requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Settings → API).",
    };
  }
}

async function rollbackAuthUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}

export async function createStaffMember(
  input: z.infer<typeof CreateStaffSchema>,
): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const parsed = CreateStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const adminOrError = getStaffAdminClient();
  if ("error" in adminOrError) return { ok: false, error: adminOrError.error };
  const admin = adminOrError;

  const { data: existing } = await admin
    .from("profiles")
    .select("id, studio_id, role")
    .eq("email", data.email)
    .maybeSingle();
  if (existing?.studio_id === studioId) {
    return { ok: false, error: `A user with email ${data.email} already exists in this studio.` };
  }
  if (existing) {
    return { ok: false, error: `Email ${data.email} is already registered to another account.` };
  }

  const { data: authData, error: authErr } = await admin.auth.admin.createUser({
    email: data.email,
    email_confirm: true,
    user_metadata: { full_name: data.fullName },
  });
  if (authErr) return { ok: false, error: authErr.message };

  const userId = authData.user.id;
  const managerId = data.managerId && data.managerId !== "" ? data.managerId : null;

  // Auth trigger inserts a bare profile row; update it with studio + role.
  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .update({
      studio_id: studioId,
      role: data.role,
      full_name: data.fullName,
      email: data.email,
      phone: data.phone || null,
      active_studio_id: studioId,
    })
    .eq("id", userId)
    .select("id")
    .maybeSingle();
  if (profileErr) {
    await rollbackAuthUser(admin, userId);
    return { ok: false, error: profileErr.message };
  }
  if (!profileRow) {
    await rollbackAuthUser(admin, userId);
    return { ok: false, error: "Could not create staff profile." };
  }

  const { error: memberErr } = await admin.from("staff_members").insert({
    profile_id: userId,
    studio_id: studioId,
    employment_type: data.employmentType ?? null,
    work_location: data.workLocation ?? null,
    location_names: data.locationNames,
    schedule_notes: data.scheduleNotes || null,
    contract_notes: data.contractNotes || null,
    pay_notes: data.payNotes || null,
    manager_id: managerId,
    start_date: data.startDate || null,
    active: true,
  });
  if (memberErr) {
    await rollbackAuthUser(admin, userId);
    return { ok: false, error: memberErr.message };
  }

  await admin.from("studio_memberships").upsert(
    {
      user_id: userId,
      studio_id: studioId,
      role: data.role,
      is_primary: true,
      linked_via: "admin",
      status: "active",
    },
    { onConflict: "user_id,studio_id" },
  );

  revalidateStaffPaths(userId);
  return { ok: true, id: userId };
}

export async function updateStaffMember(
  input: z.infer<typeof UpdateStaffSchema>,
): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const parsed = UpdateStaffSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const adminOrError = getStaffAdminClient();
  if ("error" in adminOrError) return { ok: false, error: adminOrError.error };
  const admin = adminOrError;
  const managerId = data.managerId && data.managerId !== "" ? data.managerId : null;

  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .update({
      full_name: data.fullName,
      phone: data.phone || null,
      role: data.role,
    })
    .eq("id", data.id)
    .eq("studio_id", studioId)
    .in("role", ["teacher", "office"])
    .select("id")
    .maybeSingle();
  if (profileErr) return { ok: false, error: profileErr.message };
  if (!profileRow) return { ok: false, error: "Staff member not found." };

  const { error: memberErr } = await admin.from("staff_members").upsert(
    {
      profile_id: data.id,
      studio_id: studioId,
      employment_type: data.employmentType ?? null,
      work_location: data.workLocation ?? null,
      location_names: data.locationNames,
      schedule_notes: data.scheduleNotes || null,
      contract_notes: data.contractNotes || null,
      pay_notes: data.payNotes || null,
      manager_id: managerId,
      start_date: data.startDate || null,
      end_date: data.endDate || null,
      active: data.active ?? true,
    },
    { onConflict: "profile_id" },
  );
  if (memberErr) return { ok: false, error: memberErr.message };

  revalidateStaffPaths(data.id);
  return { ok: true, id: data.id };
}

export async function updateStaffProfile(
  input: z.infer<typeof UpdateProfileSchema>,
): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const parsed = UpdateProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const adminOrError = getStaffAdminClient();
  if ("error" in adminOrError) return { ok: false, error: adminOrError.error };
  const admin = adminOrError;

  const { data: profileRow, error: profileErr } = await admin
    .from("profiles")
    .update({
      full_name: data.fullName,
      phone: data.phone || null,
      role: data.role,
    })
    .eq("id", data.id)
    .eq("studio_id", studioId)
    .in("role", ["teacher", "office"])
    .select("id")
    .maybeSingle();
  if (profileErr) return { ok: false, error: profileErr.message };
  if (!profileRow) return { ok: false, error: "Staff member not found." };

  revalidateStaffPaths(data.id);
  return { ok: true, id: data.id };
}

export async function setStaffActive(id: string, active: boolean): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const admin = createAdminClient();
  const { error: memberErr } = await admin
    .from("staff_members")
    .update({ active, end_date: active ? null : studioLocalYmd() })
    .eq("profile_id", id)
    .eq("studio_id", studioId);
  if (memberErr) return { ok: false, error: memberErr.message };

  revalidateStaffPaths(id);
  return { ok: true, id };
}

export async function createStaffShift(
  input: z.infer<typeof ShiftSchema>,
): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const parsed = ShiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const admin = createAdminClient();
  const { data: row, error: insertErr } = await admin
    .from("staff_shifts")
    .insert({
      studio_id: studioId,
      staff_id: data.staffId,
      shift_date: data.shiftDate,
      start_time: normalizeTime(data.startTime),
      end_time: normalizeTime(data.endTime),
      location_name: data.locationName || null,
      notes: data.notes || null,
    })
    .select("id")
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  revalidateStaffPaths(data.staffId);
  return { ok: true, id: row.id };
}

export async function updateStaffShift(
  id: string,
  input: z.infer<typeof ShiftSchema>,
): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const parsed = ShiftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const data = parsed.data;

  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("staff_shifts")
    .update({
      staff_id: data.staffId,
      shift_date: data.shiftDate,
      start_time: normalizeTime(data.startTime),
      end_time: normalizeTime(data.endTime),
      location_name: data.locationName || null,
      notes: data.notes || null,
    })
    .eq("id", id)
    .eq("studio_id", studioId);
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateStaffPaths(data.staffId);
  return { ok: true, id };
}

export async function deleteStaffShift(id: string): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const admin = createAdminClient();
  const { error: deleteErr } = await admin
    .from("staff_shifts")
    .delete()
    .eq("id", id)
    .eq("studio_id", studioId);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  revalidateStaffPaths();
  return { ok: true };
}

export async function deleteStaffMember(id: string): Promise<ActionResult> {
  if (!id) return { ok: false, error: "Missing staff ID." };

  const { error, studioId, userId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };
  if (userId === id) return { ok: false, error: "You cannot delete your own account." };

  const admin = createAdminClient();

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", id)
    .eq("studio_id", studioId)
    .in("role", ["teacher", "office"])
    .maybeSingle();

  if (profileErr) return { ok: false, error: profileErr.message };
  if (!profile) return { ok: false, error: "Staff member not found." };

  const { count: invoiceCount } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("payer_id", id);

  if (invoiceCount && invoiceCount > 0) {
    return {
      ok: false,
      error: "This staff member has billing records and cannot be deleted.",
    };
  }

  await admin.from("events").update({ created_by: null }).eq("created_by", id);

  const { error: deleteErr } = await admin.auth.admin.deleteUser(id);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  revalidateStaffPaths();
  return { ok: true };
}

// ============================================================================
//  TIME CLOCK — manager actions (0118)
//
//  Approving, correcting and back-dating a timesheet are manager powers; the
//  staff member's own clock lives in app/portal/timeclock/actions.ts and can do
//  none of these. Each action below re-derives the studio from the session and
//  scopes every write to it, so a forged entry id from another studio matches
//  nothing rather than being trusted.
// ============================================================================

const TIMECLOCK_PATHS = ["/portal/admin/staff", "/portal/teacher", "/portal/office"];

function revalidateTimeclockPaths(staffId?: string) {
  for (const path of TIMECLOCK_PATHS) revalidatePath(path);
  if (staffId) revalidatePath(`/portal/admin/staff/${staffId}`);
}

const HOUR_TYPES = ["regular", "overtime", "holiday", "sick", "vacation", "unpaid"] as const;

const TimeEntrySchema = z.object({
  staffId: z.string().uuid(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  clockInAt: z.string().datetime(),
  clockOutAt: z.string().datetime().nullable().optional(),
  hourType: z.enum(HOUR_TYPES).default("regular"),
  locationName: z.string().max(120).optional().or(z.literal("")),
  department: z.string().max(120).optional().or(z.literal("")),
  note: z.string().max(500).optional().or(z.literal("")),
});

/** Approve one entry. Idempotent-ish: re-approving simply restamps it. */
export async function approveTimeEntry(id: string): Promise<ActionResult> {
  const { error, studioId, userId } = await getAdminStudio();
  if (error || !studioId || !userId) return { ok: false, error: error ?? "No studio." };

  const admin = createAdminClient();

  // An open shift has no hours to sign off — 0118 rejects it with a check
  // violation, and a manager deserves a better sentence than that.
  const { data: entry } = await admin
    .from("staff_time_entries")
    .select("id, staff_id, clock_out_at")
    .eq("id", id)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!entry) return { ok: false, error: "Timesheet entry not found." };
  if (!entry.clock_out_at) {
    return { ok: false, error: "This shift is still open — clock it out before approving." };
  }

  const { error: updateErr } = await admin
    .from("staff_time_entries")
    .update({ approved_by: userId, approved_at: new Date().toISOString() })
    .eq("id", id)
    .eq("studio_id", studioId);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateTimeclockPaths(entry.staff_id as string);
  return { ok: true, id };
}

/** Approve a batch — the queue's whole point is not clicking forty buttons. */
export async function approveTimeEntries(ids: string[]): Promise<ActionResult> {
  const { error, studioId, userId } = await getAdminStudio();
  if (error || !studioId || !userId) return { ok: false, error: error ?? "No studio." };
  if (ids.length === 0) return { ok: false, error: "Nothing selected." };

  const admin = createAdminClient();

  // Open shifts are filtered out rather than failing the batch: approving
  // eleven of twelve entries and saying so beats approving none of them.
  const { data: closed } = await admin
    .from("staff_time_entries")
    .select("id")
    .in("id", ids)
    .eq("studio_id", studioId)
    .not("clock_out_at", "is", null);

  const approvable = (closed ?? []).map((e) => e.id as string);
  if (approvable.length === 0) {
    return { ok: false, error: "Those shifts are still open — clock them out before approving." };
  }

  const { error: updateErr } = await admin
    .from("staff_time_entries")
    .update({ approved_by: userId, approved_at: new Date().toISOString() })
    .in("id", approvable)
    .eq("studio_id", studioId);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateTimeclockPaths();
  return { ok: true };
}

/** Reopen an approved entry so it can be corrected. */
export async function unapproveTimeEntry(id: string): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const admin = createAdminClient();
  const { error: updateErr } = await admin
    .from("staff_time_entries")
    .update({ approved_by: null, approved_at: null })
    .eq("id", id)
    .eq("studio_id", studioId);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateTimeclockPaths();
  return { ok: true, id };
}

/**
 * Add a shift by hand — the missed clock-in, which is the single most common
 * thing a manager has to fix. `source = 'manual'` and `created_by` keep it
 * distinguishable from something the staff member actually clocked.
 */
export async function createTimeEntry(
  input: z.infer<typeof TimeEntrySchema>,
): Promise<ActionResult> {
  const { error, studioId, userId } = await getAdminStudio();
  if (error || !studioId || !userId) return { ok: false, error: error ?? "No studio." };

  const parsed = TimeEntrySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  if (data.clockOutAt && Date.parse(data.clockOutAt) <= Date.parse(data.clockInAt)) {
    return { ok: false, error: "Clock-out must be after clock-in." };
  }

  const admin = createAdminClient();

  // The staff member must belong to this studio — the id arrives from a form.
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", data.staffId)
    .eq("studio_id", studioId)
    .in("role", ["teacher", "office", "admin"])
    .maybeSingle();

  if (!profile) return { ok: false, error: "Staff member not found." };

  const { data: row, error: insertErr } = await admin
    .from("staff_time_entries")
    .insert({
      studio_id: studioId,
      staff_id: data.staffId,
      entry_date: data.entryDate,
      clock_in_at: data.clockInAt,
      clock_out_at: data.clockOutAt || null,
      hour_type: data.hourType,
      source: "manual",
      location_name: data.locationName || null,
      department: data.department || null,
      note: data.note || null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (insertErr) {
    // The one-open-shift-per-staff index. Adding a second open entry by hand
    // is how a timesheet quietly doubles.
    if (insertErr.code === "23505") {
      return { ok: false, error: "That staff member already has an open shift." };
    }
    return { ok: false, error: insertErr.message };
  }

  revalidateTimeclockPaths(data.staffId);
  return { ok: true, id: row.id };
}

/**
 * Correct an entry. Refuses while approved — a manager unapproves first, so
 * that "this was signed off and then changed" is never silent.
 */
export async function updateTimeEntry(
  id: string,
  input: Partial<z.infer<typeof TimeEntrySchema>>,
): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const parsed = TimeEntrySchema.partial().safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("staff_time_entries")
    .select("id, staff_id, clock_in_at, clock_out_at, approved_at")
    .eq("id", id)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Timesheet entry not found." };
  if (existing.approved_at) {
    return { ok: false, error: "Unapprove this entry before editing it." };
  }

  const clockInAt = data.clockInAt ?? (existing.clock_in_at as string);
  const clockOutAt =
    data.clockOutAt !== undefined ? data.clockOutAt : (existing.clock_out_at as string | null);

  if (clockOutAt && Date.parse(clockOutAt) <= Date.parse(clockInAt)) {
    return { ok: false, error: "Clock-out must be after clock-in." };
  }

  const { error: updateErr } = await admin
    .from("staff_time_entries")
    .update({
      ...(data.entryDate ? { entry_date: data.entryDate } : {}),
      clock_in_at: clockInAt,
      clock_out_at: clockOutAt,
      ...(data.hourType ? { hour_type: data.hourType } : {}),
      ...(data.locationName !== undefined ? { location_name: data.locationName || null } : {}),
      ...(data.department !== undefined ? { department: data.department || null } : {}),
      ...(data.note !== undefined ? { note: data.note || null } : {}),
    })
    .eq("id", id)
    .eq("studio_id", studioId);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidateTimeclockPaths(existing.staff_id as string);
  return { ok: true, id };
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("staff_time_entries")
    .select("id, approved_at")
    .eq("id", id)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Timesheet entry not found." };
  if (existing.approved_at) {
    return { ok: false, error: "Unapprove this entry before deleting it." };
  }

  const { error: deleteErr } = await admin
    .from("staff_time_entries")
    .delete()
    .eq("id", id)
    .eq("studio_id", studioId);

  if (deleteErr) return { ok: false, error: deleteErr.message };

  revalidateTimeclockPaths();
  return { ok: true };
}

// ─── Pay rates ──────────────────────────────────────────────────────────────

const PayRateSchema = z.object({
  staffId: z.string().uuid(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Whole cents. The form collects dollars; conversion happens client-side. */
  rateCents: z.number().int().min(0).max(100_000_00),
  currency: z.string().length(3).default("NZD"),
});

/**
 * Set the rate in force from a date. Upserts on (staff_id, effective_from) so
 * fixing a typo in today's rate doesn't leave two rows fighting over the day.
 */
export async function setPayRate(input: z.infer<typeof PayRateSchema>): Promise<ActionResult> {
  const { error, studioId, userId } = await getAdminStudio();
  if (error || !studioId || !userId) return { ok: false, error: error ?? "No studio." };

  const parsed = PayRateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const data = parsed.data;

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("id", data.staffId)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!profile) return { ok: false, error: "Staff member not found." };

  const { data: row, error: upsertErr } = await admin
    .from("staff_pay_rates")
    .upsert(
      {
        studio_id: studioId,
        staff_id: data.staffId,
        effective_from: data.effectiveFrom,
        rate_cents: data.rateCents,
        currency: data.currency,
        created_by: userId,
      },
      { onConflict: "staff_id,effective_from" },
    )
    .select("id")
    .single();

  if (upsertErr) return { ok: false, error: upsertErr.message };

  revalidateTimeclockPaths(data.staffId);
  return { ok: true, id: row.id };
}

export async function deletePayRate(id: string): Promise<ActionResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "No studio." };

  const admin = createAdminClient();
  const { error: deleteErr } = await admin
    .from("staff_pay_rates")
    .delete()
    .eq("id", id)
    .eq("studio_id", studioId);

  if (deleteErr) return { ok: false, error: deleteErr.message };

  revalidateTimeclockPaths();
  return { ok: true };
}
