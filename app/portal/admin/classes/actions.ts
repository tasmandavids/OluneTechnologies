"use server";

// ============================================================================
//  Admin · Classes server actions
//  create / update / archive a class within the admin's studio.
// ============================================================================

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getAdminStudio } from "@/lib/portal/access";
import { loadProduct } from "@/lib/billing/catalog";
import { CLASS_PRICING_MODELS, createClassProduct } from "@/lib/billing/class-product";

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

/**
 * How this class is billed. Not optional on create: a class is something the
 * studio sells, so it always ends up in the catalogue as well as in `classes`
 * (see lib/billing/class-product.ts). The old free-typed "price in cents with
 * no product" path is gone — it produced classes with no tax treatment and no
 * ledger code, which only surfaced when an invoice reached Xero.
 */
const ClassBillingSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("existing"),
    productId: z.string().uuid("Pick a product for this class"),
  }),
  z.object({
    mode: z.literal("new"),
    /** Defaults to the class name. */
    name: z.string().trim().max(120).optional(),
    code: z.string().trim().max(40).optional(),
    priceCents: z.coerce.number().int().min(0).max(100_000_00),
    pricingModel: z.enum(CLASS_PRICING_MODELS).optional(),
    accountCode: z.string().trim().max(40).optional(),
    itemCode: z.string().trim().max(40).optional(),
  }),
]);

/** The scheduling half — when it runs, how many fit, who teaches it. */
const ClassCoreSchema = z.object({
  name:       z.string().min(1, "Name is required").max(100),
  discipline: z.string().max(80).optional(),
  level:      z.string().max(80).optional(),
  room:       z.string().max(80).optional(),
  dayOfWeek:  z.coerce.number().int().min(0).max(6),
  startTime:  z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format").optional(),
  endTime:    z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format").optional().or(z.literal("")),
  capacity:   z.coerce.number().int().min(1).max(500),
  teacherId:  z.string().uuid().optional().or(z.literal("")),
});

const ClassSchema = ClassCoreSchema.extend({ billing: ClassBillingSchema });

/**
 * Editing a class never sets a price. Money lives on the product and is edited
 * in Money → Products; `billing` is accepted here only so a class can be
 * pointed at a different product (or given its first one, for a legacy class
 * that predates the catalogue).
 */
const ClassUpdateSchema = ClassCoreSchema.extend({ billing: ClassBillingSchema.optional() });

export type ClassFormData = z.infer<typeof ClassSchema>;
export type ClassBillingInput = z.infer<typeof ClassBillingSchema>;
export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Turn the billing choice into a product id + the price to mirror onto
 * classes.price_cents. `createdProductId` is set only when a product was made
 * for this call, so a failed class insert can take it back out again.
 */
type ResolvedBilling = {
  productId: string;
  priceCents: number;
  createdProductId: string | null;
};

async function resolveBilling(
  supabase: SupabaseClient,
  studioId: string,
  className: string,
  billing: ClassBillingInput,
): Promise<{ ok: true; data: ResolvedBilling } | { ok: false; error: string }> {
  if (billing.mode === "existing") {
    // Re-read tenant-scoped: the price is never taken from the client, and a
    // product id from another studio must not resolve at all.
    const product = await loadProduct(supabase, studioId, billing.productId);
    if (!product) return { ok: false, error: "That product no longer exists." };
    return {
      ok: true,
      data: { productId: product.id, priceCents: product.unitAmountCents, createdProductId: null },
    };
  }

  const created = await createClassProduct(supabase, studioId, className, billing);
  if (!created.ok) return { ok: false, error: created.error };

  return {
    ok: true,
    data: {
      productId: created.product.productId,
      priceCents: created.product.unitAmountCents,
      createdProductId: created.product.productId,
    },
  };
}

