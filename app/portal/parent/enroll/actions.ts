"use server";

// ============================================================================
//  Parent enrollment server actions
//  Called from EnrollModal to drive the multi-step enrollment flow.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { insertTuitionInvoice, quoteEnrollment } from "@/lib/billing/tuition-invoice";
import { loadStudioTuitionContext } from "@/lib/billing/tuition-model";
import type { TuitionPricingModel, TuitionQuote } from "@/lib/billing/tuition-quote";
import type { HoursLadder } from "@/lib/billing/hours-ladder";
import type { ComboDefinition } from "@/lib/billing/combo-match";
import { loadStudioClassPrice, loadStudioClassPrices } from "@/lib/enrollment-class-price";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { resolveDestinationCharge } from "@/lib/stripe/connect";
import { currentTuitionPeriod, invoicedTuitionCents } from "@/lib/billing/tuition-ledger";
import { siblingDiscountInfo } from "@/lib/discounts";
import { getTranslations } from "@/lib/i18n/server";
import { getParentStudio } from "@/lib/portal/access";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

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
  /** Weekly hours. Shown instead of a price when the studio charges by hours. */
  hours: number;
  productId: string | null;
  /** Non-null only when this class is an explicit linked recurring series
   *  (e.g. a Mon/Wed/Fri programme created together) — the studio bills once
   *  per group, not per day. Never matched by class name. */
  recurringGroupId: string | null;
};

/**
 * The studio-level half of a live quote, so the wizard can price a basket in
 * the browser with the same function the server bills with.
 *
 * Everything here is already member-readable under RLS, so nothing is exposed
 * that a parent couldn't read anyway — and the server still re-prices from the
 * database before writing a single cent.
 */
export type ClientTuitionContext = {
  model: TuitionPricingModel;
  ladder: HoursLadder | null;
  ladderProductName: string | null;
  combos: ComboDefinition[];
};

