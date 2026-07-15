"use server";

// ============================================================================
//  Parent billing — term payment plans (3 monthly installments).
// ============================================================================

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { resolveTransferData } from "@/lib/stripe/connect";
import { TERM_INSTALLMENT_COUNT } from "@/lib/term-payments";
import {
  addInvoicesToActivePlan,
  createTermPaymentPlan,
  getActiveTermPlanForPayer,
  installmentDueNow,
  listPlanEligibleInvoices,
  type TermPaymentPlanRow,
} from "@/lib/term-payment-plan-service";
import { splitTermInstallments } from "@/lib/term-payments";
import { getTranslations } from "@/lib/i18n/server";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type AccountBillingSummary = {
  outstandingCents: number;
  invoiceCount: number;
  installmentCount: number;
  monthlyCents: number;
  firstInstallmentCents: number;
  activePlan: {
    id: string;
    totalCents: number;
    installmentsPaid: number;
    installmentCount: number;
    nextDueCents: number | null;
    nextDueDate: string | null;
  } | null;
};

export async function getAccountBillingSummary(): Promise<ActionResult<AccountBillingSummary>> {
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("notSignedIn") };

  const invoices = await listPlanEligibleInvoices(supabase, user.id);
  const outstandingCents = invoices.reduce((sum, inv) => sum + inv.amount_cents, 0);

  const activePlan = await getActiveTermPlanForPayer(supabase, user.id);
  const nextDueCents = activePlan ? installmentDueNow(activePlan) : null;

  const monthlyBase =
    outstandingCents > 0
      ? splitTermInstallments(outstandingCents, TERM_INSTALLMENT_COUNT)[0] ?? 0
      : 0;

  const split = outstandingCents > 0 ? splitTermInstallments(outstandingCents, TERM_INSTALLMENT_COUNT) : [];

  return {
    ok: true,
    data: {
      outstandingCents,
      invoiceCount: invoices.length,
      installmentCount: TERM_INSTALLMENT_COUNT,
      monthlyCents: monthlyBase,
      firstInstallmentCents: split[0] ?? 0,
      activePlan: activePlan
        ? {
            id: activePlan.id,
            totalCents: activePlan.total_cents,
            installmentsPaid: activePlan.installments_paid,
            installmentCount: activePlan.installment_count,
            nextDueCents,
            nextDueDate: activePlan.next_due_date,
          }
        : null,
    },
  };
}

/**
 * Build (or reuse) a term plan for all open invoices, then create a PI for the
 * next installment.
 */
export async function createTermInstallmentIntent(
  invoiceIds?: string[],
): Promise<
  ActionResult<{
    clientSecret: string;
    planId: string;
    installmentNumber: number;
    installmentCents: number;
    totalCents: number;
    installmentCount: number;
  }>
> {
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("notSignedIn") };

  let plan: TermPaymentPlanRow | null = await getActiveTermPlanForPayer(supabase, user.id);
  const eligible = await listPlanEligibleInvoices(supabase, user.id);
  const allIds = [
    ...new Set([...eligible.map((e) => e.id), ...(invoiceIds ?? [])]),
  ];

  if (plan) {
    if (allIds.length) {
      plan = await addInvoicesToActivePlan(supabase, plan.id, allIds);
    }
  } else {
    if (!allIds.length) {
      return { ok: false, error: t("noOutstandingInvoices") };
    }

    const { data: firstInv } = await supabase
      .from("invoices")
      .select("studio_id")
      .eq("id", allIds[0])
      .single();

    if (!firstInv) return { ok: false, error: t("noOutstandingInvoices") };

    plan = await createTermPaymentPlan(supabase, {
      studioId: firstInv.studio_id as string,
      payerId: user.id,
      invoiceIds: allIds,
    });
  }

  const installmentCents = installmentDueNow(plan);
  if (installmentCents == null || installmentCents <= 0) {
    return { ok: false, error: t("termPlanComplete") };
  }

  const installmentNumber = plan.installments_paid + 1;
  const customerId = await getOrCreateStripeCustomer(supabase, user.id, plan.studio_id);

  const { stripe } = await import("@/lib/stripe");
  const intent = await stripe.paymentIntents.create({
    amount: installmentCents,
    currency: CURRENCY,
    customer: customerId,
    description: `Term payment ${installmentNumber}/${plan.installment_count}`,
    metadata: {
      payment_plan_id: plan.id,
      installment_number: String(installmentNumber),
      studio_id: plan.studio_id,
      supabase_user_id: user.id,
    },
    // Installments are the studio's OWN pay-over-time plan. Deliberately restrict
    // to instant card capture: BNPL methods (Afterpay/Clearpay) front the full
    // order value and settle asynchronously, which double-splits the balance and
    // lets an unsettled `processing` intent look "paid". One installment = one card charge.
    payment_method_types: ["card"],
    transfer_data: await resolveTransferData(supabase, plan.studio_id),
  });

  if (!intent.client_secret) {
    return { ok: false, error: t("stripeNoClientSecret") };
  }

  revalidatePath("/portal/parent/billing");
  revalidatePath("/portal/parent");

  return {
    ok: true,
    data: {
      clientSecret: intent.client_secret,
      planId: plan.id,
      installmentNumber,
      installmentCents,
      totalCents: plan.total_cents,
      installmentCount: plan.installment_count,
    },
  };
}

/** After enrollment invoice is created, start term plan with all open invoices. */
export async function startTermPlanAfterEnrollment(
  newInvoiceId: string,
): Promise<
  ActionResult<{
    clientSecret: string;
    installmentNumber: number;
    installmentCents: number;
    totalCents: number;
    installmentCount: number;
  }>
> {
  return createTermInstallmentIntent([newInvoiceId]);
}
