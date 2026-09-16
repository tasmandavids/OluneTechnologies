"use server";

import { getTranslations } from "@/lib/i18n/server";
import { z } from "zod";
import { requirePortalSession } from "@/lib/portal/session";

const CreatePlanSchema = z.object({
  payer_id: z.string().uuid(),
  total_cents: z.number().int().positive(),
  installment_count: z.number().int().min(2).max(12),
  first_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoice_ids: z.array(z.string().uuid()).optional(),
});

function splitInstallments(total: number, count: number): number[] {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => (i === count - 1 ? base + remainder : base));
}

export async function createTermPaymentPlan(data: z.infer<typeof CreatePlanSchema>) {
  const { supabase, studioId } = await requirePortalSession();
  const p = CreatePlanSchema.parse(data);

  const installment_amounts = splitInstallments(p.total_cents, p.installment_count);

  const { data: plan, error } = await supabase
    .from("term_payment_plans")
    .insert({
      studio_id: studioId,
      payer_id: p.payer_id,
      total_cents: p.total_cents,
      installment_count: p.installment_count,
      installment_amounts,
      next_due_date: p.first_due_date,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  // Link invoices to plan if provided
  if (p.invoice_ids?.length && plan) {
    await supabase.from("term_payment_plan_invoices").insert(
      p.invoice_ids.map((invoice_id) => ({ plan_id: plan.id, invoice_id })),
    );
  }

  return { ok: true, planId: plan?.id };
}

export async function cancelTermPaymentPlan(planId: string) {
  const { supabase } = await requirePortalSession();
  const { error } = await supabase
    .from("term_payment_plans")
    .update({ status: "cancelled" })
    .eq("id", planId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function recordInstallmentPayment(planId: string, amountCents: number) {
  const t = await getTranslations("errors.installment");
  const input = z.object({ planId: z.string().uuid(), amountCents: z.number().int().positive().max(2147483647) })
    .safeParse({ planId, amountCents });
  if (!input.success) return { error: t("invalid") };
  const { supabase, role } = await requirePortalSession();
  if (role !== "admin" && role !== "office") return { error: t("permission") };
  const { error } = await supabase.rpc("admin_record_installment_payment", {
    p_plan_id: planId,
    p_amount_cents: amountCents,
  });
  if (error) return { error: error.message };
  return { ok: true };
}
