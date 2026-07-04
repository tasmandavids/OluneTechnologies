import type { SupabaseClient } from "@supabase/supabase-js";
import { gstComponentCents } from "@/lib/currency";
import { xeroSyncOutstandingInvoice } from "@/lib/xero/webhook-sync";

export type LineRow = {
  item_type: string;
  reference_id: string | null;
  description: string;
  quantity: number;
  unit_monthly_cents: number;
  line_total_cents: number;
  sort_order: number;
};

/**
 * Shared write path for a subscription-derived invoice: creates the invoice
 * row, its line items (scaled by `lineScale` — 1 for a monthly invoice, the
 * term-length multiplier for a term invoice), a parent notification, and the
 * outstanding Xero sync. Used by both the monthly and term generators so the
 * two billing periods can't drift apart on how an invoice actually gets built.
 */
export async function insertSubscriptionInvoice(
  supabase: SupabaseClient,
  params: {
    studioId: string;
    payerId: string;
    studentId: string | null;
    subscriptionId: string;
    amountCents: number;
    dueDate: string;
    lines: LineRow[];
    lineScale: number;
    notificationTitle: string;
    notificationBody: string;
    notificationPayload: Record<string, unknown>;
    xeroLineDescription: string;
  },
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }> {
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      studio_id: params.studioId,
      payer_id: params.payerId,
      student_id: params.studentId,
      subscription_id: params.subscriptionId,
      amount_cents: params.amountCents,
      gst_cents: gstComponentCents(params.amountCents),
      status: "sent",
      due_date: params.dueDate,
      issued_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (invErr || !invoice) {
    return { ok: false, error: invErr?.message ?? "Could not create invoice" };
  }

  const invoiceId = invoice.id as string;

  if (params.lines.length) {
    await supabase.from("invoice_line_items").insert(
      params.lines.map((line) => ({
        invoice_id: invoiceId,
        item_type: line.item_type,
        reference_id: line.reference_id,
        description: line.description,
        quantity: line.quantity,
        unit_cents: Math.round(line.unit_monthly_cents * params.lineScale),
        line_total_cents: Math.round(line.line_total_cents * params.lineScale),
        sort_order: line.sort_order,
      })),
    );
  }

  await supabase.from("notifications").insert({
    studio_id: params.studioId,
    user_id: params.payerId,
    type: "invoice_sent",
    title: params.notificationTitle,
    body: params.notificationBody,
    link: "/portal/parent",
    payload: { ...params.notificationPayload, invoice_id: invoiceId },
  });

  await xeroSyncOutstandingInvoice(supabase, invoiceId, {
    lineDescription: params.xeroLineDescription,
  });

  return { ok: true, invoiceId };
}
