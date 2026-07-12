// ============================================================================
//  lib/term-payment-plan-service.ts
//  Shared term-plan persistence for parent actions, API routes, and webhooks.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  nextInstallmentAmountCents,
  nextMonthlyDueDate,
  splitTermInstallments,
  TERM_INSTALLMENT_COUNT,
} from "@/lib/term-payments";

export type TermPaymentPlanRow = {
  id: string;
  studio_id: string;
  payer_id: string;
  total_cents: number;
  installment_count: number;
  installment_amounts: number[];
  installments_paid: number;
  amount_paid_cents: number;
  next_due_date: string | null;
  status: string;
};

const OPEN_INVOICE_STATUSES = ["sent", "overdue"] as const;

/** Outstanding invoices not yet tied to an active term plan. */
export async function listPlanEligibleInvoices(
  supabase: SupabaseClient,
  payerId: string,
): Promise<{ id: string; amount_cents: number; studio_id: string }[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, amount_cents, studio_id, term_payment_plan_id, status")
    .eq("payer_id", payerId)
    .in("status", [...OPEN_INVOICE_STATUSES]);

  if (error) throw new Error(error.message);

  const rows = (data ?? []) as {
    id: string;
    amount_cents: number;
    studio_id: string;
    term_payment_plan_id: string | null;
    status: string;
  }[];

  const planIds = [
    ...new Set(rows.map((r) => r.term_payment_plan_id).filter(Boolean)),
  ] as string[];

  let activePlanIds = new Set<string>();
  if (planIds.length) {
    const { data: plans } = await supabase
      .from("term_payment_plans")
      .select("id, status")
      .in("id", planIds)
      .eq("status", "active");
    activePlanIds = new Set((plans ?? []).map((p) => p.id as string));
  }

  return rows
    .filter((r) => !r.term_payment_plan_id || !activePlanIds.has(r.term_payment_plan_id))
    .map((r) => ({
      id: r.id,
      amount_cents: r.amount_cents,
      studio_id: r.studio_id,
    }));
}

