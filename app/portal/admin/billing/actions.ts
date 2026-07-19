"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY, gstComponentCents } from "@/lib/currency";
import { stripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { resolveTransferData } from "@/lib/stripe/connect";
import {
  xeroAuthoriseOutstandingInvoice,
  xeroSyncOutstandingInvoice,
  xeroUpdateOutstandingInvoice,
  xeroVoidInvoice,
} from "@/lib/xero/webhook-sync";
import { refreshStudioXeroSync } from "@/lib/xero/inbound-sync";
import { removeInvoiceFromActivePlan } from "@/lib/term-payment-plan-service";
import { getTranslations } from "@/lib/i18n/server";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";

const VOIDABLE_INVOICE_STATUSES = ["draft", "sent", "overdue"] as const;

async function getAdminStudio() {
  const ctx = await getAdminStudioAccess();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
  };
}

const InvoiceLineItemInputSchema = z.object({
  description: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(999),
  unitDollars: z.number().nonnegative().max(100_000),
});

export type InvoiceLineItemInput = z.infer<typeof InvoiceLineItemInputSchema>;

const CreateInvoiceSchema = z.object({
  payerId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  amountDollars: z.number().positive().max(100_000),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(200).optional(),
  sendNow: z.boolean().default(true),
  lineItems: z.array(InvoiceLineItemInputSchema).max(50).optional(),
});

export type CreateInvoiceInput = z.infer<typeof CreateInvoiceSchema>;

function lineItemRows(invoiceId: string, lineItems: InvoiceLineItemInput[]) {
  return lineItems.map((li, idx) => {
    const unitCents = Math.round(li.unitDollars * 100);
    return {
      invoice_id: invoiceId,
      item_type: "custom",
      description: li.description,
      quantity: li.quantity,
      unit_cents: unitCents,
      line_total_cents: unitCents * li.quantity,
      sort_order: idx,
    };
  });
}

function invoiceSentNotification(
  studioId: string,
  payerId: string,
  invoiceId: string,
  label: string,
  amountCents: number,
  dueDate: string | null,
) {
  const amount = (amountCents / 100).toFixed(2);
  return {
    studio_id: studioId,
    user_id: payerId,
    type: "invoice_sent",
    title: "New invoice from your studio",
    body: dueDate
      ? `${label} — $${amount} due ${dueDate}. Sign in to Olune to pay.`
      : `${label} — $${amount}. Sign in to Olune to pay.`,
    link: "/portal/parent",
    payload: { invoice_id: invoiceId, amount_cents: amountCents },
  };
}

async function attachPaymentIntent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  invoice: { id: string; amount_cents: number },
  payerId: string,
  studioId: string,
  description: string,
) {
  const customerId = await getOrCreateStripeCustomer(supabase, payerId, studioId);
  const intent = await stripe.paymentIntents.create({
    amount: invoice.amount_cents,
    currency: CURRENCY,
    customer: customerId,
    description,
    metadata: {
      invoice_id: invoice.id,
      studio_id: studioId,
      supabase_user_id: payerId,
    },
    automatic_payment_methods: { enabled: true },
    transfer_data: await resolveTransferData(supabase, studioId),
  });
  await supabase
    .from("invoices")
    .update({ stripe_payment_intent_id: intent.id })
    .eq("id", invoice.id);
}

export async function createInvoice(
  input: CreateInvoiceInput,
): Promise<
  { ok: true; invoiceId: string; xeroInvoiceId?: string; xeroError?: string } | { ok: false; error: string }
