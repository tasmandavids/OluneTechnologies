// ============================================================================
//  lib/webhooks/stripe-events.ts
//
//  PURE Stripe-webhook decision logic — no IO, no Supabase, fully unit-testable.
//
//  The webhook route (`app/api/webhooks/stripe/route.ts`) is mostly DB writes,
//  but the *decisions* it makes — which sale a payment_intent belongs to, how a
//  Stripe object's loosely-typed fields are normalised, what status a
//  subscription event maps to — are pure functions of the incoming event. They
//  live here so they can be exercised across every branch without a live DB or
//  Stripe. The route imports these and only keeps the persistence around them.
// ============================================================================

import type Stripe from "stripe";

// ── payment_intent.succeeded routing ────────────────────────────────────────

/** Which kind of sale a succeeded PaymentIntent finalises. */
export type PaymentIntentKind = "invoice" | "order" | "ticket" | "term_plan" | "class_pass" | "none";

export type PaymentIntentTarget =
  | { kind: "invoice"; invoiceId: string; studioId: string | null; payerId: string | null }
  | {
      kind: "term_plan";
      planId: string;
      installmentNumber: number;
      studioId: string | null;
      payerId: string | null;
    }
  | { kind: "order"; orderId: string }
  | { kind: "ticket"; eventId: string; userId: string | null }
  | { kind: "class_pass"; passId: string; userId: string | null }
  | { kind: "none" };

/**
 * Classify a PaymentIntent by its metadata. Mirrors the precedence the route
 * relies on: invoice → order → ticket → none. Metadata is attacker-influenced
 * only insofar as we set it ourselves on creation, but we still treat empty
 * strings as absent so a stray `invoice_id=""` doesn't shadow a real order.
 */
export function classifyPaymentIntent(
  meta: Stripe.Metadata | null | undefined,
): PaymentIntentTarget {
  const m = meta ?? {};
  const planId = nonEmpty(m.payment_plan_id);
  const installmentRaw = nonEmpty(m.installment_number);
  const invoiceId = nonEmpty(m.invoice_id);
  const orderId = nonEmpty(m.order_id);
  const eventId = nonEmpty(m.event_id);
  const passId = nonEmpty(m.class_pass_id);

  if (planId) {
    const installmentNumber = installmentRaw ? Number.parseInt(installmentRaw, 10) : NaN;
    return {
      kind: "term_plan",
      planId,
      installmentNumber: Number.isFinite(installmentNumber) ? installmentNumber : 0,
      studioId: nonEmpty(m.studio_id),
      payerId: nonEmpty(m.supabase_user_id) ?? nonEmpty(m.user_id),
    };
  }

  if (invoiceId) {
    return {
      kind: "invoice",
      invoiceId,
      studioId: nonEmpty(m.studio_id),
      // Enrollment flow stamps supabase_user_id; older flows used user_id.
      payerId: nonEmpty(m.supabase_user_id) ?? nonEmpty(m.user_id),
    };
  }
  if (orderId) return { kind: "order", orderId };
  if (eventId) return { kind: "ticket", eventId, userId: nonEmpty(m.user_id) };
  if (passId) return { kind: "class_pass", passId, userId: nonEmpty(m.user_id) };
  return { kind: "none" };
}

// ── Stripe object field normalisers ─────────────────────────────────────────

/**
 * A Stripe field that may be an expanded object, a bare id string, or null.
 * `invoice.subscription`, `invoice.payment_intent`, `charge.payment_intent`
 * all take this shape depending on expansion settings + API version.
 */
type ExpandableId = string | { id?: string | null } | null | undefined;

/** Pull the id from an expandable Stripe reference (string | object | null). */
export function expandedId(ref: ExpandableId): string | null {
  if (!ref) return null;
  if (typeof ref === "string") return ref || null;
  return ref.id ?? null;
}

type InvoiceLike = {
  subscription?: ExpandableId;
  payment_intent?: ExpandableId;
};

/** The Stripe subscription id an invoice belongs to, if any. */
export function subscriptionIdFromInvoice(invoice: InvoiceLike): string | null {
  return expandedId(invoice.subscription);
}

/** The PaymentIntent id that paid an invoice, if any. */
export function paymentIntentIdFromInvoice(invoice: InvoiceLike): string | null {
  return expandedId(invoice.payment_intent);
}

/** Amount actually paid on an invoice, falling back to its total, then 0. */
export function invoiceAmountCents(
  invoice: { amount_paid?: number | null; total?: number | null },
): number {
  return invoice.amount_paid ?? invoice.total ?? 0;
}

// ── customer.subscription.* normalisers ─────────────────────────────────────

type SubscriptionEventType =
  | "customer.subscription.created"
  | "customer.subscription.updated"
  | "customer.subscription.deleted";

type SubscriptionLike = {
  status: Stripe.Subscription.Status;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean | null;
  items?: { data?: Array<{ current_period_end?: number }> };
};

/**
 * The status to persist for a subscription event. A `deleted` event always
 * means canceled regardless of the object's own status; otherwise mirror it.
 */
export function subscriptionStatusFor(
  eventType: SubscriptionEventType,
  sub: Pick<SubscriptionLike, "status">,
): string {
  return eventType === "customer.subscription.deleted" ? "canceled" : sub.status;
}

/**
 * The current-period-end epoch (seconds) for a subscription. Newer API
 * versions moved this onto the subscription item, so fall back there.
 */
export function subscriptionPeriodEndEpoch(sub: SubscriptionLike): number | null {
  return sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
}

/** ISO timestamp for the subscription period end, or null when unknown. */
export function subscriptionPeriodEndIso(sub: SubscriptionLike): string | null {
  const epoch = subscriptionPeriodEndEpoch(sub);
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}

// ── charge.refunded descriptor ──────────────────────────────────────────────

export type RefundDescriptor = {
  /** PaymentIntent the refunded charge belongs to (our join key). */
  paymentIntentId: string | null;
  /** Stripe refund id, used as the idempotency key on the ledger row. */
  refundId: string;
  /** Cumulative cents refunded on the charge. */
  refundedCents: number;
};

/**
 * Normalise a charge.refunded event's Charge into the fields the route needs.
 * `refundId` falls back to the charge id when no refund object is expanded so
 * the idempotency key is always defined.
 */
export function refundDescriptor(charge: Stripe.Charge): RefundDescriptor {
  return {
    paymentIntentId: expandedId(charge.payment_intent as ExpandableId),
    refundId: charge.refunds?.data?.[0]?.id ?? charge.id,
    refundedCents: charge.amount_refunded ?? 0,
  };
}

// ── internal ─────────────────────────────────────────────────────────────────

/** Treat empty / whitespace-only strings as absent. */
function nonEmpty(v: string | null | undefined): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}