export async function getActiveTermPlanForPayer(
  supabase: SupabaseClient,
  payerId: string,
): Promise<TermPaymentPlanRow | null> {
  const { data, error } = await supabase
    .from("term_payment_plans")
    .select("*")
    .eq("payer_id", payerId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as TermPaymentPlanRow;
}

export async function createTermPaymentPlan(
  supabase: SupabaseClient,
  input: {
    studioId: string;
    payerId: string;
    invoiceIds: string[];
    installmentCount?: number;
  },
): Promise<TermPaymentPlanRow> {
  const { studioId, payerId, invoiceIds } = input;
  const installmentCount = input.installmentCount ?? TERM_INSTALLMENT_COUNT;

  if (!invoiceIds.length) {
    throw new Error("No invoices to include in the payment plan.");
  }

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, amount_cents, studio_id, payer_id, status, term_payment_plan_id")
    .in("id", invoiceIds)
    .eq("payer_id", payerId);

  if (invErr) throw new Error(invErr.message);
  if (!invoices?.length || invoices.length !== invoiceIds.length) {
    throw new Error("One or more invoices were not found.");
  }

  for (const inv of invoices) {
    if (!OPEN_INVOICE_STATUSES.includes(inv.status as (typeof OPEN_INVOICE_STATUSES)[number])) {
      throw new Error("Only unpaid invoices can be added to a payment plan.");
    }
    if (inv.term_payment_plan_id) {
      throw new Error("An invoice is already on an active payment plan.");
    }
    if (inv.studio_id !== studioId) {
      throw new Error("Invoices must belong to the same studio.");
    }
  }

  const totalCents = invoices.reduce((sum, inv) => sum + (inv.amount_cents as number), 0);
  if (totalCents <= 0) throw new Error("Nothing to bill.");

  const installmentAmounts = splitTermInstallments(totalCents, installmentCount);

  const { data: plan, error: planErr } = await supabase
    .from("term_payment_plans")
    .insert({
      studio_id: studioId,
      payer_id: payerId,
      total_cents: totalCents,
      installment_count: installmentCount,
      installment_amounts: installmentAmounts,
      installments_paid: 0,
      amount_paid_cents: 0,
      next_due_date: nextMonthlyDueDate(),
      status: "active",
    })
    .select("*")
    .single();

  if (planErr || !plan) {
    throw new Error(planErr?.message ?? "Could not create payment plan.");
  }

  const planId = plan.id as string;

  await supabase.from("term_payment_plan_invoices").insert(
    invoiceIds.map((invoiceId) => ({ plan_id: planId, invoice_id: invoiceId })),
  );

  await supabase
    .from("invoices")
    .update({ term_payment_plan_id: planId })
    .in("id", invoiceIds);

  return plan as TermPaymentPlanRow;
}

export async function recordTermInstallmentPaid(
  supabase: SupabaseClient,
  planId: string,
  amountCents: number,
  installmentNumber: number,
): Promise<{ completed: boolean; plan: TermPaymentPlanRow }> {
  const { data: plan, error } = await supabase
    .from("term_payment_plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (error || !plan) throw new Error("Payment plan not found.");

  const row = plan as TermPaymentPlanRow;
  if (row.status !== "active") {
    return { completed: row.status === "completed", plan: row };
  }

  if (installmentNumber !== row.installments_paid + 1) {
    throw new Error("Unexpected installment number.");
  }

  const installmentsPaid = row.installments_paid + 1;
  const amountPaidCents = row.amount_paid_cents + amountCents;
  // Complete only when BOTH the schedule is exhausted AND the full balance has
  // actually been collected. Gating on the counter alone would flip a plan to
  // "completed" (and mark its invoices paid) while money is still owed — e.g. if
  // an installment settles for less than its slice.
  const completed =
    installmentsPaid >= row.installment_count && amountPaidCents >= row.total_cents;

  const { data: updated, error: updErr } = await supabase
    .from("term_payment_plans")
    .update({
      installments_paid: installmentsPaid,
      amount_paid_cents: amountPaidCents,
      next_due_date: completed ? null : nextMonthlyDueDate(),
      status: completed ? "completed" : "active",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", planId)
    .eq("installments_paid", row.installments_paid)
    .select("*")
    .single();

  if (updErr || !updated) {
    throw new Error(updErr?.message ?? "Could not update payment plan.");
  }

  if (completed) {
    const { data: links } = await supabase
      .from("term_payment_plan_invoices")
      .select("invoice_id")
      .eq("plan_id", planId);

    const invoiceIds = (links ?? []).map((l) => l.invoice_id as string);
    if (invoiceIds.length) {
      const now = new Date().toISOString();
      await supabase
        .from("invoices")
        .update({ status: "paid", paid_at: now })
        .in("id", invoiceIds)
        .in("status", [...OPEN_INVOICE_STATUSES]);
    }
  }

  return { completed, plan: updated as TermPaymentPlanRow };
}

export function installmentDueNow(plan: TermPaymentPlanRow): number | null {
  return nextInstallmentAmountCents(plan.installment_amounts, plan.installments_paid);
}

/** Attach new open invoices to an active plan and recalculate remaining installments. */
export async function addInvoicesToActivePlan(
  supabase: SupabaseClient,
  planId: string,
  invoiceIds: string[],
): Promise<TermPaymentPlanRow> {
  if (!invoiceIds.length) {
    const { data } = await supabase.from("term_payment_plans").select("*").eq("id", planId).single();
    if (!data) throw new Error("Payment plan not found.");
    return data as TermPaymentPlanRow;
  }

  const { data: plan, error } = await supabase
    .from("term_payment_plans")
    .select("*")
    .eq("id", planId)
    .eq("status", "active")
    .single();

  if (error || !plan) throw new Error("Active payment plan not found.");
  const row = plan as TermPaymentPlanRow;

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, amount_cents, payer_id, status, term_payment_plan_id")
    .in("id", invoiceIds);

  if (invErr) throw new Error(invErr.message);
  if (!invoices?.length) throw new Error("Invoices not found.");

  let additionalCents = 0;
  for (const inv of invoices) {
    if (inv.payer_id !== row.payer_id) throw new Error("Invoice payer mismatch.");
    if (!OPEN_INVOICE_STATUSES.includes(inv.status as (typeof OPEN_INVOICE_STATUSES)[number])) {
      throw new Error("Only unpaid invoices can be added.");
    }
    if (inv.term_payment_plan_id && inv.term_payment_plan_id !== planId) {
      throw new Error("Invoice belongs to another payment plan.");
    }
    if (!inv.term_payment_plan_id) {
      additionalCents += inv.amount_cents as number;
    }
  }

  const toLink = invoices.filter((inv) => !inv.term_payment_plan_id).map((inv) => inv.id as string);
  if (toLink.length) {
    await supabase.from("term_payment_plan_invoices").insert(
      toLink.map((invoiceId) => ({ plan_id: planId, invoice_id: invoiceId })),
    );
    await supabase
      .from("invoices")
      .update({ term_payment_plan_id: planId })
      .in("id", toLink);
  }

  if (additionalCents <= 0) return row;

  const newTotal = row.total_cents + additionalCents;
  const remainingCount = row.installment_count - row.installments_paid;
  const remainingBalance = newTotal - row.amount_paid_cents;
  const remainingSlices =
    remainingCount > 0 ? splitTermInstallments(remainingBalance, remainingCount) : [];
  const installmentAmounts = [
    ...row.installment_amounts.slice(0, row.installments_paid),
    ...remainingSlices,
  ];

  const { data: updated, error: updErr } = await supabase
    .from("term_payment_plans")
    .update({
      total_cents: newTotal,
      installment_amounts: installmentAmounts,
    })
    .eq("id", planId)
    .select("*")
    .single();

  if (updErr || !updated) throw new Error(updErr?.message ?? "Could not update payment plan.");
  return updated as TermPaymentPlanRow;
}

/** Detach an invoice from its active plan and recalculate or cancel the plan. */
export async function removeInvoiceFromActivePlan(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<void> {
  const { data: inv, error: invErr } = await supabase
    .from("invoices")
    .select("term_payment_plan_id, amount_cents")
    .eq("id", invoiceId)
    .single();

  if (invErr || !inv?.term_payment_plan_id) return;

  const planId = inv.term_payment_plan_id as string;
  const { data: plan, error: planErr } = await supabase
    .from("term_payment_plans")
    .select("*")
    .eq("id", planId)
    .single();

  if (planErr || !plan) {
    await supabase.from("term_payment_plan_invoices").delete().eq("invoice_id", invoiceId);
    await supabase.from("invoices").update({ term_payment_plan_id: null }).eq("id", invoiceId);
    return;
  }

  const row = plan as TermPaymentPlanRow;
  if (row.status === "active" && row.installments_paid > 0) {
    throw new Error("Cannot void an invoice on a payment plan with instalments already paid.");
  }

  await supabase.from("term_payment_plan_invoices").delete().eq("invoice_id", invoiceId);
  await supabase.from("invoices").update({ term_payment_plan_id: null }).eq("id", invoiceId);

  const { data: links } = await supabase
    .from("term_payment_plan_invoices")
    .select("invoice_id")
    .eq("plan_id", planId);

  const remainingIds = (links ?? []).map((l) => l.invoice_id as string);
  if (remainingIds.length === 0) {
    await supabase.from("term_payment_plans").update({ status: "cancelled" }).eq("id", planId);
    return;
  }

  const { data: remainingInvoices } = await supabase
    .from("invoices")
    .select("amount_cents")
    .in("id", remainingIds)
    .in("status", [...OPEN_INVOICE_STATUSES]);

  const newTotal = (remainingInvoices ?? []).reduce(
    (sum, i) => sum + (i.amount_cents as number),
    0,
  );
  const installmentAmounts = splitTermInstallments(newTotal, row.installment_count);

  await supabase
    .from("term_payment_plans")
    .update({
      total_cents: newTotal,
      installment_amounts: installmentAmounts,
    })
    .eq("id", planId);
}
