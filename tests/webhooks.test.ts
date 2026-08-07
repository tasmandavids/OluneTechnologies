import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import {
  classifyPaymentIntent,
  expandedId,
  subscriptionIdFromInvoice,
  paymentIntentIdFromInvoice,
  invoiceAmountCents,
  subscriptionStatusFor,
  subscriptionPeriodEndEpoch,
  subscriptionPeriodEndIso,
  refundDescriptor,
} from "@/lib/webhooks/stripe-events";

describe("classifyPaymentIntent", () => {
  it("classifies an invoice payment and prefers supabase_user_id for payer", () => {
    const t = classifyPaymentIntent({
      invoice_id: "inv_1",
      studio_id: "st_1",
      supabase_user_id: "u_supa",
      user_id: "u_legacy",
    });
    expect(t).toEqual({
      kind: "invoice",
      invoiceId: "inv_1",
      studioId: "st_1",
      payerId: "u_supa",
    });
  });

  it("classifies a term payment plan installment", () => {
    expect(
      classifyPaymentIntent({
        payment_plan_id: "plan_1",
        installment_number: "2",
        studio_id: "st_1",
        supabase_user_id: "u_1",
      }),
    ).toEqual({
      kind: "term_plan",
      planId: "plan_1",
      installmentNumber: 2,
      studioId: "st_1",
      payerId: "u_1",
    });
  });

  it("term plan takes precedence over invoice_id", () => {
    expect(
      classifyPaymentIntent({
        payment_plan_id: "plan_1",
        installment_number: "1",
        invoice_id: "inv_1",
      }).kind,
    ).toBe("term_plan");
  });

  it("falls back to user_id when supabase_user_id is absent", () => {
    const t = classifyPaymentIntent({ invoice_id: "inv_2", user_id: "u_legacy" });
    expect(t).toMatchObject({ kind: "invoice", payerId: "u_legacy", studioId: null });
  });

  it("classifies an order payment (invoice takes precedence over order)", () => {
    expect(classifyPaymentIntent({ order_id: "ord_1" })).toEqual({
      kind: "order",
      orderId: "ord_1",
      // Absent on intents created before studio_id was stamped; the webhook
      // falls back to the order row.
      studioId: null,
    });
    expect(classifyPaymentIntent({ order_id: "ord_1", studio_id: "st_1" })).toEqual({
      kind: "order",
      orderId: "ord_1",
      studioId: "st_1",
    });
    // invoice wins when both present
    expect(classifyPaymentIntent({ invoice_id: "inv_1", order_id: "ord_1" }).kind).toBe(
      "invoice",
    );
  });

  it("classifies a ticket payment with optional user_id", () => {
    expect(classifyPaymentIntent({ event_id: "ev_1", user_id: "u_1", studio_id: "st_1" })).toEqual({
      kind: "ticket",
      eventId: "ev_1",
      userId: "u_1",
      studioId: "st_1",
    });
    expect(classifyPaymentIntent({ event_id: "ev_1" })).toEqual({
      kind: "ticket",
      eventId: "ev_1",
      userId: null,
      // Absent on older intents; the webhook falls back to the owning event.
      studioId: null,
    });
  });

  it("orders precedence order > ticket", () => {
    expect(classifyPaymentIntent({ order_id: "ord_1", event_id: "ev_1" }).kind).toBe("order");
  });

  it("returns 'none' for empty, missing, or whitespace-only metadata", () => {
    expect(classifyPaymentIntent(null)).toEqual({ kind: "none" });
    expect(classifyPaymentIntent(undefined)).toEqual({ kind: "none" });
    expect(classifyPaymentIntent({})).toEqual({ kind: "none" });
    // empty string must not shadow a real later key
    expect(classifyPaymentIntent({ invoice_id: "  ", order_id: "ord_9" })).toEqual({
      kind: "order",
      orderId: "ord_9",
      studioId: null,
    });
    // a whitespace-only studio_id must not be dispatched as a studio
    expect(classifyPaymentIntent({ order_id: "ord_9", studio_id: " " })).toEqual({
      kind: "order",
      orderId: "ord_9",
      studioId: null,
    });
  });
});

describe("expandedId", () => {
  it("reads a bare id string", () => {
    expect(expandedId("sub_1")).toBe("sub_1");
  });
  it("reads .id from an expanded object", () => {
    expect(expandedId({ id: "sub_2" })).toBe("sub_2");
  });
  it("returns null for null/undefined/empty/object-without-id", () => {
    expect(expandedId(null)).toBeNull();
    expect(expandedId(undefined)).toBeNull();
    expect(expandedId("")).toBeNull();
    expect(expandedId({ id: null })).toBeNull();
  });
});