/** Undo a just-created product when the class insert it was made for failed. */
async function rollbackProduct(
  supabase: SupabaseClient,
  studioId: string,
  productId: string | null,
) {
  if (!productId) return;
  await supabase.from("billing_products").delete().eq("id", productId).eq("studio_id", studioId);
}

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

  const billing = await resolveBilling(supabase, studioId, d.name, d.billing);
  if (!billing.ok) return { ok: false, error: billing.error };

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
    price_cents: billing.data.priceCents,
    product_id:  billing.data.productId,
    teacher_id:  d.teacherId || null,
  });

  if (dbError) {
    await rollbackProduct(supabase, studioId, billing.data.createdProductId);
    return { ok: false, error: dbError.message };
  }

  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin");
  revalidatePath("/portal/admin/money");
  return { ok: true };
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────

export async function updateClass(
  classId: string,
  input: unknown,
): Promise<ActionResult> {
  if (!classId) return { ok: false, error: "Missing class ID" };

  const parsed = ClassUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const d = parsed.data;

  // Price and ledger coding are deliberately absent: they belong to the
  // product now. Only the link itself can change from here, and only when the
  // form actually sent one.
  const billing = d.billing
    ? await resolveBilling(supabase, studioId, d.name, d.billing)
    : null;
  if (billing && !billing.ok) return { ok: false, error: billing.error };

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
      teacher_id:  d.teacherId || null,
      ...(billing?.ok
        ? { product_id: billing.data.productId, price_cents: billing.data.priceCents }
        : {}),
    })
    .eq("id", classId)
    .eq("studio_id", studioId);

  if (dbError) {
    if (billing?.ok) await rollbackProduct(supabase, studioId, billing.data.createdProductId);
    return { ok: false, error: dbError.message };
  }

  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin");
  if (billing?.ok) revalidatePath("/portal/admin/money");
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

  // One product for the whole series — a Mon/Wed/Fri Ballet is one thing the
  // family buys, and lib/enrollment-billing.ts already bills a series once.
  const billing = await resolveBilling(supabase, studioId, d.name, d.billing);
  if (!billing.ok) return { ok: false, error: billing.error };

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
    price_cents:        billing.data.priceCents,
    product_id:         billing.data.productId,
    teacher_id:         d.teacherId || null,
  }));

  const { error: dbError } = await supabase.from("classes").insert(rows);
  if (dbError) {
    await rollbackProduct(supabase, studioId, billing.data.createdProductId);
    return { ok: false, error: dbError.message };
  }

  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin/money");
  return { ok: true };
}

// ─── LINK TO SERIES ─────────────────────────────────────────────────────────
//  Attaches an existing class to another class's recurring_group_id (or
//  starts a new group between two standalone classes), so a client can build
//  a series out of classes that already exist instead of recreating them.

export type SeriesSelection =
  | { type: "none" }
  | { type: "group"; groupId: string }
  | { type: "class"; classId: string };

export async function linkClassToSeries(
  classId: string,
  selection: SeriesSelection,
): Promise<ActionResult> {
  if (!classId) return { ok: false, error: "Missing class ID" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  let groupId: string | null;

  if (selection.type === "none") {
    groupId = null;
  } else if (selection.type === "group") {
    groupId = selection.groupId;
  } else {
    const { data: target } = await supabase
      .from("classes")
      .select("id, recurring_group_id")
      .eq("id", selection.classId)
      .eq("studio_id", studioId)
      .single();

    if (!target) return { ok: false, error: "Class not found." };

    if (target.recurring_group_id) {
      groupId = target.recurring_group_id as string;
    } else {
      groupId = crypto.randomUUID();
      const { error: linkErr } = await supabase
        .from("classes")
        .update({ recurring_group_id: groupId })
        .eq("id", target.id)
        .eq("studio_id", studioId);
      if (linkErr) return { ok: false, error: linkErr.message };
    }
  }

  const { error: dbError } = await supabase
    .from("classes")
    .update({ recurring_group_id: groupId })
    .eq("id", classId)
    .eq("studio_id", studioId);

  if (dbError) return { ok: false, error: dbError.message };

  revalidatePath("/portal/admin/classes");
  revalidatePath("/portal/admin");
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
