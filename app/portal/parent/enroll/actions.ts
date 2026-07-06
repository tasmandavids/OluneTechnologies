"use server";

// ============================================================================
//  Parent enrollment server actions
//  Called from EnrollModal to drive the multi-step enrollment flow.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY, gstComponentCents } from "@/lib/currency";
import { siblingDiscountedCents } from "@/lib/discounts";
import { enrollmentBillableCents } from "@/lib/enrollment-billing";
import { xeroSyncOutstandingInvoice } from "@/lib/xero/webhook-sync";
import { getTranslations } from "@/lib/i18n/server";

// ─── Types ──────────────────────────────────────────────────────────────────

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AvailableClass = {
  id: string;
  name: string;
  discipline: string | null;
  level: string | null;
  dayOfWeek: number | null;
  startTime: string | null;
  capacity: number;
  enrolled: number;
  priceCents: number;
  /** Non-null only when this class is an explicit linked recurring series
   *  (e.g. a Mon/Wed/Fri programme created together) — the studio bills once
   *  per group, not per day. Never matched by class name. */
  recurringGroupId: string | null;
};

export type Waiver = {
  id: string;
  title: string;
  content: string;
  version: number;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const uuidField = z.string().uuid();

async function getEnrollmentContext() {
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notSignedIn"), supabase, userId: null, studioId: null, mode: null as null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role, self_managed")
    .eq("id", user.id)
    .single();

  if (profile?.role === "parent") {
    return {
      error: null,
      supabase,
      userId: user.id,
      studioId: profile.studio_id as string,
      mode: "parent" as const,
    };
  }

  if (profile?.role === "student" && profile.self_managed) {
    return {
      error: null,
      supabase,
      userId: user.id,
      studioId: profile.studio_id as string,
      mode: "self" as const,
    };
  }

  return { error: t("parentAccessRequired"), supabase, userId: null, studioId: null, mode: null };
}

async function assertStudentAccess(
  ctx: { mode: "parent" | "self" | null; userId: string | null; supabase: Awaited<ReturnType<typeof createClient>> },
  studentId: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  if (!ctx.userId) return t("unknown");
  if (ctx.mode === "self") {
    return ctx.userId === studentId ? null : t("notGuardian");
  }
  const { data: guardianship } = await ctx.supabase
    .from("guardianships")
    .select("guardian_id")
    .eq("guardian_id", ctx.userId)
    .eq("student_id", studentId)
    .single();
  return guardianship ? null : t("notGuardian");
}

// ─── Get available classes ───────────────────────────────────────────────────

export async function getAvailableClasses(): Promise<ActionResult<AvailableClass[]>> {
  const { error, supabase } = await getEnrollmentContext();
  if (error) return { ok: false, error };

  const { data, error: dbErr } = await supabase
    .from("class_capacity")
    .select("id, name, discipline, level, day_of_week, start_time, capacity, enrolled")
    .order("day_of_week")
    .order("start_time");

  if (dbErr) return { ok: false, error: dbErr.message };

  // Also fetch prices + recurring-group linkage from classes table
  const ids = (data ?? []).map((r) => r.id as string);
  const { data: priceData } = await supabase
    .from("classes")
    .select("id, price_cents, recurring_group_id")
    .in("id", ids);

  const priceMap = new Map((priceData ?? []).map((r) => [r.id, r.price_cents as number]));
  const groupMap = new Map((priceData ?? []).map((r) => [r.id, r.recurring_group_id as string | null]));

  const classes: AvailableClass[] = (data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    discipline: r.discipline as string | null,
    level: r.level as string | null,
    dayOfWeek: r.day_of_week as number | null,
    startTime: r.start_time ? (r.start_time as string).slice(0, 5) : null,
    capacity: Number(r.capacity ?? 0),
    enrolled: Number(r.enrolled ?? 0),
    priceCents: priceMap.get(r.id as string) ?? 0,
    recurringGroupId: groupMap.get(r.id as string) ?? null,
  }));

  return { ok: true, data: classes };
}

// ─── Get studio waivers ──────────────────────────────────────────────────────