> {
  const t = await getTranslations("errors.actions");
  const parsed = CreateInvoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidInvoiceDetails") };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { payerId, studentId, amountDollars, dueDate, description, sendNow, lineItems } = parsed.data;
  const amountCents = Math.round(amountDollars * 100);

  const { data: payer } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", payerId)
    .eq("studio_id", studioId)
    .single();

  if (!payer) return { ok: false, error: t("parentNotFound") };

  if (studentId) {
    const { data: link } = await supabase
      .from("guardianships")
      .select("guardian_id")
      .eq("guardian_id", payerId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!link) return { ok: false, error: t("studentNotLinked") };
  }

  const status = sendNow ? "sent" : "draft";
  const now = new Date().toISOString();
  const trimmedDescription = description?.trim() || null;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      studio_id: studioId,
      payer_id: payerId,
      student_id: studentId ?? null,
      amount_cents: amountCents,
      gst_cents: gstComponentCents(amountCents),
      status,
      description: trimmedDescription,
      due_date: dueDate,
      issued_at: sendNow ? now : null,
    })
    .select("id, amount_cents, studio_id")
    .single();

  if (invErr || !invoice) return { ok: false, error: invErr?.message ?? t("couldNotCreateInvoice") };

  if (lineItems && lineItems.length > 0) {
    await supabase.from("invoice_line_items").insert(lineItemRows(invoice.id as string, lineItems));
  }

  const label = trimmedDescription || "Studio invoice";
  if (sendNow) {
    try {
      await attachPaymentIntent(supabase, invoice, payerId, studioId, label);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Invoice created but payment link failed.",
      };
    }

    await supabase
      .from("notifications")
      .insert(invoiceSentNotification(studioId, payerId, invoice.id as string, label, amountCents, dueDate));
  }

  // Sync to Xero as a Draft regardless of sendNow — Xero always mirrors
  // Olune's own draft state from the moment of creation. Sending later (via
  // sendInvoiceNow) flips this same Xero draft to Authorised rather than
  // creating a second copy.
  let xeroInvoiceId: string | undefined;
  let xeroError: string | undefined;
  const xero = await xeroSyncOutstandingInvoice(supabase, invoice.id as string, {
    lineDescription: label,
  });
  if (xero.ok) xeroInvoiceId = xero.xeroInvoiceId;
  else xeroError = xero.error;

  revalidatePath("/portal/admin/billing");
  return { ok: true, invoiceId: invoice.id as string, xeroInvoiceId, xeroError };
}

/**
 * Promotes a local draft invoice to sent: attaches the Stripe payment link,
 * emails the parent, and either creates its Xero Draft (if the backfill/first
 * sync never ran) or flips an existing Xero Draft to Authorised — so Xero
 * only ever goes live for a customer at the exact moment they're actually
 * billed, never before.
 */
export async function sendInvoiceNow(
  invoiceId: string,
): Promise<{ ok: true; xeroError?: string } | { ok: false; error: string }> {
  const t = await getTranslations("errors.actions");
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, payer_id, amount_cents, due_date, status, description, stripe_payment_intent_id, xero_invoice_id")
    .eq("id", invoiceId)
    .eq("studio_id", studioId)
    .single();

  if (!invoice) return { ok: false, error: t("invoiceNotFound") };
  if (invoice.status !== "draft") return { ok: false, error: t("onlyDraftsCanBeSent") };

  const payerId = invoice.payer_id as string;
  const amountCents = invoice.amount_cents as number;
  const dueDate = (invoice.due_date as string | null) ?? null;
  const label = (invoice.description as string | null)?.trim() || "Studio invoice";
  const now = new Date().toISOString();

  if (!invoice.stripe_payment_intent_id) {
    try {
      await attachPaymentIntent(
        supabase,
        invoice as { id: string; amount_cents: number },
        payerId,
        studioId,
        label,
      );
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Could not prepare payment link.",
      };
    }
  }

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ status: "sent", issued_at: now })
    .eq("id", invoiceId);
  if (updErr) return { ok: false, error: updErr.message };

  await supabase
    .from("notifications")
    .insert(invoiceSentNotification(studioId, payerId, invoiceId, label, amountCents, dueDate));

  let xeroError: string | undefined;
  if (invoice.xero_invoice_id) {
    const xero = await xeroAuthoriseOutstandingInvoice(supabase, invoiceId);
    if (!xero.ok) xeroError = xero.error;
  } else {
    const xero = await xeroSyncOutstandingInvoice(supabase, invoiceId, { lineDescription: label });
    if (!xero.ok) xeroError = xero.error;
  }

  revalidatePath("/portal/admin/billing");
  return { ok: true, xeroError };
}

