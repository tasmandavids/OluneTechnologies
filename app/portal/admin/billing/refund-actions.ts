"use server";

// ============================================================================
//  Admin · Refund server actions
//
//  Issues a Stripe refund for a paid invoice, shop order or event ticket, then
//  updates refund_amount_cents. Full refunds flip status to 'refunded' (which
//  fires restock / capacity-release triggers). Partial refunds keep status
//  'paid' so the remainder can still be refunded.
//
//  Refunds that originate in the Stripe Dashboard are reconciled by the
//  charge.refunded webhook handler (idempotent on stripe_refund_id).
// ============================================================================

import { revalidatePath } from "next/cache";
import { stripe } from "@/lib/stripe";
import { CURRENCY } from "@/lib/currency";
import { getAdminStudio } from "@/lib/portal/access";
import type { SupabaseClient } from "@supabase/supabase-js";

export type RefundKind = "invoice" | "order" | "ticket" | "class_pass";
export type ActionResult = { ok: true } | { ok: false; error: string };

type Sale = {
  table: "invoices" | "orders" | "event_tickets" | "class_passes";
  id: string;
  studioId: string;
  payerId: string | null;
  intentId: string | null;
  amountCents: number;
  refundedCents: number;
  status: string;
  alreadyFullyRefunded: boolean;
  /** event_tickets are scoped to the studio via their parent event, not a column. */
  studioOk: boolean;
};

/**
 * Load the sale row for a kind + id and normalise the fields the refund flow
 * needs, with a studio-ownership check (defence-in-depth on top of RLS).
 */
async function loadSale(
  supabase: SupabaseClient,
  kind: RefundKind,
  id: string,
  studioId: string,
): Promise<Sale | null> {
  if (kind === "invoice") {
    const { data } = await supabase
      .from("invoices")
      .select("id, studio_id, payer_id, amount_cents, status, stripe_payment_intent_id, refund_amount_cents")
      .eq("id", id)
      .single();
    if (!data) return null;
    const refundedCents = Number(data.refund_amount_cents ?? 0);
    return {
      table: "invoices",
      id: data.id,
      studioId: data.studio_id,
      payerId: data.payer_id,
      intentId: data.stripe_payment_intent_id,
      amountCents: data.amount_cents,
      refundedCents,
      status: data.status,
      alreadyFullyRefunded: data.status === "refunded" || refundedCents >= data.amount_cents,
      studioOk: data.studio_id === studioId,
    };
  }

  if (kind === "order") {
    const { data } = await supabase
      .from("orders")
      .select("id, studio_id, user_id, total_cents, status, stripe_payment_intent_id, refund_amount_cents")
      .eq("id", id)
      .single();
    if (!data) return null;
    const refundedCents = Number(data.refund_amount_cents ?? 0);
    return {
      table: "orders",
      id: data.id,
      studioId: data.studio_id,
      payerId: data.user_id,
      intentId: data.stripe_payment_intent_id,
      amountCents: data.total_cents,
      refundedCents,
      status: data.status,
      alreadyFullyRefunded: data.status === "refunded" || refundedCents >= data.total_cents,
      studioOk: data.studio_id === studioId,
    };
  }

  if (kind === "class_pass") {
    const { data } = await supabase
      .from("class_passes")
      .select("id, studio_id, student_id, price_cents, status, stripe_payment_intent_id, refund_amount_cents")
      .eq("id", id)
      .single();
    if (!data) return null;
    const refundedCents = Number(data.refund_amount_cents ?? 0);
    return {
      table: "class_passes",
      id: data.id,
      studioId: data.studio_id,
      payerId: data.student_id,
      intentId: data.stripe_payment_intent_id,
      amountCents: data.price_cents,
      refundedCents,
      status: data.status,
      alreadyFullyRefunded: data.status === "refunded" || refundedCents >= data.price_cents,
      studioOk: data.studio_id === studioId,
    };
  }

  // ticket — studio ownership comes via the parent event
  const { data } = await supabase
    .from("event_tickets")
    .select(
      "id, user_id, total_cents, status, stripe_payment_intent_id, refund_amount_cents, events!inner ( studio_id )",
    )
    .eq("id", id)
    .single();
  if (!data) return null;
  const ev = data.events as unknown as { studio_id: string } | null;
  const refundedCents = Number(data.refund_amount_cents ?? 0);
  return {
    table: "event_tickets",
    id: data.id,
    studioId: ev?.studio_id ?? "",
    payerId: data.user_id,
    intentId: data.stripe_payment_intent_id,
    amountCents: data.total_cents,
    refundedCents,
    status: data.status,
    alreadyFullyRefunded: data.status === "refunded" || refundedCents >= data.total_cents,
    studioOk: ev?.studio_id === studioId,
  };
}