export async function getActiveWaivers(): Promise<ActionResult<Waiver[]>> {
  const { error, supabase } = await getEnrollmentContext();
  if (error) return { ok: false, error };

  const { data, error: dbErr } = await supabase
    .from("waivers")
    .select("id, title, content, version")
    .eq("active", true)
    .eq("required", true)
    .order("created_at");

  if (dbErr) return { ok: false, error: dbErr.message };

  return {
    ok: true,
    data: (data ?? []).map((w) => ({
      id: w.id as string,
      title: w.title as string,
      content: w.content as string,
      version: w.version as number,
    })),
  };
}

// ─── Sign a waiver for a student ────────────────────────────────────────────

export async function signWaiver(
  waiverId: string,
  studentId: string,
  waiverVersion: number,
): Promise<ActionResult> {
  const t = await getTranslations("errors.actions");
  const ctx = await getEnrollmentContext();
  const { error, supabase, userId, studioId } = ctx;
  if (error || !userId || !studioId) return { ok: false, error: error ?? t("unknown") };

  const accessErr = await assertStudentAccess(ctx, studentId, t);
  if (accessErr) return { ok: false, error: accessErr };

  // Upsert — idempotent if already signed this version
  const { error: dbErr } = await supabase
    .from("waiver_signatures")
    .upsert(
      {
        waiver_id: waiverId,
        student_id: studentId,
        signed_by: userId,
        waiver_version: waiverVersion,
      },
      { onConflict: "waiver_id,student_id,waiver_version", ignoreDuplicates: true },
    );

  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true, data: null };
}

// ─── Enroll a student in a class ────────────────────────────────────────────

export async function enrollChildInClass(
  studentId: string,
  classId: string,
): Promise<ActionResult<{ enrollmentId: string; waitlisted: boolean }>> {
  const t = await getTranslations("errors.actions");
  const ctx = await getEnrollmentContext();
  const { error, supabase, userId, studioId } = ctx;
  if (error || !userId || !studioId) return { ok: false, error: error ?? t("unknown") };
  if (!uuidField.safeParse(studentId).success || !uuidField.safeParse(classId).success) {
    return { ok: false, error: t("invalidStudentOrClass") };
  }

  const accessErr = await assertStudentAccess(ctx, studentId, t);
  if (accessErr) return { ok: false, error: accessErr };

  // Check for existing enrollment
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("class_id", classId)
    .single();

  if (existing?.status === "active") {
    return { ok: false, error: t("alreadyEnrolled") };
  }

  // Check capacity
  const { data: cap } = await supabase
    .from("class_capacity")
    .select("capacity, enrolled")
    .eq("id", classId)
    .single();

  const isFull = cap ? Number(cap.enrolled) >= Number(cap.capacity) : false;
  const status = isFull ? "waitlisted" : "active";

  const { data: enrollment, error: dbErr } = await supabase
    .from("enrollments")
    .insert({
      studio_id: studioId,
      student_id: studentId,
      class_id: classId,
      status,
    })
    .select("id")
    .single();

  if (dbErr) return { ok: false, error: dbErr.message };

  revalidatePath("/portal/parent");
  revalidatePath("/portal/student");
  return {
    ok: true,
    data: {
      enrollmentId: enrollment.id as string,
      waitlisted: isFull,
    },
  };
}

async function enrollmentChargeCents(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  userId: string,
  studentId: string,
  priceCents: number,
  mode: "parent" | "self" | null,
  classId: string,
) {
  const baseCents = await enrollmentBillableCents(supabase, studentId, classId, priceCents);
  if (baseCents <= 0) return 0;

  return mode === "self"
    ? baseCents
    : siblingDiscountedCents(supabase, studioId, userId, studentId, baseCents);
}

export async function getEnrollmentBillingQuote(
  studentId: string,
  priceCents: number,
  classId: string,
): Promise<ActionResult<{ billableCents: number; includedInProgramme: boolean }>> {
  const t = await getTranslations("errors.actions");
  const ctx = await getEnrollmentContext();
  const { error, supabase, userId, studioId, mode } = ctx;
  if (error || !userId || !studioId) return { ok: false, error: error ?? t("unknown") };
  if (!uuidField.safeParse(studentId).success || !uuidField.safeParse(classId).success) {
    return { ok: false, error: t("invalidStudentOrClass") };
  }

  const accessErr = await assertStudentAccess(ctx, studentId, t);
  if (accessErr) return { ok: false, error: accessErr };

  const billableCents = await enrollmentChargeCents(
    supabase,
    studioId,
    userId,
    studentId,
    priceCents,
    mode,
    classId,
  );

  return {
    ok: true,
    data: {
      billableCents,
      includedInProgramme: priceCents > 0 && billableCents === 0,
    },
  };
}

