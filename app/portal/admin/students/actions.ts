"use server";

// ============================================================================
//  Admin · Students server actions
//  enroll / unenroll a student, add a new student profile.
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inviteRedirectUrl } from "@/lib/app-url";
import { getStudioOpsStudio } from "@/lib/portal/access";
import { insertTuitionInvoice, quoteEnrollment } from "@/lib/billing/tuition-invoice";
import { loadStudioTuitionContext } from "@/lib/billing/tuition-model";
import { dispatchStudioEvent } from "@/lib/integrations/events";
import { logAuditEvent } from "@/lib/audit/log";

async function getAdminStudio() {
  const ctx = await getStudioOpsStudio();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
    // Carried through for the audit trail: an entry without an actor answers
    // "what happened" but not "who", which is the half an auditor asks about.
    userId: ctx.userId,
    role: ctx.role,
  };
}

export type ActionResult = { ok: true } | { ok: false; error: string };

// ─── ENROLL ─────────────────────────────────────────────────────────────────

const EnrollSchema = z.object({
  studentId: z.string().uuid(),
  classId:   z.string().uuid(),
});

export async function enrollStudent(input: unknown): Promise<ActionResult> {
  const parsed = EnrollSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { studentId, classId } = parsed.data;

  // Check capacity — prefer atomic RPC (migration 0095)
  const { data: atomicRows, error: rpcErr } = await supabase.rpc("enroll_student_atomic", {
    p_studio_id: studioId,
    p_student_id: studentId,
    p_class_id: classId,
  });

  if (!rpcErr && atomicRows?.[0]) {
    const row = atomicRows[0] as { enrollment_id: string; waitlisted: boolean };
    dispatchStudioEvent({
      type: row.waitlisted ? "enrolment.waitlisted" : "enrolment.created",
      studioId,
      data: {
        enrolmentId: row.enrollment_id,
        studentId,
        classId,
        waitlisted: Boolean(row.waitlisted),
      },
    });
    revalidatePath("/portal/admin/students");
    revalidatePath("/portal/admin/people");
    revalidatePath("/portal/admin/classes");
    revalidatePath("/portal/admin");
    return { ok: true };
  }

  if (rpcErr && !/function .*enroll_student_atomic/i.test(rpcErr.message)) {
    if (/already enrolled/i.test(rpcErr.message)) {
      return { ok: false, error: "Student is already enrolled." };
    }
    return { ok: false, error: rpcErr.message };
  }

  const { data: cap } = await supabase
    .from("class_capacity")
    .select("enrolled, capacity")
    .eq("id", classId)
    .eq("studio_id", studioId)
    .single();

  if (!cap) return { ok: false, error: "Class not found." };

  const isFull = Number(cap.enrolled) >= Number(cap.capacity);
  const status = isFull ? "waitlisted" : "active";

  const { error: dbError } = await supabase.from("enrollments").upsert(
    {
      studio_id:  studioId,
      student_id: studentId,
      class_id:   classId,
      status,
    },
    { onConflict: "student_id,class_id" },
  );

  if (dbError) return { ok: false, error: dbError.message };

  dispatchStudioEvent({
    type: isFull ? "enrolment.waitlisted" : "enrolment.created",
    studioId,
    data: { enrolmentId: null, studentId, classId, waitlisted: isFull },
  });
  // The enrolment that takes the last seat is the one worth a Zap — it's the
  // studio's cue to open another class.
  if (!isFull && Number(cap.enrolled) + 1 >= Number(cap.capacity)) {
    dispatchStudioEvent({
      type: "class.filled",
      studioId,
      data: { classId, capacity: Number(cap.capacity) },
    });
  }

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin");
  return { ok: true };
}

// ─── UNENROLL ────────────────────────────────────────────────────────────────

export async function unenrollStudent(
  studentId: string,
  classId: string,
): Promise<ActionResult> {
  if (!studentId || !classId) return { ok: false, error: "Missing IDs" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbError } = await supabase
    .from("enrollments")
    .delete()
    .eq("student_id", studentId)
    .eq("class_id", classId)
    .eq("studio_id", studioId);

  if (dbError) return { ok: false, error: dbError.message };

  dispatchStudioEvent({
    type: "enrolment.cancelled",
    studioId,
    data: { studentId, classId },
  });

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin");
  return { ok: true };
}

