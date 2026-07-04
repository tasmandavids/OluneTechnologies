"use server";

// ============================================================================
//  Admin · Classes server actions
//  create / update / archive a class within the admin's studio.
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getAdminStudio } from "@/lib/portal/access";

// ─── helpers ────────────────────────────────────────────────────────────────

// Archive the reusable Stripe Product(s) backing the given class rows so a
// deleted class doesn't leave an active, orphaned Product + Price behind.
// Archiving the Product also deactivates its Prices. Non-fatal on failure.
async function archiveClassStripeProducts(productIds: (string | null | undefined)[]) {
  const ids = productIds.filter((id): id is string => !!id);
  if (ids.length === 0) return;
  try {
    const { stripe } = await import("@/lib/stripe");
    await Promise.all(
      ids.map((id) =>
        stripe.products.update(id, { active: false }).catch((e) => {
          console.warn(`[classes] could not archive Stripe product ${id}:`, e);
        }),
      ),
    );
  } catch (e) {
    console.warn("[classes] Stripe unavailable while archiving products:", e);
  }
}

// ─── validation schema ───────────────────────────────────────────────────────

const ClassSchema = z.object({
  name:       z.string().min(1, "Name is required").max(100),
  discipline: z.string().max(80).optional(),
  level:      z.string().max(80).optional(),
  room:       z.string().max(80).optional(),
  dayOfWeek:  z.coerce.number().int().min(0).max(6),
  startTime:  z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format").optional(),
  endTime:    z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format").optional().or(z.literal("")),
  capacity:   z.coerce.number().int().min(1).max(500),
  priceCents: z.coerce.number().int().min(0),
  teacherId:  z.string().uuid().optional().or(z.literal("")),
});

export type ClassFormData = z.infer<typeof ClassSchema>;
export type ActionResult = { ok: true } | { ok: false; error: string };

export type ClassEnrollmentRow = {
  studentId: string;
  name: string | null;
  email: string | null;
  status: "active" | "waitlisted";
  enrolledAt: string;
};

export type ClassEnrollmentsResult =
  | { ok: true; data: ClassEnrollmentRow[] }
  | { ok: false; error: string };

export type StudentOption = {
  studentId: string;
  name: string | null;
  email: string | null;
};

export type StudentOptionsResult =
  | { ok: true; data: StudentOption[] }
  | { ok: false; error: string };

// ─── ENROLLMENTS FOR A CLASS ─────────────────────────────────────────────────