/**
 * Shared write path for an enrollment invoice: creates one `invoices` row and
 * one `invoice_line_items` row per billable class. Used by the pay-later flow
 * (one call per enrollment session, N classes, always a draft — see
 * `sendNow` below), the pay-monthly flow (one call, N classes, sent
 * immediately because it's about to be folded into an active term payment
 * plan that starts charging the card right away), and the pay-now flow (one
 * call, one class, sent immediately) — so a parent enrolling in several
 * classes at once gets a single itemized invoice instead of one flat-amount
 * invoice per class.
 *
 * `sendNow` controls whether this lands as a draft awaiting manual review
 * (pay-later — nothing has been charged yet, so nothing should go out to the
 * parent until an admin checks it) or as sent immediately (pay-now /
 * pay-monthly — the parent is already being charged as part of enrolling, so
 * there's no meaningful "draft" moment to insert). Either way the invoice is
 * synced to Xero immediately as a Xero Draft — Xero always mirrors Olune's
 * own draft state — and later sending it (via sendInvoiceNow) flips that
 * existing Xero draft to Authorised rather than creating a second copy.
 */
async function insertEnrollmentInvoice(
  supabase: Awaited<ReturnType<typeof createClient>>,
  studioId: string,
  userId: string,
  studentId: string,
  charges: { classId: string; className: string; chargeCents: number }[],
  sendNow: boolean,
  t: Awaited<ReturnType<typeof getTranslations>>,
) {
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7);

  const totalCents = charges.reduce((sum, c) => sum + c.chargeCents, 0);
  const now = new Date().toISOString();

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      studio_id: studioId,
      payer_id: userId,
      student_id: studentId,
      amount_cents: totalCents,
      gst_cents: gstComponentCents(totalCents),
      status: sendNow ? "sent" : "draft",
      due_date: dueDate.toISOString().slice(0, 10),
      issued_at: sendNow ? now : null,
    })
    .select("id")
    .single();

  if (invErr || !invoice) {
    return { ok: false as const, error: invErr?.message ?? t("couldNotCreateInvoice") };
  }

  const invoiceId = invoice.id as string;

  const { data: classRows } = await supabase
    .from("classes")
    .select("id, xero_account_code, xero_item_code")
    .in("id", charges.map((c) => c.classId));
  const accountCodeByClassId = new Map(
    (classRows ?? []).map((c) => [c.id as string, c.xero_account_code as string | null]),
  );
  const itemCodeByClassId = new Map(
    (classRows ?? []).map((c) => [c.id as string, c.xero_item_code as string | null]),
  );

  await supabase.from("invoice_line_items").insert(
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

  await xeroSyncOutstandingInvoice(supabase, invoiceId, {
    lineDescription:
      charges.length === 1 ? `Enrollment — ${charges[0].className}` : "Enrollment",
  });

  return { ok: true as const, invoiceId };
}

// ─── Create invoice only (pay later — no Stripe charge at enrollment) ───────
//  `sendNow` distinguishes true pay-later (draft, admin sends manually later)
//  from pay-monthly (sent immediately — see insertEnrollmentInvoice above).

