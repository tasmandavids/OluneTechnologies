"use server";

// ============================================================================
//  Parent enrollment server actions
//  Called from EnrollModal to drive the multi-step enrollment flow.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { loadStudioTaxSettings } from "@/lib/billing/catalog";
import { totalInvoice } from "@/lib/billing/tax";
import { siblingDiscountedCents } from "@/lib/discounts";
import { enrollmentBillableCents, batchEnrollmentBillableCents } from "@/lib/enrollment-billing";
import { loadStudioClassPrice, loadStudioClassPrices } from "@/lib/enrollment-class-price";
import { xeroSyncOutstandingInvoice } from "@/lib/xero/webhook-sync";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { studioLocalYmdOffset } from "@/lib/date/studio-date";
import { resolveTransferData } from "@/lib/stripe/connect";
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

export async function getAvailableClasses(): Promise<ActionResult<AvailableClass[]>> {
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
  const priceRows = await loadStudioClassPrices(supabase, studioId, ids);

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
      recurringGroupId: priced?.recurringGroupId ?? null,
    };
  });

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
  classId: string,
  /** @deprecated Ignored — price is always loaded from the database. */
  _priceCents?: number,
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

  const cls = await loadStudioClassPrice(supabase, studioId, classId);
  if (!cls) return { ok: false, error: t("invalidStudentOrClass") };

  const billableCents = await enrollmentChargeCents(
    supabase,
    studioId,
    userId,
    studentId,
    cls.priceCents,
    mode,
    classId,
  );

  return {
    ok: true,
    data: {
      billableCents,
      includedInProgramme: cls.priceCents > 0 && billableCents === 0,
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
  const dueDate = studioLocalYmdOffset(7);
  const now = new Date().toISOString();

  // Ledger codes and tax treatment come from each class's catalogue product
  // and get frozen onto the line, so re-pricing or re-coding that product
  // later can't rewrite an invoice the parent has already been sent.
  const priceRows = await loadStudioClassPrices(
    supabase,
    studioId,
    charges.map((c) => c.classId),
  );
  const taxSettings = await loadStudioTaxSettings(supabase, studioId);

  const lines = charges.map((c, idx) => {
    const priced = priceRows.get(c.classId);
    return {
      item_type: "class",
      reference_id: c.classId,
      product_id: priced?.productId ?? null,
      description: c.className,
      quantity: 1,
      unit_cents: c.chargeCents,
      line_total_cents: c.chargeCents,
      sort_order: idx,
      account_code: priced?.accountCode ?? null,
      item_code: priced?.itemCode ?? null,
      tax_treatment: priced?.taxTreatment ?? "standard",
      tax_rate_bp: priced?.taxRateBp ?? 1500,
    };
  });

  const totals = totalInvoice(
    lines.map((l) => ({
      lineTotalCents: l.line_total_cents,
      taxTreatment: l.tax_treatment,
      taxRateBp: l.tax_rate_bp,
    })),
    { inclusive: taxSettings.pricesIncludeTax, registered: taxSettings.gstRegistered },
  );

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      studio_id: studioId,
      payer_id: userId,
      student_id: studentId,
      amount_cents: totals.totalCents,
      subtotal_cents: totals.subtotalCents,
      gst_cents: totals.taxCents,
      tax_inclusive: taxSettings.pricesIncludeTax,
      status: sendNow ? "sent" : "draft",
      due_date: dueDate,
      issued_at: sendNow ? now : null,
    })
    .select("id")
    .single();

  if (invErr || !invoice) {
    return { ok: false as const, error: invErr?.message ?? t("couldNotCreateInvoice") };
  }

  const invoiceId = invoice.id as string;

  const { error: lineItemsErr } = await supabase
    .from("invoice_line_items")
    .insert(lines.map((l) => ({ ...l, invoice_id: invoiceId })));

  if (lineItemsErr) {
    return { ok: false as const, error: lineItemsErr.message };
  }

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

  const priced = await loadStudioClassPrices(
    supabase,
    studioId,
    classes.map((c) => c.classId),
  );
  if (priced.size !== classes.length) {
    return { ok: false, error: t("invalidStudentOrClass") };
  }

  // Batch-aware: all of `classes` are enrolled (as active rows) before this
  // billing step runs, so a per-class check would find every linked-series
  // sibling already active and zero all of them out. See
  // batchEnrollmentBillableCents for why this can't reuse enrollmentChargeCents.
  // Prices always come from the DB — never from the client payload.
  const baseCentsByClassId = await batchEnrollmentBillableCents(
    supabase,
    studentId,
    classes.map((c) => {
      const row = priced.get(c.classId)!;
      return { classId: c.classId, priceCents: row.priceCents };
    }),
  );

  const charges: { classId: string; className: string; chargeCents: number }[] = [];
  for (const cls of classes) {
    const row = priced.get(cls.classId)!;
    const baseCents = baseCentsByClassId.get(cls.classId) ?? 0;
    if (baseCents <= 0) continue;
    const chargeCents =
      mode === "self" ? baseCents : await siblingDiscountedCents(supabase, studioId, userId, studentId, baseCents);
    if (chargeCents > 0) {
      charges.push({ classId: cls.classId, className: row.name, chargeCents });
    }
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
  if (cls.priceCents <= 0) return { ok: false, error: t("classNoFee") };

  const chargeCents = await enrollmentChargeCents(
    supabase,
    studioId,
    userId,
    studentId,
    cls.priceCents,
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
    [{ classId, className: cls.name, chargeCents }],
    true,
    t,
  );
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
    transfer_data: await resolveTransferData(supabase, studioId),
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