export async function getClassEnrollments(classId: string): Promise<ClassEnrollmentsResult> {
  if (!classId) return { ok: false, error: "Missing class ID" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: cls } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("studio_id", studioId)
    .single();

  if (!cls) return { ok: false, error: "Class not found." };

  const { data: rows, error: dbError } = await supabase
    .from("enrollments")
    .select(`
      student_id, status, enrolled_at,
      profiles!student_id ( full_name, email )
    `)
    .eq("class_id", classId)
    .eq("studio_id", studioId)
    .in("status", ["active", "waitlisted"])
    .order("status")
    .order("enrolled_at");

  if (dbError) return { ok: false, error: dbError.message };

  const data: ClassEnrollmentRow[] = (rows ?? [])
    .map((r) => {
      const profile = r.profiles as unknown as { full_name: string | null; email: string | null } | null;
      return {
        studentId: r.student_id as string,
        name: profile?.full_name ?? null,
        email: profile?.email ?? null,
        status: r.status as "active" | "waitlisted",
        enrolledAt: r.enrolled_at as string,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

  return { ok: true, data };
}

// ─── STUDENTS NOT YET IN CLASS (for enroll dropdown) ─────────────────────────

export async function getStudentsNotInClass(classId: string): Promise<StudentOptionsResult> {
  if (!classId) return { ok: false, error: "Missing class ID" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: cls } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("studio_id", studioId)
    .single();

  if (!cls) return { ok: false, error: "Class not found." };

  const [profilesRes, enrolledRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("studio_id", studioId)
      .eq("role", "student")
      .order("full_name"),
    supabase
      .from("enrollments")
      .select("student_id")
      .eq("class_id", classId)
      .eq("studio_id", studioId)
      .in("status", ["active", "waitlisted"]),
  ]);

  if (profilesRes.error) return { ok: false, error: profilesRes.error.message };

  const enrolledIds = new Set(
    (enrolledRes.data ?? []).map((r) => r.student_id as string),
  );

  const data: StudentOption[] = (profilesRes.data ?? [])
    .filter((p) => !enrolledIds.has(p.id))
    .map((p) => ({
      studentId: p.id,
      name: p.full_name,
      email: p.email,
    }));

  return { ok: true, data };
}

// ─── CREATE ─────────────────────────────────────────────────────────────────

export async function createClass(input: unknown): Promise<ActionResult> {
  const parsed = ClassSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const d = parsed.data;

  const { error: dbError } = await supabase.from("classes").insert({
    studio_id:   studioId,
    name:        d.name,
    discipline:  d.discipline || null,
    level:       d.level || null,
    room:        d.room || null,
    day_of_week: d.dayOfWeek,
    start_time:  d.startTime || null,
    end_time:    d.endTime || null,
    capacity:    d.capacity,
    price_cents: d.priceCents,
    teacher_id:  d.teacherId || null,
  });

  if (dbError) return { ok: false, error: dbError.message };

  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin");
  return { ok: true };
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────

export async function updateClass(
  classId: string,
  input: unknown,
): Promise<ActionResult> {
  if (!classId) return { ok: false, error: "Missing class ID" };

  const parsed = ClassSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const d = parsed.data;

  const { error: dbError } = await supabase
    .from("classes")
    .update({
      name:        d.name,
      discipline:  d.discipline || null,
      level:       d.level || null,
      room:        d.room || null,
      day_of_week: d.dayOfWeek,
      start_time:  d.startTime || null,
      end_time:    d.endTime || null,
      capacity:    d.capacity,
      price_cents: d.priceCents,
      teacher_id:  d.teacherId || null,
    })
    .eq("id", classId)
    .eq("studio_id", studioId);

  if (dbError) return { ok: false, error: dbError.message };

  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin");
  return { ok: true };
}

// ─── CREATE RECURRING (multi-day) ─────────────────────────────────────────────
//  Generates one weekly class row per selected weekday, all sharing a single
//  recurring_group_id. A Mon/Wed/Fri 4pm Ballet becomes 3 linked rows.

const RecurringSchema = ClassSchema.omit({ dayOfWeek: true }).extend({
  days: z.array(z.coerce.number().int().min(0).max(6)).min(1, "Pick at least one day"),
});

export async function createRecurringClasses(input: unknown): Promise<ActionResult> {
  const parsed = RecurringSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const d = parsed.data;
  // De-duplicate weekdays so the same day isn't generated twice.
  const days = Array.from(new Set(d.days));
  const groupId = crypto.randomUUID();

  const rows = days.map((day) => ({
    studio_id:          studioId,
    recurring_group_id: groupId,
    name:               d.name,
    discipline:         d.discipline || null,
    level:              d.level || null,
    room:               d.room || null,
    day_of_week:        day,
    start_time:         d.startTime || null,
    end_time:           d.endTime || null,
    capacity:           d.capacity,
    price_cents:        d.priceCents,
    teacher_id:         d.teacherId || null,
  }));

  const { error: dbError } = await supabase.from("classes").insert(rows);
  if (dbError) return { ok: false, error: dbError.message };

  revalidatePath("/portal/admin/classes");
  return { ok: true };
}

// ─── DELETE WHOLE RECURRING GROUP ─────────────────────────────────────────────

export async function deleteRecurringGroup(groupId: string): Promise<ActionResult> {
  if (!groupId) return { ok: false, error: "Missing group ID" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  // Capture Stripe product ids before deletion so we can archive them after.
  const { data: rows } = await supabase
    .from("classes")
    .select("stripe_product_id")
    .eq("recurring_group_id", groupId)
    .eq("studio_id", studioId);

  const { error: dbError } = await supabase
    .from("classes")
    .delete()
    .eq("recurring_group_id", groupId)
    .eq("studio_id", studioId);

  if (dbError) return { ok: false, error: dbError.message };

  await archiveClassStripeProducts((rows ?? []).map((r) => r.stripe_product_id as string | null));

  revalidatePath("/portal/admin/classes");
  return { ok: true };
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function deleteClass(classId: string): Promise<ActionResult> {
  if (!classId) return { ok: false, error: "Missing class ID" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  // Capture the Stripe product id before deletion so we can archive it after.
  const { data: row } = await supabase
    .from("classes")
    .select("stripe_product_id")
    .eq("id", classId)
    .eq("studio_id", studioId)
    .single();

  const { error: dbError } = await supabase
    .from("classes")
    .delete()
    .eq("id", classId)
    .eq("studio_id", studioId);

  if (dbError) return { ok: false, error: dbError.message };

  await archiveClassStripeProducts([row?.stripe_product_id as string | null]);

  revalidatePath("/portal/admin/classes");
  return { ok: true };
}