export async function createEnrollmentPayLaterInvoice(
  studentId: string,
  classes: { classId: string; className: string; priceCents: number }[],
  sendNow: boolean,
): Promise<ActionResult<{ invoiceId?: string; billingSkipped?: boolean }>> {
  const t = await getTranslations("errors.actions");
  const ctx = await getEnrollmentContext();
  const { error, supabase, userId, studioId, mode } = ctx;
  if (error || !userId || !studioId) return { ok: false, error: error ?? t("unknown") };
  if (
    !uuidField.safeParse(studentId).success ||
    !classes.length ||
    classes.some((c) => !uuidField.safeParse(c.classId).success)
  ) {
    return { ok: false, error: t("invalidStudentOrClass") };
  }

  const accessErr = await assertStudentAccess(ctx, studentId, t);
  if (accessErr) return { ok: false, error: accessErr };

  const charges: { classId: string; className: string; chargeCents: number }[] = [];
  for (const cls of classes) {
    if (cls.priceCents <= 0) continue;
    const chargeCents = await enrollmentChargeCents(
      supabase,
      studioId,
      userId,
      studentId,
      cls.priceCents,
      mode,
      cls.classId,
    );
    if (chargeCents > 0) charges.push({ classId: cls.classId, className: cls.className, chargeCents });
  }

  if (!charges.length) {
    revalidatePath("/portal/parent");
    revalidatePath("/portal/student");
    revalidatePath("/portal/parent/billing");
    return { ok: true, data: { billingSkipped: true } };
  }

  const invoiceRes = await insertEnrollmentInvoice(supabase, studioId, userId, studentId, charges, sendNow, t);
  if (!invoiceRes.ok) return { ok: false, error: invoiceRes.error };

  revalidatePath("/portal/parent");
  revalidatePath("/portal/student");
  revalidatePath("/portal/parent/billing");
  return { ok: true, data: { invoiceId: invoiceRes.invoiceId } };
}

// ─── Create invoice + PaymentIntent for a paid enrollment ────────────────────
//  Returns a Stripe clientSecret consumed by the EnrollModal <CheckoutForm />.
//  The payment_intent.succeeded webhook (metadata.invoice_id) marks the invoice
//  paid and records the payment row server-side.

export async function createEnrollmentIntent(
  studentId: string,
  classId: string,
  className: string,
  priceCents: number,
): Promise<
  ActionResult<
    { clientSecret: string; invoiceId: string } | { billingSkipped: true }
  >
> {
  const t = await getTranslations("errors.actions");
  const ctx = await getEnrollmentContext();
  const { error, supabase, userId, studioId, mode } = ctx;
  if (error || !userId || !studioId) return { ok: false, error: error ?? t("unknown") };
  if (!uuidField.safeParse(studentId).success || !uuidField.safeParse(classId).success) {
    return { ok: false, error: t("invalidStudentOrClass") };
  }
  if (priceCents <= 0) return { ok: false, error: t("classNoFee") };

  const accessErr = await assertStudentAccess(ctx, studentId, t);
  if (accessErr) return { ok: false, error: accessErr };

  const chargeCents = await enrollmentChargeCents(
    supabase,
    studioId,
    userId,
    studentId,
    priceCents,
    mode,
    classId,
  );

  if (chargeCents <= 0) {
    revalidatePath("/portal/parent");
    revalidatePath("/portal/student");
    revalidatePath("/portal/parent/billing");
    return { ok: true, data: { billingSkipped: true } };
  }

  const invoiceRes = await insertEnrollmentInvoice(
    supabase,
    studioId,
    userId,
    studentId,
    [{ classId, className, chargeCents }],
    true,
    t,
  );
  if (!invoiceRes.ok) return { ok: false, error: invoiceRes.error };

  // Resolve / create the Stripe customer.
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, full_name")
    .eq("id", userId)
    .single();

  const { stripe } = await import("@/lib/stripe");

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      name: profile?.full_name || undefined,
      metadata: { supabase_user_id: userId, studio_id: studioId },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", userId);
  }

  const intent = await stripe.paymentIntents.create({
    amount: chargeCents,
    currency: CURRENCY,
    customer: customerId,
    description: `Enrollment — ${className}`,
    metadata: {
      invoice_id: invoiceRes.invoiceId,
      studio_id: studioId,
      supabase_user_id: userId,
      student_id: studentId,
      class_id: classId,
    },
  });

  await supabase
    .from("invoices")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", invoiceRes.invoiceId);

  if (!intent.client_secret) return { ok: false, error: t("stripeNoClientSecret") };

  return {
    ok: true,
    data: { clientSecret: intent.client_secret, invoiceId: invoiceRes.invoiceId },
  };
}