/**
 * Fully or partially refund a sale. Pass `amountCents` to issue a partial
 * refund (defaults to the remaining unrefunded balance).
 */
export async function refundSale(
  kind: RefundKind,
  id: string,
  amountCents?: number,
): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const sale = await loadSale(supabase, kind, id, studioId);
  if (!sale) return { ok: false, error: "Record not found." };
  if (!sale.studioOk) return { ok: false, error: "Not your studio's record." };
  if (sale.alreadyFullyRefunded) return { ok: false, error: "Already refunded." };
  if (sale.status !== "paid" && sale.status !== "refunded") {
    return { ok: false, error: `Only paid records can be refunded (status: ${sale.status}).` };
  }
  if (sale.status === "refunded") {
    return { ok: false, error: "Already refunded." };
  }
  if (!sale.intentId) {
    return { ok: false, error: "No Stripe payment on file for this record." };
  }

  const remaining = Math.max(0, sale.amountCents - sale.refundedCents);
  if (remaining <= 0) return { ok: false, error: "Already refunded." };

  const refundCents =
    amountCents != null
      ? Math.min(Math.max(0, Math.round(amountCents)), remaining)
      : remaining;
  if (refundCents <= 0) return { ok: false, error: "Refund amount must be positive." };

  // 1. Issue the Stripe refund.
  let refundId: string;
  try {
    const refund = await stripe.refunds.create({
      payment_intent: sale.intentId,
      amount: refundCents,
      metadata: { studio_id: studioId, kind, record_id: id },
    });
    refundId = refund.id;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Stripe refund failed.";
    return { ok: false, error: msg };
  }

  const nowIso = new Date().toISOString();
  const totalRefunded = sale.refundedCents + refundCents;
  const fullyRefunded = totalRefunded >= sale.amountCents;

  // 2. Update local row. Only flip to 'refunded' when fully refunded so
  //    restock / capacity triggers fire once; partials stay 'paid'.
  const { error: updErr } = await supabase
    .from(sale.table)
    .update({
      status: fullyRefunded ? "refunded" : "paid",
      refunded_at: fullyRefunded ? nowIso : null,
      refund_amount_cents: totalRefunded,
      stripe_refund_id: refundId,
    })
    .eq("id", id);

  if (updErr) {
    return {
      ok: false,
      error: `Refunded in Stripe (${refundId}) but failed to update the record: ${updErr.message}`,
    };
  }

  // 3. Negative ledger row so revenue nets out. Idempotent-ish: skip if the
  //    webhook already recorded this refund.
  const { data: existing } = await supabase
    .from("payments")
    .select("id")
    .eq("stripe_refund_id", refundId)
    .limit(1);

  if (!existing || existing.length === 0) {
    await supabase.from("payments").insert({
      studio_id: studioId,
      payer_id: sale.payerId,
      invoice_id: sale.table === "invoices" ? id : null,
      amount_cents: -refundCents,
      currency: CURRENCY,
      stripe_payment_intent_id: sale.intentId,
      stripe_refund_id: refundId,
      status: "refunded",
      description: fullyRefunded ? `Refund — ${kind}` : `Partial refund — ${kind}`,
    });
  }

  revalidatePath("/portal/admin/billing");
  if (kind === "order") revalidatePath("/portal/admin/shop");
  if (kind === "ticket") revalidatePath("/portal/admin/events");
  if (kind === "class_pass") revalidatePath("/portal/admin/passes");

  return { ok: true };
}
