// ============================================================================
//  The individual refunds behind a `charge.refunded` event (audit B-03).
//
//  The event carries the charge, whose `amount_refunded` is a running total.
//  Recording that total as one refund double-counts every earlier refund, and
//  `charge.refunds` is no longer included in event payloads on current API
//  versions. So each refund is identified on its own and recorded once.
// ============================================================================

import type Stripe from "stripe";

export type ChargeRefund = { id: string; amountCents: number };

/** Refunds that moved (or will move) money. Failed and cancelled ones did not. */
function counts(r: Pick<Stripe.Refund, "status">): boolean {
  return r.status !== "failed" && r.status !== "canceled";
}

/**
 * Every live refund on the charge, newest first. Uses the payload's expanded
 * list when present, otherwise asks Stripe (on the connected account when the
 * event came from one). Throws when Stripe cannot be reached, so the webhook
 * fails and Stripe retries rather than recording a guess.
 */
export async function listChargeRefunds(
  charge: Stripe.Charge,
  accountId?: string | null,
): Promise<ChargeRefund[]> {
  const inline = charge.refunds?.data;
  if (inline && inline.length) {
    return inline.filter(counts).map((r) => ({
      id: r.id,
      // Older fixtures and API versions omit the amount on a lone refund.
      amountCents: r.amount ?? (inline.length === 1 ? (charge.amount_refunded ?? 0) : 0),
    }));
  }

  const { stripe } = await import("@/lib/stripe");
  const out: ChargeRefund[] = [];
  for await (const r of stripe.refunds.list(
    { charge: charge.id, limit: 100 },
    accountId ? { stripeAccount: accountId } : undefined,
  )) {
    if (counts(r)) out.push({ id: r.id, amountCents: r.amount });
  }
  return out;
}

/** True when the charge has been refunded in full. */
export function isFullyRefunded(charge: Stripe.Charge): boolean {
  if (charge.amount == null) return charge.refunded !== false;
  return charge.refunded === true || (charge.amount_refunded ?? 0) >= charge.amount;
}
