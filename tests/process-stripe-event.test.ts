import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { processStripeEvent } from "@/lib/webhooks/process-stripe-event";
import { CLASS_PASS_XERO_ACCOUNT_CODE } from "@/lib/passes/constants";
import { xeroSyncAfterPayment, xeroSyncAfterRefund } from "@/lib/xero/webhook-sync";
import { dispatchStudioEvent } from "@/lib/integrations/events";

vi.mock("@/lib/xero/webhook-sync", () => ({
  xeroSyncAfterPayment: vi.fn(),
  xeroSyncAfterRefund: vi.fn(),
  xeroSyncTicketByPaymentIntent: vi.fn(),
}));

vi.mock("@/lib/term-payment-plan-service", () => ({
  recordTermInstallmentPaid: vi.fn(),
}));

vi.mock("@/lib/stripe/connect", () => ({
  syncStripeAccountStatus: vi.fn(),
}));

vi.mock("@/lib/integrations/events", () => ({
  dispatchStudioEvent: vi.fn(),
}));

type Operation =
  | { table: string; kind: "insert"; payload: unknown }
  | { table: string; kind: "update"; payload: Record<string, unknown>; filters: Filter[] };

type Filter = { op: "eq" | "neq"; column: string; value: unknown };

type QueryResponse = {
  data?: unknown;
  error?: { message: string };
};

class SupabaseFake {
  operations: Operation[] = [];
  private responses = new Map<string, QueryResponse[]>();

  queue(table: string, kind: string, response: QueryResponse) {
    const key = `${table}:${kind}`;
    this.responses.set(key, [...(this.responses.get(key) ?? []), response]);
  }

  from(table: string) {
    return new QueryFake(this, table);
  }

  next(table: string, kind: string): QueryResponse {
    const key = `${table}:${kind}`;
    const queued = this.responses.get(key) ?? [];
    if (queued.length === 0) return { data: null, error: undefined };
    const [response, ...rest] = queued;
    this.responses.set(key, rest);
    return response;
  }
}

class QueryFake implements PromiseLike<QueryResponse> {
  private filters: Filter[] = [];
  private kind: "insert" | "update" | "select" | null = null;
  private payload: unknown;
  private recorded = false;

  constructor(
    private readonly supabase: SupabaseFake,
    private readonly table: string,
  ) {}

  insert(payload: unknown) {
    this.kind = "insert";
    this.payload = payload;
    this.supabase.operations.push({ table: this.table, kind: "insert", payload });
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.kind = "update";
    this.payload = payload;
    return this;
  }

  select(_columns?: string) {
    if (!this.kind) this.kind = "select";
    this.recordUpdate();
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push({ op: "neq", column, value });
    return this;
  }

  limit(_count: number) {
    return this;
  }

  single() {
    return Promise.resolve(this.resolve());
  }

  maybeSingle() {
    return Promise.resolve(this.resolve());
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }

  private resolve(): QueryResponse {
    this.recordUpdate();
    return this.supabase.next(this.table, this.kind ?? "select");
  }

  private recordUpdate() {
    if (this.kind === "update" && !this.recorded) {
      this.supabase.operations.push({
        table: this.table,
        kind: "update",
        payload: this.payload as Record<string, unknown>,
        filters: [...this.filters],
      });
      this.recorded = true;
    }
  }
}