/**
 * Sends every outstanding draft invoice for the studio in one pass — reuses
 * sendInvoiceNow per invoice so a batch of enrollment/manual drafts can be
 * reviewed once and approved together instead of one at a time.
 */
export async function sendAllDraftInvoices(): Promise<
  | { ok: true; sent: number; failed: { invoiceId: string; error: string }[] }
  | { ok: false; error: string }
> {
  const t = await getTranslations("errors.actions");
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { data: drafts } = await supabase
    .from("invoices")
    .select("id")
    .eq("studio_id", studioId)
    .eq("status", "draft");

  const ids = (drafts ?? []).map((d) => d.id as string);
  if (!ids.length) return { ok: false, error: t("noDraftInvoices") };

  let sent = 0;
  const failed: { invoiceId: string; error: string }[] = [];
  for (const id of ids) {
    const res = await sendInvoiceNow(id);
    if (res.ok) sent += 1;
    else failed.push({ invoiceId: id, error: res.error });
  }

  return { ok: true, sent, failed };
}

/**
 * Manual catch-up for the inbound Xero webhook — pulls current state for every
 * not-yet-final invoice already linked to Xero (draft/sent/overdue), in case a
 * webhook delivery was missed. See lib/xero/inbound-sync.ts.
 */
export async function refreshXeroSync(): Promise<
  { ok: true; checked: number; updated: number } | { ok: false; error: string }
> {
  const t = await getTranslations("errors.actions");
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const result = await refreshStudioXeroSync(supabase, studioId);
  if (!result.ok) return result;

  revalidatePath("/portal/admin/billing");
  return result;
}

export async function sendPaymentReminder(
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getTranslations("errors.actions");
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, payer_id, amount_cents, due_date, status, stripe_payment_intent_id")
    .eq("id", invoiceId)
    .eq("studio_id", studioId)
    .single();

  if (!invoice) return { ok: false, error: t("invoiceNotFound") };
  if (!["sent", "overdue"].includes(invoice.status as string)) {
    return { ok: false, error: t("unpaidInvoicesOnly") };
  }

  const payerId = invoice.payer_id as string;
  const amount = ((invoice.amount_cents as number) / 100).toFixed(2);
  const due = invoice.due_date as string | null;
  const isOverdue = invoice.status === "overdue";

  if (!invoice.stripe_payment_intent_id) {
    try {
      await attachPaymentIntent(
        supabase,
        invoice,
        payerId,
        studioId,
        isOverdue ? "Overdue studio invoice" : "Studio invoice reminder",
      );
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Could not prepare payment link." };
    }
  }

  const { error: notifyErr } = await supabase.from("notifications").insert({
    studio_id: studioId,
    user_id: payerId,
    type: "payment_reminder",
    title: isOverdue ? "Payment overdue — action needed" : "Friendly payment reminder",
    body: due
      ? `Invoice for $${amount} was due ${due}. Please pay via your Olune parent portal.`
      : `Invoice for $${amount} is outstanding. Please pay via your Olune parent portal.`,
    link: "/portal/parent",
    payload: { invoice_id: invoiceId, amount_cents: invoice.amount_cents },
  });

  if (notifyErr) return { ok: false, error: notifyErr.message };

  revalidatePath("/portal/admin/billing");
  return { ok: true };
}

export async function sendBulkPaymentReminders(
  invoiceIds: string[],
): Promise<{ ok: true; sent: number } | { ok: false; error: string }> {
  const t = await getTranslations("errors.actions");
  if (!invoiceIds.length) return { ok: false, error: t("noInvoicesSelected") };

  let sent = 0;
  for (const id of invoiceIds) {
    const res = await sendPaymentReminder(id);
    if (res.ok) sent += 1;
  }

  if (sent === 0) return { ok: false, error: t("noRemindersSent") };
  return { ok: true, sent };
}