// ─── DROP (soft-cancel) ───────────────────────────────────────────────────────
// Sets status='dropped' instead of hard-deleting the row, preserving history.
// The 0012 waitlist trigger fires on this status change (active → dropped) and
// auto-promotes the next waitlisted student. Re-enrolling later goes through
// enrollStudent's upsert (the (student_id, class_id) unique constraint blocks a
// plain re-insert of the dropped row).

export async function dropEnrollment(
  studentId: string,
  classId: string,
): Promise<ActionResult> {
  if (!studentId || !classId) return { ok: false, error: "Missing IDs" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbError } = await supabase
    .from("enrollments")
    .update({ status: "dropped" })
    .eq("student_id", studentId)
    .eq("class_id", classId)
    .eq("studio_id", studioId);

  if (dbError) return { ok: false, error: dbError.message };

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin");
  return { ok: true };
}

// ─── INVITE / CREATE STUDENT ────────────────────────────────────────────────
// Creates a profile row for a student who doesn't have a login yet.
// In a real flow you'd send a magic-link invite; here we just insert the row.

const StudentSchema = z.object({
  fullName: z.string().min(1, "Name is required").max(120),
  email:    z.string().email("Valid email required").optional().or(z.literal("")),
  phone:    z.string().max(30).optional().or(z.literal("")),
});

export async function addStudent(input: unknown): Promise<ActionResult> {
  const parsed = StudentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { error, studioId, userId: actorId, role: actorRole } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "Adding students requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Settings → API).",
    };
  }

  const d = parsed.data;
  let userId: string;

  if (d.email) {
    const { data: inviteData, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(d.email, {
      data: { full_name: d.fullName },
      redirectTo: inviteRedirectUrl(),
    });
    if (inviteErr) return { ok: false, error: inviteErr.message };
    userId = inviteData.user.id;
  } else {
    const authEmail = `${crypto.randomUUID()}@students.olune.local`;
    const { data: authData, error: authErr } = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: { full_name: d.fullName },
    });
    if (authErr) return { ok: false, error: authErr.message };
    userId = authData.user.id;
  }

  const { error: dbError } = await admin.from("profiles").upsert({
    id:        userId,
    studio_id: studioId,
    role:      "student",
    full_name: d.fullName,
    email:     d.email || null,
    phone:     d.phone || null,
  });

  if (dbError) return { ok: false, error: dbError.message };

  await admin.from("studio_memberships").upsert(
    {
      user_id: userId,
      studio_id: studioId,
      role: "student",
      is_primary: true,
      linked_via: "admin",
      status: "active",
    },
    { onConflict: "user_id,studio_id" },
  );

  await logAuditEvent({
    studioId,
    actorId,
    actorRole,
    action: "student.created",
    targetType: "profile",
    targetId: userId,
    // Whether an invite email went out is the part that matters later: it is
    // the difference between a record created and a person given access.
    metadata: { invited: Boolean(d.email) },
  });

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  return { ok: true };
}

// ─── DELETE STUDENT ───────────────────────────────────────────────────────────
// Permanently removes the student profile and auth account (cascades enrollments,
// progress, guardianships, etc.). Clears event creator refs that would block delete.