function paymentIntentSucceeded(metadata: Stripe.Metadata): Stripe.Event {
  return {
    id: "evt_1",
    object: "event",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_class_pass_1",
        object: "payment_intent",
        amount_received: 2500,
        currency: "nzd",
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

function chargeRefunded(overrides: Partial<Stripe.Charge> = {}): Stripe.Event {
  return {
    id: "evt_refund_1",
    object: "event",
    type: "charge.refunded",
    data: {
      object: {
        id: "ch_1",
        object: "charge",
        amount_refunded: 2500,
        currency: "nzd",
        payment_intent: "pi_class_pass_1",
        refunds: { data: [{ id: "re_1" }] },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

function hasFilter(operation: Operation, column: string, value: unknown) {
  return operation.kind === "update" && operation.filters.some((filter) => filter.column === column && filter.value === value);
}

describe("processStripeEvent class-pass payments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks a reserved pass paid and mirrors the sale into invoice, line item, payment, notification, and Xero sync", async () => {
    const supabase = new SupabaseFake();
    // The pass carries its catalogue product (0105), so the invoice takes its
    // name, ledger codes and tax treatment from there rather than a constant.
    supabase.queue("class_passes", "update", {
      data: [
        {
          id: "pass_1",
          studio_id: "studio_1",
          student_id: "student_1",
          product_id: "prod_pass",
          product: {
            name: "Casual class pass",
            account_code: CLASS_PASS_XERO_ACCOUNT_CODE,
            item_code: null,
            tax_treatment: "standard",
            tax_rate_bp: 1500,
          },
        },
      ],
    });
    supabase.queue("invoices", "insert", { data: { id: "invoice_1" } });

    await processStripeEvent(
      paymentIntentSucceeded({
        class_pass_id: "pass_1",
        user_id: "student_1",
        studio_id: "studio_1",
      }),
      supabase as never,
    );

    const paidUpdate = supabase.operations.find(
      (operation) => operation.kind === "update" && operation.table === "class_passes" && operation.payload.status === "paid",
    );
    expect(paidUpdate).toBeDefined();
    expect(paidUpdate).toSatisfy((operation: Operation) => hasFilter(operation, "id", "pass_1"));
    expect(paidUpdate).toSatisfy((operation: Operation) => hasFilter(operation, "stripe_payment_intent_id", "pi_class_pass_1"));
    expect(paidUpdate).toSatisfy((operation: Operation) => hasFilter(operation, "status", "reserved"));

    expect(supabase.operations).toContainEqual({
      table: "invoices",
      kind: "insert",
      payload: expect.objectContaining({
        studio_id: "studio_1",
        payer_id: "student_1",
        student_id: "student_1",
        amount_cents: 2500,
        gst_cents: 326,
        status: "paid",
        stripe_payment_intent_id: "pi_class_pass_1",
      }),
    });
    expect(supabase.operations).toContainEqual({
      table: "invoice_line_items",
      kind: "insert",
      payload: {
        invoice_id: "invoice_1",
        item_type: "custom",
        reference_id: "pass_1",
        product_id: "prod_pass",
        description: "Casual class pass",
        quantity: 1,
        unit_cents: 2500,
        line_total_cents: 2500,
        sort_order: 0,
        account_code: CLASS_PASS_XERO_ACCOUNT_CODE,
        item_code: null,
        tax_treatment: "standard",
        tax_rate_bp: 1500,
      },
    });
    expect(supabase.operations).toContainEqual({
      table: "payments",
      kind: "insert",
      payload: expect.objectContaining({
        studio_id: "studio_1",
        payer_id: "student_1",
        invoice_id: "invoice_1",
        amount_cents: 2500,
        currency: "nzd",
        stripe_payment_intent_id: "pi_class_pass_1",
        status: "succeeded",
      }),
    });
    expect(supabase.operations).toContainEqual({
      table: "notifications",
      kind: "insert",
      payload: expect.objectContaining({
        studio_id: "studio_1",
        user_id: "student_1",
        type: "class_pass_paid",
        link: "/portal/student",
      }),
    });
    expect(xeroSyncAfterPayment).toHaveBeenCalledWith(supabase, "invoice", "invoice_1");
  });

  it("refund reconciliation only targets class passes still in paid status", async () => {
    const supabase = new SupabaseFake();
    supabase.queue("payments", "select", { data: [] });
    supabase.queue("invoices", "update", {
      data: [{ id: "invoice_1", studio_id: "studio_1", payer_id: "student_1" }],
    });

    await processStripeEvent(chargeRefunded(), supabase as never);

    const passRefundUpdate = supabase.operations.find(
      (operation) => operation.kind === "update" && operation.table === "class_passes" && operation.payload.status === "refunded",
    );
    expect(passRefundUpdate).toBeDefined();
    expect(passRefundUpdate).toSatisfy((operation: Operation) =>
      hasFilter(operation, "stripe_payment_intent_id", "pi_class_pass_1"),
    );
    expect(passRefundUpdate).toSatisfy((operation: Operation) => hasFilter(operation, "status", "paid"));
    expect(passRefundUpdate).not.toSatisfy((operation: Operation) => hasFilter(operation, "status", "redeemed"));
    expect(xeroSyncAfterRefund).toHaveBeenCalledWith(supabase, "invoice", "invoice_1", 2500);
  });
});

// ============================================================================
//  Outbound events for shop orders and event tickets.
//
//  The bug this guards against: until 2026-08-07 these two branches finalised
//  the sale and emitted nothing, so a studio's Zapier or webhook automation saw
//  enrolments and invoices but silently never saw a shop order or a ticket. A
//  silent omission has no error to notice, so it needs a test rather than a
//  code reading.
//
//  Both paths must survive an intent created BEFORE studio_id was stamped on
//  metadata — those are still in flight in Stripe — which is why the fallback
//  to the row is exercised here alongside the metadata case.
// ============================================================================

describe("processStripeEvent order and ticket dispatch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("emits payment.succeeded for a shop order using metadata's studio", async () => {
    const supabase = new SupabaseFake();
    supabase.queue("orders", "update", { data: [{ id: "ord_1", studio_id: "studio_row" }] });

    await processStripeEvent(
      paymentIntentSucceeded({ order_id: "ord_1", studio_id: "studio_meta" }),
      supabase as never,
    );

    expect(dispatchStudioEvent).toHaveBeenCalledWith({
      type: "payment.succeeded",
      studioId: "studio_meta",
      data: {
        source: "order",
        orderId: "ord_1",
        amountCents: 2500,
        currency: "nzd",
        paymentIntentId: "pi_class_pass_1",
      },
    });
  });

  it("falls back to the order row when the intent predates the metadata stamp", async () => {
    const supabase = new SupabaseFake();
    supabase.queue("orders", "update", { data: [{ id: "ord_1", studio_id: "studio_row" }] });

    await processStripeEvent(paymentIntentSucceeded({ order_id: "ord_1" }), supabase as never);

    expect(dispatchStudioEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "payment.succeeded", studioId: "studio_row" }),
    );
  });

  it("does not emit when an order's studio cannot be resolved at all", async () => {
    // Dispatch needs a studio to find endpoints; guessing would post one
    // studio's payment to another's webhook.
    const supabase = new SupabaseFake();
    supabase.queue("orders", "update", { data: [{ id: "ord_1", studio_id: null }] });

    await processStripeEvent(paymentIntentSucceeded({ order_id: "ord_1" }), supabase as never);

    expect(dispatchStudioEvent).not.toHaveBeenCalled();
  });

  it("does not emit when the order update matched no row", async () => {
    // A PI mismatch means we never marked it paid — emitting would tell the
    // studio money arrived for an order we did not finalise.
    const supabase = new SupabaseFake();
    supabase.queue("orders", "update", { data: [] });

    await processStripeEvent(
      paymentIntentSucceeded({ order_id: "ord_1", studio_id: "studio_meta" }),
      supabase as never,
    );

    expect(dispatchStudioEvent).not.toHaveBeenCalled();
  });

  it("emits payment.succeeded for a ticket, resolving the studio via its event", async () => {
    const supabase = new SupabaseFake();
    supabase.queue("events", "select", { data: { studio_id: "studio_from_event" } });

    await processStripeEvent(
      paymentIntentSucceeded({ event_id: "ev_1", user_id: "u_1" }),
      supabase as never,
    );

    expect(dispatchStudioEvent).toHaveBeenCalledWith({
      type: "payment.succeeded",
      studioId: "studio_from_event",
      data: {
        source: "ticket",
        eventId: "ev_1",
        amountCents: 2500,
        currency: "nzd",
        paymentIntentId: "pi_class_pass_1",
      },
    });
  });

  it("skips the event lookup when a ticket intent carries its studio", async () => {
    const supabase = new SupabaseFake();

    await processStripeEvent(
      paymentIntentSucceeded({ event_id: "ev_1", studio_id: "studio_meta" }),
      supabase as never,
    );

    expect(dispatchStudioEvent).toHaveBeenCalledWith(
      expect.objectContaining({ studioId: "studio_meta" }),
    );
    expect(supabase.operations.some((operation) => operation.table === "events")).toBe(false);
  });

  it("carries no personal detail in either payload", async () => {
    // Rule 3 in lib/integrations/events.ts — the endpoint is the studio's, but
    // it is still off our infrastructure. user_id is in the intent metadata and
    // must not be forwarded.
    const supabase = new SupabaseFake();
    supabase.queue("orders", "update", { data: [{ id: "ord_1", studio_id: "studio_1" }] });

    await processStripeEvent(
      paymentIntentSucceeded({ order_id: "ord_1", user_id: "u_secret" }),
      supabase as never,
    );

    const payload = JSON.stringify(vi.mocked(dispatchStudioEvent).mock.calls[0]?.[0]);
    expect(payload).not.toContain("u_secret");
  });
});
