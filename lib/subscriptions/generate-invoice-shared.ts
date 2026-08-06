import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStudioTaxSettings } from "@/lib/billing/catalog";
import { totalInvoice } from "@/lib/billing/tax";
import type { TaxTreatment } from "@/lib/billing/types";
import { xeroSyncOutstandingInvoice } from "@/lib/xero/webhook-sync";
import { dispatchStudioEvent } from "@/lib/integrations/events";

export type LineRow = {
  item_type: string;
  reference_id: string | null;
  product_id?: string | null;
  description: string;
  quantity: number;
  unit_monthly_cents: number;
  line_total_cents: number;
  sort_order: number;
  /**
   * Embedded catalogue row, when the subscription line points at a product.
   * PostgREST types a to-one embed as an array, so accept either shape.
   */
  product?: EmbeddedProduct | EmbeddedProduct[] | null;
};

type EmbeddedProduct = {
  account_code: string | null;
  item_code: string | null;
  tax_treatment: string | null;
  tax_rate_bp: number | null;
};

function embeddedProduct(raw: LineRow["product"]): EmbeddedProduct | null {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] ?? null : raw;
}

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
  const taxSettings = await loadStudioTaxSettings(supabase, params.studioId);

  const rows = params.lines.map((line) => {
    const product = embeddedProduct(line.product);
    return {
      item_type: line.item_type,
      reference_id: line.reference_id,
      product_id: line.product_id ?? null,
      description: line.description,
      quantity: line.quantity,
      unit_cents: Math.round(line.unit_monthly_cents * params.lineScale),
      line_total_cents: Math.round(line.line_total_cents * params.lineScale),
      sort_order: line.sort_order,
      account_code: product?.account_code ?? null,
      item_code: product?.item_code ?? null,
      tax_treatment: (product?.tax_treatment ?? "standard") as TaxTreatment,
      tax_rate_bp: Number(product?.tax_rate_bp ?? 1500),
    };
  });

  // params.amountCents is the authoritative total (it's what the Stripe
  // subscription charges); the tax split is derived from the lines so a
  // zero-rated or exempt line doesn't get GST applied to it.
  const derived = totalInvoice(
    rows.map((r) => ({
      lineTotalCents: r.line_total_cents,
      taxTreatment: r.tax_treatment,
      taxRateBp: r.tax_rate_bp,
    })),
    { inclusive: taxSettings.pricesIncludeTax, registered: taxSettings.gstRegistered },
  );
  const taxCents = rows.length ? derived.taxCents : 0;

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      studio_id: params.studioId,
      payer_id: params.payerId,
      student_id: params.studentId,
      subscription_id: params.subscriptionId,
      amount_cents: params.amountCents,
      subtotal_cents: params.amountCents - taxCents,
      gst_cents: taxCents,
      tax_inclusive: taxSettings.pricesIncludeTax,
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

  if (rows.length) {
    await supabase
      .from("invoice_line_items")
      .insert(rows.map((r) => ({ ...r, invoice_id: invoiceId })));
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

  dispatchStudioEvent({
    type: "invoice.sent",
    studioId: params.studioId,
    data: {
      invoiceId,
      subscriptionId: params.subscriptionId ?? null,
      amountCents: params.amountCents,
      dueDate: params.dueDate ?? null,
    },
  });

  await xeroSyncOutstandingInvoice(supabase, invoiceId, {
    lineDescription: params.xeroLineDescription,
  });

  return { ok: true, invoiceId };
}
