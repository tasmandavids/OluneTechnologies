import type { SupabaseClient } from "@supabase/supabase-js";
import { insertSubscriptionInvoice, type LineRow } from "./generate-invoice-shared";

function dueDateFromIssue(issueDate: string): string {
  const d = new Date(`${issueDate}T12:00:00`);
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

export async function generateSubscriptionMonthlyInvoice(
  supabase: SupabaseClient,
  subscriptionId: string,
  billingMonth: string,
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string; skipped?: boolean }> {
  const { data: sub } = await supabase
    .from("subscriptions")
    .select(
      "id, studio_id, payer_id, student_id, status, monthly_amount_cents, plan_label, last_invoiced_month",
    )
    .eq("id", subscriptionId)
    .single();

  if (!sub) return { ok: false, error: "Subscription not found" };
  if (!["active", "trialing", "past_due"].includes(sub.status as string)) {
    return { ok: false, error: "Subscription not active", skipped: true };
  }
  if (sub.last_invoiced_month === billingMonth) {
    return { ok: false, error: "Already invoiced this month", skipped: true };
  }
  if ((sub.monthly_amount_cents as number) <= 0) {
    return { ok: false, error: "Zero amount plan", skipped: true };
  }

  const { data: lines } = await supabase
    .from("subscription_line_items")
    .select("item_type, reference_id, description, quantity, unit_monthly_cents, line_total_cents, sort_order")
    .eq("subscription_id", subscriptionId)
    .order("sort_order");

  const issueDate = `${billingMonth}-01`;
  const amountCents = sub.monthly_amount_cents as number;
  const monthLabel = new Date(`${billingMonth}-01T12:00:00`).toLocaleDateString("en-NZ", {
    month: "long",
    year: "numeric",
  });

  const result = await insertSubscriptionInvoice(supabase, {
    studioId: sub.studio_id as string,
    payerId: sub.payer_id as string,
    studentId: sub.student_id as string | null,
    subscriptionId,
    amountCents,
    dueDate: dueDateFromIssue(issueDate),
    lines: (lines ?? []) as LineRow[],
    lineScale: 1,
    notificationTitle: "Monthly subscription invoice",
    notificationBody: `${sub.plan_label ?? "Your subscription"} — ${monthLabel}. Please review and pay in Olune.`,
    notificationPayload: { subscription_id: subscriptionId, billing_month: billingMonth },
    xeroLineDescription: `${sub.plan_label ?? "Subscription"} — ${monthLabel}`,
  });

  if (!result.ok) return result;

  await supabase
    .from("subscriptions")
    .update({ last_invoiced_month: billingMonth })
    .eq("id", subscriptionId);

  return result;
}