export async function deleteStudent(studentId: string): Promise<ActionResult> {
  if (!studentId) return { ok: false, error: "Missing student ID" };

  const { error, studioId, userId: actorId, role: actorRole } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return {
      ok: false,
      error: "Deleting students requires SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Settings → API).",
    };
  }

  // full_name is selected for the audit entry, not for the delete: once the
  // auth user is gone the row is gone with it, and an entry that says only
  // "deleted <uuid>" cannot be read by the person who needs it a year later.
  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", studentId)
    .eq("studio_id", studioId)
    .eq("role", "student")
    .maybeSingle();

  if (profileErr) return { ok: false, error: profileErr.message };
  if (!profile) return { ok: false, error: "Student not found." };

  const { count: invoiceCount } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .eq("payer_id", studentId);

  if (invoiceCount && invoiceCount > 0) {
    return {
      ok: false,
      error: "This student has billing records as a payer and cannot be deleted.",
    };
  }

  await admin.from("events").update({ created_by: null }).eq("created_by", studentId);

  const { error: deleteErr } = await admin.auth.admin.deleteUser(studentId);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  await logAuditEvent({
    studioId,
    actorId,
    actorRole,
    action: "student.deleted",
    targetType: "profile",
    targetId: studentId,
    metadata: { fullName: profile.full_name ?? null },
  });

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  revalidatePath("/portal/admin/classes");
  return { ok: true };
}

// ─── UPDATE STUDENT ───────────────────────────────────────────────────────────

const UpdateStudentSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string().min(1).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
});

export async function updateStudent(input: unknown): Promise<ActionResult> {
  const parsed = UpdateStudentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { id, fullName, email, phone } = parsed.data;

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", id)
    .eq("studio_id", studioId)
    .eq("role", "student")
    .maybeSingle();
  if (!existing) return { ok: false, error: "Student not found." };

  if (email) {
    const { data: dup } = await supabase
      .from("profiles")
      .select("id")
      .eq("studio_id", studioId)
      .eq("email", email)
      .eq("role", "student")
      .neq("id", id)
      .maybeSingle();
    if (dup) return { ok: false, error: "Another student already uses this email." };
  }

  const { error: updateErr } = await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      email: email || null,
      phone: phone || null,
    })
    .eq("id", id);

  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  revalidatePath(`/portal/admin/students/${id}`);
  return { ok: true };
}

// ─── BULK UPDATE STUDENTS ─────────────────────────────────────────────────────

const BulkUpdateSchema = z.object({
  updates: z
    .array(UpdateStudentSchema)
    .min(1, "No students to update")
    .max(50, "Too many students at once (max 50)"),
});

export async function bulkUpdateStudents(
  input: unknown,
): Promise<{ ok: true; updated: number } | { ok: false; error: string; partial?: number }> {
  const parsed = BulkUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let updated = 0;
  let firstError: string | null = null;

  for (const row of parsed.data.updates) {
    const result = await updateStudent(row);
    if (result.ok) {
      updated += 1;
    } else if (!firstError) {
      firstError = result.error;
    }
  }

  if (updated === 0) {
    return { ok: false, error: firstError ?? "No students were updated." };
  }

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  return { ok: true, updated };
}

// ─── BULK DELETE STUDENTS ─────────────────────────────────────────────────────

const BulkDeleteSchema = z.object({
  studentIds: z.array(z.string().uuid()).min(1, "No students selected").max(50),
});

export type BulkDeleteResult =
  | { ok: true; deleted: number; failures: { id: string; name: string; error: string }[] }
  | { ok: false; error: string };

export async function bulkDeleteStudents(input: unknown): Promise<BulkDeleteResult> {
  const parsed = BulkDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId, userId: actorId, role: actorRole } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("studio_id", studioId)
    .eq("role", "student")
    .in("id", parsed.data.studentIds);

  const nameById = new Map(
    (profiles ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]),
  );

  let deleted = 0;
  const failures: { id: string; name: string; error: string }[] = [];

  for (const studentId of parsed.data.studentIds) {
    const result = await deleteStudent(studentId);
    if (result.ok) {
      deleted += 1;
    } else {
      failures.push({
        id: studentId,
        name: nameById.get(studentId) ?? "Unknown",
        error: result.error,
      });
    }
  }

  if (deleted === 0 && failures.length > 0) {
    return { ok: false, error: failures[0]?.error ?? "No students were deleted." };
  }

  // deleteStudent already logged one entry per student. This second, coarser
  // entry records the *decision* — one admin removing N children in a single
  // stroke — which is the shape of an incident, and which N separate entries
  // scattered among a day's activity do not show.
  await logAuditEvent({
    studioId,
    actorId,
    actorRole,
    action: "student.bulk_deleted",
    targetType: "profile",
    metadata: {
      requested: parsed.data.studentIds.length,
      deleted,
      failed: failures.length,
    },
  });

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  revalidatePath("/portal/admin/classes");
  return { ok: true, deleted, failures };
}

