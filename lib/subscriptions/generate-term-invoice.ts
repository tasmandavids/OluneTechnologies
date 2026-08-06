import type { SupabaseClient } from "@supabase/supabase-js";
import { insertSubscriptionInvoice, type LineRow } from "./generate-invoice-shared";
import { termLengthMonths } from "./pricing";

export type StudioTerm = {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
};

export async function generateSubscriptionTermInvoice(
  supabase: SupabaseClient,
  subscriptionId: string,
  term: StudioTerm,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string; skipped?: boolean }> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select(
      "id, studio_id, payer_id, student_id, status, monthly_amount_cents, plan_label, last_invoiced_term_id",
    )
    .eq("id", subscriptionId)
    .single();

  if (!sub) return { ok: false, error: "Subscription not found" };
  if (!["active", "trialing", "past_due"].includes(sub.status as string)) {
    return { ok: false, error: "Subscription not active", skipped: true };
  }
  if (sub.last_invoiced_term_id === term.id) {
    return { ok: false, error: "Already invoiced this term", skipped: true };
  }
  if ((sub.monthly_amount_cents as number) <= 0) {
    return { ok: false, error: "Zero amount plan", skipped: true };
  }

  const { data: lines } = await supabase
    .from("subscription_line_items")
    .select("item_type, reference_id, product_id, description, quantity, unit_monthly_cents, line_total_cents, sort_order, product:billing_products ( account_code, item_code, tax_treatment, tax_rate_bp )")
    .eq("subscription_id", subscriptionId)
    .order("sort_order");

  const monthsInTerm = termLengthMonths(term.start_date, term.end_date);
  const amountCents = Math.round((sub.monthly_amount_cents as number) * monthsInTerm);

  const dateRange = `${formatDate(term.start_date)} – ${formatDate(term.end_date)}`;

  const result = await insertSubscriptionInvoice(supabase, {
    studioId: sub.studio_id as string,
    payerId: sub.payer_id as string,
    studentId: sub.student_id as string | null,
    subscriptionId,
    amountCents,
    dueDate: term.start_date,
    lines: (lines ?? []) as LineRow[],
    lineScale: monthsInTerm,
    notificationTitle: `${term.name} invoice`,
    notificationBody: `${sub.plan_label ?? "Your subscription"} — ${term.name} (${dateRange}). Please review and pay in Olune.`,
    notificationPayload: { subscription_id: subscriptionId, term_id: term.id },
    xeroLineDescription: `${sub.plan_label ?? "Subscription"} — ${term.name} (${dateRange})`,
  });

  if (!result.ok) return result;

  await supabase
    .from("subscriptions")
    .update({ last_invoiced_term_id: term.id })
    .eq("id", subscriptionId);

  return result;
}

function formatDate(ymd: string): string {
  return new Date(`${ymd}T12:00:00`).toLocaleDateString("en-NZ", { day: "numeric", month: "short" });
}
