export type ClassPassRefundPatch = {
  status: "refunded";
  refunded_at: string;
  refund_amount_cents: number;
  stripe_refund_id: string;
};

type RefundUpdateResult = { error: { message: string } | null };
type RefundUpdateChain = PromiseLike<RefundUpdateResult> & {
  eq(column: string, value: string): RefundUpdateChain;
};
type ClassPassRefundTable = {
  update(patch: ClassPassRefundPatch): RefundUpdateChain;
};
type ClassPassRefundClient = {
  from(table: "class_passes"): ClassPassRefundTable;
};

export async function refundPaidClassPassesForInvoice(
  supabase: ClassPassRefundClient,
  invoiceId: string,
  studioId: string,
  patch: ClassPassRefundPatch,
): Promise<string | null> {
  const { error } = await supabase
    .from("class_passes")
    .update(patch)
    .eq("invoice_id", invoiceId)
    .eq("studio_id", studioId)
    .eq("status", "paid");

  return error?.message ?? null;
}

export async function refundPaidClassPassesForPaymentIntent(
  supabase: ClassPassRefundClient,
  paymentIntentId: string,
  patch: ClassPassRefundPatch,
): Promise<string | null> {
  const { error } = await supabase
    .from("class_passes")
    .update(patch)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "paid");

  return error?.message ?? null;
}
