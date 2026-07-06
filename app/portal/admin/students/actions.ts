"use server";

// ============================================================================
//  Admin · Students server actions
//  enroll / unenroll a student, add a new student profile.
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudioOpsStudio } from "@/lib/portal/access";
import { gstComponentCents } from "@/lib/currency";
import { batchEnrollmentBillableCents } from "@/lib/enrollment-billing";
import { siblingDiscountedCents } from "@/lib/discounts";
import { xeroSyncOutstandingInvoice } from "@/lib/xero/webhook-sync";

async function getAdminStudio() {
  const ctx = await getStudioOpsStudio();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
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

  // Check capacity
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

  revalidatePath("/portal/admin/students");
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

  revalidatePath("/portal/admin/students");
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

  const { error, studioId } = await getAdminStudio();
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
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/welcome`,
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

  revalidatePath("/portal/admin/students");
  return { ok: true };
}

// ─── DELETE STUDENT ───────────────────────────────────────────────────────────
// Permanently removes the student profile and auth account (cascades enrollments,
// progress, guardianships, etc.). Clears event creator refs that would block delete.

export async function deleteStudent(studentId: string): Promise<ActionResult> {
  if (!studentId) return { ok: false, error: "Missing student ID" };

  const { error, studioId } = await getAdminStudio();
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

  const { data: profile, error: profileErr } = await admin
    .from("profiles")
    .select("id, role")
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

  revalidatePath("/portal/admin/students");
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

  const { error, supabase, studioId } = await getAdminStudio();
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

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/classes");
  return { ok: true, deleted, failures };
}

// ─── CREATE DRAFT INVOICE FROM CURRENT ENROLLMENTS ────────────────────────────
// Redrafts a fresh invoice for a student's currently-active enrollments, using
// the same per-class pricing rules as the parent-facing enroll flow: linked
// recurring-series siblings bill once (batchEnrollmentBillableCents), and the
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

  const baseCentsByClassId = await batchEnrollmentBillableCents(
    supabase,
    studentId,
    classes.map((c) => ({ classId: c.id, priceCents: c.price_cents ?? 0 })),
  );

  const charges: { classId: string; className: string; chargeCents: number }[] = [];
  for (const cls of classes) {
    const baseCents = baseCentsByClassId.get(cls.id) ?? 0;
    if (baseCents <= 0) continue;
    const chargeCents = applySiblingDiscount
      ? await siblingDiscountedCents(supabase, studioId, payerId, studentId, baseCents)
      : baseCents;
    if (chargeCents > 0) charges.push({ classId: cls.id, className: cls.name, chargeCents });
  }

  if (charges.length === 0) {
    return { ok: false, error: "Nothing billable — every enrolled class is fully covered already." };
  }

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);
  const totalCents = charges.reduce((sum, c) => sum + c.chargeCents, 0);

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      studio_id: studioId,
      payer_id: payerId,
      student_id: studentId,
      amount_cents: totalCents,
      gst_cents: gstComponentCents(totalCents),
      status: "draft",
      due_date: dueDate.toISOString().slice(0, 10),
      issued_at: null,
    })
    .select("id")
    .single();

  if (invErr || !invoice) return { ok: false, error: invErr?.message ?? "Could not create invoice." };

  const invoiceId = invoice.id as string;
  const accountCodeByClassId = new Map(classes.map((c) => [c.id, c.xero_account_code]));
  const itemCodeByClassId = new Map(classes.map((c) => [c.id, c.xero_item_code]));

  const { error: lineItemsErr } = await supabase.from("invoice_line_items").insert(
    charges.map((c, idx) => ({
      invoice_id: invoiceId,
      item_type: "class",
      reference_id: c.classId,
      description: c.className,
      quantity: 1,
      unit_cents: c.chargeCents,
      line_total_cents: c.chargeCents,
      sort_order: idx,
      account_code: accountCodeByClassId.get(c.classId) ?? null,
      item_code: itemCodeByClassId.get(c.classId) ?? null,
    })),
  );
  if (lineItemsErr) return { ok: false, error: lineItemsErr.message };

  const xero = await xeroSyncOutstandingInvoice(supabase, invoiceId, {
    lineDescription: charges.length === 1 ? `Enrollment — ${charges[0].className}` : "Enrollment",
  });

  revalidatePath("/portal/admin/students");
  revalidatePath("/portal/admin/billing");
  return { ok: true, invoiceId, xeroError: xero.ok ? undefined : xero.error };
}