describe("invoice field normalisers", () => {
  it("subscriptionIdFromInvoice handles string, object, and null", () => {
    expect(subscriptionIdFromInvoice({ subscription: "sub_1" })).toBe("sub_1");
    expect(subscriptionIdFromInvoice({ subscription: { id: "sub_2" } })).toBe("sub_2");
    expect(subscriptionIdFromInvoice({ subscription: null })).toBeNull();
    expect(subscriptionIdFromInvoice({})).toBeNull();
  });

  it("paymentIntentIdFromInvoice handles string, object, and null", () => {
    expect(paymentIntentIdFromInvoice({ payment_intent: "pi_1" })).toBe("pi_1");
    expect(paymentIntentIdFromInvoice({ payment_intent: { id: "pi_2" } })).toBe("pi_2");
    expect(paymentIntentIdFromInvoice({ payment_intent: null })).toBeNull();
  });

  it("invoiceAmountCents prefers amount_paid, then total, then 0", () => {
    expect(invoiceAmountCents({ amount_paid: 5000, total: 9999 })).toBe(5000);
    expect(invoiceAmountCents({ amount_paid: null, total: 9999 })).toBe(9999);
    expect(invoiceAmountCents({})).toBe(0);
    // 0 is a real paid amount, not nullish — must be preserved
    expect(invoiceAmountCents({ amount_paid: 0, total: 9999 })).toBe(0);
  });
});

describe("subscriptionStatusFor", () => {
  it("maps deleted events to 'canceled' regardless of object status", () => {
    expect(
      subscriptionStatusFor("customer.subscription.deleted", { status: "active" }),
    ).toBe("canceled");
  });
  it("mirrors the object status for created/updated", () => {
    expect(
      subscriptionStatusFor("customer.subscription.created", { status: "trialing" }),
    ).toBe("trialing");
    expect(
      subscriptionStatusFor("customer.subscription.updated", { status: "past_due" }),
    ).toBe("past_due");
  });
});

describe("subscription period end", () => {
  it("reads current_period_end at the top level", () => {
    expect(subscriptionPeriodEndEpoch({ status: "active", current_period_end: 1_700_000_000 })).toBe(
      1_700_000_000,
    );
  });

  it("falls back to the first subscription item's period end", () => {
    expect(
      subscriptionPeriodEndEpoch({
        status: "active",
        current_period_end: null,
        items: { data: [{ current_period_end: 1_700_000_500 }] },
      }),
    ).toBe(1_700_000_500);
  });

  it("returns null when neither is present", () => {
    expect(subscriptionPeriodEndEpoch({ status: "active" })).toBeNull();
    expect(subscriptionPeriodEndIso({ status: "active" })).toBeNull();
  });

  it("converts the epoch to an ISO string", () => {
    expect(subscriptionPeriodEndIso({ status: "active", current_period_end: 1_700_000_000 })).toBe(
      new Date(1_700_000_000 * 1000).toISOString(),
    );
  });
});

describe("refundDescriptor", () => {
  it("extracts payment intent, refund id, and refunded cents", () => {
    const charge = {
      id: "ch_1",
      payment_intent: "pi_1",
      amount_refunded: 2500,
      refunds: { data: [{ id: "re_1" }] },
    } as unknown as Stripe.Charge;
    expect(refundDescriptor(charge)).toEqual({
      paymentIntentId: "pi_1",
      refundId: "re_1",
      refundedCents: 2500,
    });
  });

  it("reads an expanded payment_intent object", () => {
    const charge = {
      id: "ch_2",
      payment_intent: { id: "pi_2" },
      amount_refunded: 100,
      refunds: { data: [{ id: "re_2" }] },
    } as unknown as Stripe.Charge;
    expect(refundDescriptor(charge).paymentIntentId).toBe("pi_2");
  });

  it("falls back to the charge id when no refund object is expanded", () => {
    const charge = {
      id: "ch_3",
      payment_intent: "pi_3",
      amount_refunded: 0,
    } as unknown as Stripe.Charge;
    expect(refundDescriptor(charge)).toEqual({
      paymentIntentId: "pi_3",
      refundId: "ch_3",
      refundedCents: 0,
    });
  });

  it("returns a null payment intent when absent", () => {
    const charge = { id: "ch_4", refunds: { data: [] } } as unknown as Stripe.Charge;
    expect(refundDescriptor(charge).paymentIntentId).toBeNull();
    expect(refundDescriptor(charge).refundId).toBe("ch_4");
  });
});