/** The per-dancer half. Fetched once the wizard knows whose enrolment it is. */
export type DancerTuitionState = {
  existing: {
    classId: string;
    name: string;
    productId: string | null;
    priceCents: number;
    hours: number;
    recurringGroupId: string | null;
  }[];
  priorInvoicedCents: number;
  siblingDiscountPct: number;
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
  const ctx = await getParentStudio();
  if (ctx.error || !ctx.userId || !ctx.studioId || !ctx.mode) {
    return {
      error: ctx.error === "Not signed in." ? t("notSignedIn")
        : ctx.error === "Parent access required." ? t("parentAccessRequired")
        : ctx.error === "No studio found." ? t("noStudioFound")
        : (ctx.error ?? t("unknown")),
      supabase: ctx.supabase,
      userId: null as string | null,
      studioId: null as string | null,
      mode: null as null,
    };
  }
  return {
    error: null as string | null,
    supabase: ctx.supabase,
    userId: ctx.userId,
    studioId: ctx.studioId,
    mode: ctx.mode,
  };
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

export async function getAvailableClasses(): Promise<
  ActionResult<{ classes: AvailableClass[]; tuition: ClientTuitionContext }>
> {
  const { error, supabase, studioId } = await getEnrollmentContext();
  if (error || !studioId) return { ok: false, error: error ?? "No studio found." };

  const { data, error: dbErr } = await supabase
    .from("class_capacity")
    .select("id, name, discipline, level, day_of_week, start_time, capacity, enrolled")
    .order("day_of_week")
    .order("start_time");

  if (dbErr) return { ok: false, error: dbErr.message };

  // Prices come from the same server-authoritative loader the enrolment charge
  // uses, so the quote a parent sees can't drift from what they're billed.
  const ids = (data ?? []).map((r) => r.id as string);
  const [priceRows, context] = await Promise.all([
    loadStudioClassPrices(supabase, studioId, ids),
    loadStudioTuitionContext(supabase, studioId),
  ]);

  const classes: AvailableClass[] = (data ?? []).map((r) => {
    const priced = priceRows.get(r.id as string);
    return {
      id: r.id as string,
      name: r.name as string,
      discipline: r.discipline as string | null,
      level: r.level as string | null,
      dayOfWeek: r.day_of_week as number | null,
      startTime: r.start_time ? (r.start_time as string).slice(0, 5) : null,
      capacity: Number(r.capacity ?? 0),
      enrolled: Number(r.enrolled ?? 0),
      priceCents: priced?.priceCents ?? 0,
      hours: priced?.hours ?? 0,
      productId: priced?.productId ?? null,
      recurringGroupId: priced?.recurringGroupId ?? null,
    };
  });

  return {
    ok: true,
    data: {
      classes,
      tuition: {
        model: context.model,
        ladder: context.ladder,
        ladderProductName: context.ladderProduct?.name ?? null,
        combos: context.combos,
      },
    },
  };
}

/**
 * What this dancer already has, so the wizard's preview can account for it.
 *
 * Split from getAvailableClasses because Step 1 renders before a child is
 * picked — and because in hours mode the answer changes per dancer, not per
 * studio.
 */
export async function getDancerTuitionState(
  studentId: string,
): Promise<ActionResult<DancerTuitionState>> {
  const t = await getTranslations("errors.actions");
  const ctx = await getEnrollmentContext();
  const { error, supabase, userId, studioId, mode } = ctx;
  if (error || !userId || !studioId) return { ok: false, error: error ?? t("unknown") };
  if (!uuidField.safeParse(studentId).success) {
    return { ok: false, error: t("invalidStudentOrClass") };
  }

  const accessErr = await assertStudentAccess(ctx, studentId, t);
  if (accessErr) return { ok: false, error: accessErr };

  const { data: enrolled } = await supabase
    .from("enrollments")
    .select("class_id")
    .eq("student_id", studentId)
    .eq("status", "active");

  const ids = (enrolled ?? []).map((r) => r.class_id as string).filter(Boolean);
  const rows = ids.length ? await loadStudioClassPrices(supabase, studioId, ids) : new Map();

  const context = await loadStudioTuitionContext(supabase, studioId);
  let priorInvoicedCents = 0;
  if (context.model === "hours") {
    const period = await currentTuitionPeriod(supabase, studioId);
    priorInvoicedCents = await invoicedTuitionCents(supabase, studioId, studentId, period);
  }

  let siblingDiscountPct = 0;
  if (mode !== "self") {
    const info = await siblingDiscountInfo(supabase, studioId, userId, studentId, 10_000);
    siblingDiscountPct = info.applies ? info.pct : 0;
  }

  return {
    ok: true,
    data: {
      existing: [...rows.values()].map((row) => ({
        classId: row.id,
        name: row.name,
        productId: row.productId,
        priceCents: row.priceCents,
        hours: row.hours,
        recurringGroupId: row.recurringGroupId,
      })),
      priorInvoicedCents,
      siblingDiscountPct,
    },
  };
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

  if (!checkRateLimit(rateLimitKey("enroll", userId), { limit: 30, windowMs: 60_000 })) {
    return { ok: false, error: t("unknown") };
  }

  // Atomic capacity check + insert (migration 0095). Falls back to legacy
  // path if the RPC is not yet applied on this environment.
  const { data: atomicRows, error: rpcErr } = await supabase.rpc("enroll_student_atomic", {
    p_studio_id: studioId,
    p_student_id: studentId,
    p_class_id: classId,
  });

  if (!rpcErr && atomicRows?.[0]) {
    const row = atomicRows[0] as { enrollment_id: string; waitlisted: boolean };
    revalidatePath("/portal/parent");
    revalidatePath("/portal/student");
    return {
      ok: true,
      data: {
        enrollmentId: row.enrollment_id,
        waitlisted: Boolean(row.waitlisted),
      },
    };
  }

  if (rpcErr && !/function .*enroll_student_atomic/i.test(rpcErr.message)) {
    if (/already enrolled/i.test(rpcErr.message)) {
      return { ok: false, error: t("alreadyEnrolled") };
    }
    return { ok: false, error: rpcErr.message };
  }

  // Legacy fallback (pre-0095): check-then-act — prefer applying the migration.
  const { data: existing } = await supabase
    .from("enrollments")
    .select("id, status")
    .eq("student_id", studentId)
    .eq("class_id", classId)
    .maybeSingle();

  if (existing?.status === "active") {
    return { ok: false, error: t("alreadyEnrolled") };
  }

  const { data: cap } = await supabase
    .from("class_capacity")
    .select("capacity, enrolled")
    .eq("id", classId)
    .single();

  const isFull = cap ? Number(cap.enrolled) >= Number(cap.capacity) : false;
  const status = isFull ? "waitlisted" : "active";

  const { data: enrollment, error: dbErr } = await supabase
    .from("enrollments")
    .upsert(
      {
        studio_id: studioId,
        student_id: studentId,
        class_id: classId,
        status,
      },
      { onConflict: "student_id,class_id" },
    )
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

/**
 * Price a whole basket in one call.
 *
 * Replaces the per-class quote the wizard used to loop over. Under an hours
 * ladder there is no such thing as "what this one class costs" — the ladder
 * prices the dancer's week — so a per-class endpoint would be actively
 * misleading, and even under per-class pricing the loop had to reimplement the
 * linked-series rule client-side to stop each sibling zeroing the others out.
 */
export async function getBasketQuote(
  studentId: string,
  classIds: string[],
): Promise<ActionResult<TuitionQuote>> {
  const t = await getTranslations("errors.actions");
  const ctx = await getEnrollmentContext();
  const { error, supabase, userId, studioId, mode } = ctx;
  if (error || !userId || !studioId) return { ok: false, error: error ?? t("unknown") };
  if (
    !uuidField.safeParse(studentId).success ||
    classIds.some((id) => !uuidField.safeParse(id).success)
  ) {
    return { ok: false, error: t("invalidStudentOrClass") };
  }

  const accessErr = await assertStudentAccess(ctx, studentId, t);
  if (accessErr) return { ok: false, error: accessErr };

  const result = await quoteEnrollment(supabase, studioId, studentId, classIds, {
    mode,
    payerId: userId,
  });
  if (!result) return { ok: false, error: t("invalidStudentOrClass") };

  return { ok: true, data: result.quote };
}

// ─── Create invoice only (pay later — no Stripe charge at enrollment) ───────
//  `sendNow` distinguishes true pay-later (draft, admin sends manually later)
//  from pay-monthly (sent immediately — see insertTuitionInvoice).

export async function createEnrollmentPayLaterInvoice(
  studentId: string,
  classes: { classId: string; className?: string; priceCents?: number }[],
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

  if (!checkRateLimit(rateLimitKey("enroll-bill", userId), { limit: 20, windowMs: 60_000 })) {
    return { ok: false, error: t("unknown") };
  }

  // Every price, enrolment and prior invoice is re-read server-side; the
  // client payload only ever says which classes, never what they cost. All of
  // `classes` are already active rows by the time this runs, which is exactly
  // why quoteEnrollment excludes the batch from the dancer's existing load.
  const context = await loadStudioTuitionContext(supabase, studioId);
  const result = await quoteEnrollment(
    supabase,
    studioId,
    studentId,
    classes.map((c) => c.classId),
    { mode, payerId: userId, context },
  );
  if (!result) return { ok: false, error: t("invalidStudentOrClass") };

  if (result.quote.totalCents <= 0) {
    revalidatePath("/portal/parent");
    revalidatePath("/portal/student");
    revalidatePath("/portal/parent/billing");
    return { ok: true, data: { billingSkipped: true } };
  }

  const invoiceRes = await insertTuitionInvoice(supabase, {
    studioId,
    payerId: userId,
    studentId,
    quote: result.quote,
    priced: result.priced,
    context,
    sendNow,
    xeroDescription: "Enrollment",
    fallbackError: t("couldNotCreateInvoice"),
  });
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
  /** @deprecated Ignored — class name/price are loaded from the database. */
  _className?: string,
  /** @deprecated Ignored — price is always loaded from the database. */
  _priceCents?: number,
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

  const accessErr = await assertStudentAccess(ctx, studentId, t);
  if (accessErr) return { ok: false, error: accessErr };

  if (!checkRateLimit(rateLimitKey("enroll-pay", userId), { limit: 15, windowMs: 60_000 })) {
    return { ok: false, error: t("unknown") };
  }

  const cls = await loadStudioClassPrice(supabase, studioId, classId);
  if (!cls) return { ok: false, error: t("invalidStudentOrClass") };

  // Under an hours ladder or a combo there is no per-class price to check, so
  // the "is this class free" gate is now the quote itself.
  const context = await loadStudioTuitionContext(supabase, studioId);
  const result = await quoteEnrollment(supabase, studioId, studentId, [classId], {
    mode,
    payerId: userId,
    context,
  });
  if (!result) return { ok: false, error: t("invalidStudentOrClass") };

  const chargeCents = result.quote.totalCents;

  if (chargeCents <= 0) {
    revalidatePath("/portal/parent");
    revalidatePath("/portal/student");
    revalidatePath("/portal/parent/billing");
    return { ok: true, data: { billingSkipped: true } };
  }

  const invoiceRes = await insertTuitionInvoice(supabase, {
    studioId,
    payerId: userId,
    studentId,
    quote: result.quote,
    priced: result.priced,
    context,
    sendNow: true,
    xeroDescription: `Enrollment — ${cls.name}`,
    fallbackError: t("couldNotCreateInvoice"),
  });
  if (!invoiceRes.ok) return { ok: false, error: invoiceRes.error };

  // Resolve / create the Stripe customer.
  const { stripe } = await import("@/lib/stripe");
  const customerId = await getOrCreateStripeCustomer(supabase, userId, studioId);

  const intent = await stripe.paymentIntents.create({
    amount: chargeCents,
    currency: CURRENCY,
    customer: customerId,
    description: `Enrollment — ${cls.name}`,
    metadata: {
      invoice_id: invoiceRes.invoiceId,
      studio_id: studioId,
      supabase_user_id: userId,
      student_id: studentId,
      class_id: classId,
    },
    ...(await resolveDestinationCharge(supabase, studioId)),
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

/** Poll until the webhook has marked the invoice paid (or timeout). */
export async function waitForInvoicePaid(
  invoiceId: string,
  opts?: { timeoutMs?: number },
): Promise<ActionResult<{ status: string }>> {
  const t = await getTranslations("errors.actions");
  const ctx = await getEnrollmentContext();
  const { error, supabase, userId } = ctx;
  if (error || !userId) return { ok: false, error: error ?? t("unknown") };
  if (!uuidField.safeParse(invoiceId).success) {
    return { ok: false, error: t("invalidStudentOrClass") };
  }

  const timeoutMs = opts?.timeoutMs ?? 8_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const { data } = await supabase
      .from("invoices")
      .select("id, status, payer_id")
      .eq("id", invoiceId)
      .maybeSingle();
    if (!data || data.payer_id !== userId) {
      return { ok: false, error: t("unknown") };
    }
    if (data.status === "paid") {
      return { ok: true, data: { status: "paid" } };
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const { data: last } = await supabase
    .from("invoices")
    .select("status")
    .eq("id", invoiceId)
    .maybeSingle();
  return { ok: true, data: { status: (last?.status as string) ?? "sent" } };
}