// ─── CREATE DRAFT INVOICE FROM CURRENT ENROLLMENTS ────────────────────────────
// Redrafts a fresh invoice for a student's currently-active enrollments through
// the same builder as the parent-facing enrol flow, so it prices on whatever
// model the studio charges on — per class, an hours ladder, or combos — and the
// studio's sibling discount applies when billing a guardian who has other
// actively-enrolled children. Always lands as a draft for admin review before
// sending — this exists for "we fixed the student's enrollments, now redraft
// the invoice" rather than the normal per-enrollment billing moment.

export async function createDraftInvoiceFromEnrollments(
  studentId: string,
): Promise<
  | { ok: true; invoiceId: string; xeroError?: string }
  | { ok: false; error: string }
> {
  if (!z.string().uuid().safeParse(studentId).success) {
    return { ok: false, error: "Invalid student." };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: student } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", studentId)
    .eq("studio_id", studioId)
    .eq("role", "student")
    .maybeSingle();
  if (!student) return { ok: false, error: "Student not found." };

  const { data: enrollmentRows } = await supabase
    .from("enrollments")
    .select("class_id, classes(id, name, price_cents, recurring_group_id, xero_account_code, xero_item_code)")
    .eq("student_id", studentId)
    .eq("studio_id", studioId)
    .eq("status", "active");

  type ClassInfo = {
    id: string;
    name: string;
    price_cents: number | null;
    recurring_group_id: string | null;
    xero_account_code: string | null;
    xero_item_code: string | null;
  };

  const classes = (enrollmentRows ?? [])
    .map((r) => (Array.isArray(r.classes) ? r.classes[0] : r.classes) as ClassInfo | null)
    .filter((c): c is ClassInfo => c !== null);

  if (classes.length === 0) {
    return { ok: false, error: "This student has no active enrollments to invoice." };
  }

  const { data: guardianships } = await supabase
    .from("guardianships")
    .select("guardian_id, is_primary")
    .eq("student_id", studentId)
    .eq("studio_id", studioId);

  const primaryGuardianId = (guardianships ?? []).find((g) => g.is_primary)?.guardian_id as
    | string
    | undefined;

  let payerId: string;
  let applySiblingDiscount: boolean;
  if (primaryGuardianId) {
    payerId = primaryGuardianId;
    applySiblingDiscount = true;
  } else if ((guardianships ?? []).length > 0) {
    return {
      ok: false,
      error: "This student has guardians but none is set as the primary payer.",
    };
  } else {
    payerId = studentId;
    applySiblingDiscount = false;
  }

  // One shared builder with the parent enrol flow — this used to be a
  // near-verbatim copy of it, which meant any change to how a line freezes its
  // price had to be made twice. It also means an admin billing a student gets
  // whatever pricing model the studio actually charges on.
  const context = await loadStudioTuitionContext(supabase, studioId);
  const quoted = await quoteEnrollment(
    supabase,
    studioId,
    studentId,
    classes.map((c) => c.id),
    { mode: null, payerId, applySiblingDiscount, context },
  );
  if (!quoted) return { ok: false, error: "Could not price this student's classes." };

  if (quoted.quote.totalCents <= 0) {
    return { ok: false, error: "Nothing billable — every enrolled class is fully covered already." };
  }

  const invoiceRes = await insertTuitionInvoice(supabase, {
    studioId,
    payerId,
    studentId,
    quote: quoted.quote,
    priced: quoted.priced,
    context,
    sendNow: false,
    xeroDescription:
      classes.length === 1 ? `Enrollment — ${classes[0].name}` : "Enrollment",
    fallbackError: "Could not create invoice.",
  });
  if (!invoiceRes.ok) return { ok: false, error: invoiceRes.error };

  const invoiceId = invoiceRes.invoiceId;

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/people");
  revalidatePath("/portal/admin/money");
  return { ok: true, invoiceId };
}