export async function voidInvoice(
  invoiceId: string,
): Promise<{ ok: true; xeroError?: string } | { ok: false; error: string }> {
  const t = await getTranslations("errors.actions");
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, stripe_payment_intent_id")
    .eq("id", invoiceId)
    .eq("studio_id", studioId)
    .single();

  if (!invoice) return { ok: false, error: t("invoiceNotFound") };

  const status = invoice.status as string;
  if (status === "void") return { ok: false, error: t("invoiceAlreadyVoid") };
  if (status === "paid" || status === "refunded") {
    return { ok: false, error: t("paidInvoiceUseRefund") };
  }
  if (!VOIDABLE_INVOICE_STATUSES.includes(status as (typeof VOIDABLE_INVOICE_STATUSES)[number])) {
    return { ok: false, error: t("cannotVoidInvoice") };
  }

  try {
    await removeInvoiceFromActivePlan(supabase, invoiceId);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : t("voidOnActivePlan"),
    };
  }

  const intentId = invoice.stripe_payment_intent_id as string | null;
  if (intentId) {
    try {
      await stripe.paymentIntents.cancel(intentId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not cancel payment link.";
      return { ok: false, error: message };
    }
  }

  const { error: updErr } = await supabase
    .from("invoices")
    .update({ status: "void" })
    .eq("id", invoiceId);

  if (updErr) return { ok: false, error: updErr.message };

  const xero = await xeroVoidInvoice(supabase, invoiceId);
  const xeroError = xero.ok ? undefined : xero.error;

  revalidatePath("/portal/admin/billing");
  return { ok: true, xeroError };
}

const LOCKED_INVOICE_STATUSES = ["paid", "refunded", "void"] as const;

const UpdateInvoiceSchema = z.object({
  invoiceId: z.string().uuid(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  description: z.string().max(200).optional(),
  amountDollars: z.number().positive().max(100_000).optional(),
  lineItems: z.array(InvoiceLineItemInputSchema).max(50).optional(),
});

export type UpdateInvoiceInput = z.infer<typeof UpdateInvoiceSchema>;

/**
 * Due date / description are cosmetic on our side and safe to edit any time
 * before an invoice is paid. Amount / line items are only editable while the
 * invoice is still a draft — once sent, a Stripe PaymentIntent and (if synced)
 * a Xero invoice already reflect the original total, and rewriting the amount
 * here would desync them.
 */
export async function updateInvoice(
  input: UpdateInvoiceInput,
): Promise<{ ok: true; xeroError?: string } | { ok: false; error: string }> {
  const t = await getTranslations("errors.actions");
  const parsed = UpdateInvoiceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidInvoiceDetails") };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { invoiceId, dueDate, description, amountDollars, lineItems } = parsed.data;

  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status")
    .eq("id", invoiceId)
    .eq("studio_id", studioId)
    .single();

  if (!invoice) return { ok: false, error: t("invoiceNotFound") };

  const status = invoice.status as string;
  if (LOCKED_INVOICE_STATUSES.includes(status as (typeof LOCKED_INVOICE_STATUSES)[number])) {
    return { ok: false, error: t("invoiceLocked") };
  }

  const changingAmount = amountDollars !== undefined || lineItems !== undefined;
  if (changingAmount && status !== "draft") {
    return { ok: false, error: t("invoiceNotDraft") };
  }

  if (lineItems !== undefined && lineItems.length === 0) {
    return { ok: false, error: t("invalidLineItems") };
  }

  const updates: Record<string, unknown> = {};
  if (dueDate !== undefined) updates.due_date = dueDate;
  if (description !== undefined) updates.description = description.trim() || null;

  if (lineItems !== undefined) {
    const amountCents = lineItems.reduce(
      (sum, li) => sum + Math.round(li.unitDollars * 100) * li.quantity,
      0,
    );
    updates.amount_cents = amountCents;
    updates.gst_cents = gstComponentCents(amountCents);
  } else if (amountDollars !== undefined) {
    const amountCents = Math.round(amountDollars * 100);
    updates.amount_cents = amountCents;
    updates.gst_cents = gstComponentCents(amountCents);
  }

  if (Object.keys(updates).length > 0) {
    const { error: updErr } = await supabase.from("invoices").update(updates).eq("id", invoiceId);
    if (updErr) return { ok: false, error: updErr.message };
  }

  if (changingAmount) {
    await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceId);
    if (lineItems !== undefined) {
      await supabase.from("invoice_line_items").insert(lineItemRows(invoiceId, lineItems));
    }
  }

  revalidatePath("/portal/admin/billing");

  let xeroError: string | undefined;
  if (Object.keys(updates).length > 0 || changingAmount) {
    const xero = await xeroUpdateOutstandingInvoice(supabase, invoiceId);
    if (!xero.ok) xeroError = xero.error;
  }

  return { ok: true, xeroError };
}

const InvoiceTemplateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(200).optional(),
  defaultDueDays: z.number().int().min(0).max(365),
  lineItems: z.array(InvoiceLineItemInputSchema).min(1).max(50),
});

export type InvoiceTemplateInput = z.infer<typeof InvoiceTemplateSchema>;

export async function createInvoiceTemplate(
  input: InvoiceTemplateInput,
): Promise<{ ok: true; templateId: string } | { ok: false; error: string }> {
  const t = await getTranslations("errors.actions");
  const parsed = InvoiceTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidTemplateDetails") };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { name, description, defaultDueDays, lineItems } = parsed.data;

  const { data: template, error: insErr } = await supabase
    .from("invoice_templates")
    .insert({
      studio_id: studioId,
      name,
      description: description?.trim() || null,
      default_due_days: defaultDueDays,
    })
    .select("id")
    .single();

  if (insErr || !template) return { ok: false, error: insErr?.message ?? t("unknown") };

  const templateId = template.id as string;
  const { error: lineErr } = await supabase.from("invoice_template_line_items").insert(
    lineItems.map((li, idx) => ({
      template_id: templateId,
      description: li.description,
      quantity: li.quantity,
      unit_cents: Math.round(li.unitDollars * 100),
      sort_order: idx,
    })),
  );
  if (lineErr) return { ok: false, error: lineErr.message };

  revalidatePath("/portal/admin/billing");
  return { ok: true, templateId };
}

export async function updateInvoiceTemplate(
  templateId: string,
  input: InvoiceTemplateInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getTranslations("errors.actions");
  const parsed = InvoiceTemplateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidTemplateDetails") };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { data: template } = await supabase
    .from("invoice_templates")
    .select("id")
    .eq("id", templateId)
    .eq("studio_id", studioId)
    .single();
  if (!template) return { ok: false, error: t("templateNotFound") };

  const { name, description, defaultDueDays, lineItems } = parsed.data;

  const { error: updErr } = await supabase
    .from("invoice_templates")
    .update({
      name,
      description: description?.trim() || null,
      default_due_days: defaultDueDays,
    })
    .eq("id", templateId);
  if (updErr) return { ok: false, error: updErr.message };

  await supabase.from("invoice_template_line_items").delete().eq("template_id", templateId);
  const { error: lineErr } = await supabase.from("invoice_template_line_items").insert(
    lineItems.map((li, idx) => ({
      template_id: templateId,
      description: li.description,
      quantity: li.quantity,
      unit_cents: Math.round(li.unitDollars * 100),
      sort_order: idx,
    })),
  );
  if (lineErr) return { ok: false, error: lineErr.message };

  revalidatePath("/portal/admin/billing");
  return { ok: true };
}

export async function deleteInvoiceTemplate(
  templateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const t = await getTranslations("errors.actions");
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { data: template } = await supabase
    .from("invoice_templates")
    .select("id")
    .eq("id", templateId)
    .eq("studio_id", studioId)
    .single();
  if (!template) return { ok: false, error: t("templateNotFound") };

  const { error: delErr } = await supabase.from("invoice_templates").delete().eq("id", templateId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/portal/admin/billing");
  return { ok: true };
}
