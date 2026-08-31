// ============================================================================
//  The dispatch that keeps Olune's own billing out of a studio's ledger.
//
//  /api/webhooks/stripe serves both directions of money on one Stripe account:
//  a studio charging a parent on auto-pay, and Olune charging the studio. Both
//  produce customer.subscription.* and invoice.* events, indistinguishable by
//  type. If an Olune subscription charge reaches the parent-billing branch it
//  is mirrored into that studio's `invoices` and `payments` and synced to their
//  Xero ledger — Olune's own revenue showing up as theirs.
//
//  These tests are the thing standing between that and production.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";
import { processStripeEvent } from "@/lib/webhooks/process-stripe-event";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

vi.mock("@/lib/xero/webhook-sync", () => ({
  xeroSyncAfterPayment: vi.fn(),
  xeroSyncAfterRefund: vi.fn(),
  xeroSyncTicketByPaymentIntent: vi.fn(),
}));

vi.mock("@/lib/term-payment-plan-service", () => ({ recordTermInstallmentPaid: vi.fn() }));
vi.mock("@/lib/stripe/connect", () => ({ syncStripeAccountStatus: vi.fn() }));
vi.mock("@/lib/integrations/events", () => ({ dispatchStudioEvent: vi.fn() }));

type Op = { table: string; kind: string; payload?: unknown };

/**
 * Minimal Supabase double. Records every table touched, which is the whole
 * assertion: what matters here is not what was written but WHERE.
 */
class SupabaseFake {
  ops: Op[] = [];
  private responses = new Map<string, unknown[]>();

  queue(table: string, kind: string, data: unknown) {
    const key = `${table}:${kind}`;
    this.responses.set(key, [...(this.responses.get(key) ?? []), data]);
  }

  next(table: string, kind: string): { data: unknown; error: undefined } {
    const key = `${table}:${kind}`;
    const queued = this.responses.get(key) ?? [];
    if (!queued.length) return { data: null, error: undefined };
    const [head, ...rest] = queued;
    this.responses.set(key, rest);
    return { data: head, error: undefined };
  }

  tablesTouched(kind?: string): string[] {
    return this.ops.filter((o) => !kind || o.kind === kind).map((o) => o.table);
  }

  from(table: string) {
    return new QueryFake(this, table);
  }
}

class QueryFake implements PromiseLike<{ data: unknown; error: undefined }> {
  private kind: string | null = null;
  private payload: unknown;
  private recorded = false;

  constructor(
    private readonly db: SupabaseFake,
    private readonly table: string,
  ) {}

  insert(payload: unknown) {
    this.kind = "insert";
    this.payload = payload;
    this.record();
    return this;
  }
  update(payload: unknown) {
    this.kind = "update";
    this.payload = payload;
    return this;
  }
  select() {
    if (!this.kind) this.kind = "select";
    this.record();
    return this;
  }
  eq() {
    return this;
  }
  neq() {
    return this;
  }
  limit() {
    return this;
  }
  single() {
    return Promise.resolve(this.resolve());
  }
  maybeSingle() {
    return Promise.resolve(this.resolve());
  }
  then<A = { data: unknown; error: undefined }, B = never>(
    onfulfilled?: ((v: { data: unknown; error: undefined }) => A | PromiseLike<A>) | null,
    onrejected?: ((r: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.resolve()).then(onfulfilled, onrejected);
  }

  private resolve() {
    this.record();
    return this.db.next(this.table, this.kind ?? "select");
  }

  private record() {
    if (this.recorded || !this.kind) return;
    this.db.ops.push({ table: this.table, kind: this.kind, payload: this.payload });
    this.recorded = true;
  }
}

const STUDIO = "11111111-1111-1111-1111-111111111111";
const OLUNE_META = { olune_billing: "studio_plan", studio_id: STUDIO, plan_key: "studio" };

function invoicePaid(metadata: Record<string, string> | undefined, subscription: string): Stripe.Event {
  return {
    id: "evt_inv_1",
    object: "event",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_1",
        object: "invoice",
        amount_paid: 5900,
        currency: "nzd",
        subscription,
        customer: "cus_studio_1",
        ...(metadata ? { metadata } : {}),
      },
    },
  } as unknown as Stripe.Event;
}

function subscriptionEvent(type: string, over: Record<string, unknown> = {}): Stripe.Event {
  return {
    id: `evt_${type}`,
    object: "event",
    type,
    data: {
      object: {
        id: "sub_olune_1",
        object: "subscription",
        status: "active",
        customer: "cus_studio_1",
        cancel_at_period_end: false,
        current_period_end: 1_800_000_000,
        metadata: OLUNE_META,
        items: { data: [{ price: { recurring: { interval: "month" } } }] },
        ...over,
      },
    },
  } as unknown as Stripe.Event;
}

const asServiceClient = (db: SupabaseFake) => db as any;

describe("Olune plan events never reach the parent-billing path", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims invoice.paid by metadata and writes only to studio_subscriptions", async () => {
    const db = new SupabaseFake();
    await processStripeEvent(invoicePaid(OLUNE_META, "sub_olune_1"), asServiceClient(db));

    expect(db.tablesTouched("update")).toEqual(["studio_subscriptions"]);
    // The two tables a mirrored parent charge would have landed in.
    expect(db.tablesTouched()).not.toContain("invoices");
    expect(db.tablesTouched()).not.toContain("payments");
  });

  it("claims an event with no metadata by looking the stripe id up in our own table", async () => {
    // Metadata placement moves between Stripe API versions; the row holding the
    // subscription id does not. This is the check that actually has to hold.
    const db = new SupabaseFake();
    db.queue("studio_subscriptions", "select", { studio_id: STUDIO });

    await processStripeEvent(invoicePaid(undefined, "sub_olune_1"), asServiceClient(db));

    expect(db.tablesTouched("update")).toEqual(["studio_subscriptions"]);
    expect(db.tablesTouched()).not.toContain("invoices");
  });

  it("marks the studio past_due on a failed plan payment", async () => {
    const db = new SupabaseFake();
    const event = {
      id: "evt_fail",
      object: "event",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_2",
          object: "invoice",
          subscription: "sub_olune_1",
          customer: "cus_studio_1",
          metadata: OLUNE_META,
        },
      },
    } as unknown as Stripe.Event;

    await processStripeEvent(event, asServiceClient(db));

    const update = db.ops.find((o) => o.table === "studio_subscriptions" && o.kind === "update");
    expect((update?.payload as Record<string, unknown>).status).toBe("past_due");
    expect(db.tablesTouched()).not.toContain("invoices");
  });

  it("locks the studio when Stripe deletes the subscription", async () => {
    const db = new SupabaseFake();
    await processStripeEvent(
      subscriptionEvent("customer.subscription.deleted"),
      asServiceClient(db),
    );

    const update = db.ops.find((o) => o.table === "studio_subscriptions" && o.kind === "update");
    expect((update?.payload as Record<string, unknown>).status).toBe("canceled");
    // The parent-subscription handler would have written to `subscriptions`.
    expect(db.tablesTouched()).not.toContain("subscriptions");
  });

  it("carries the plan and interval across from the Stripe subscription", async () => {
    const db = new SupabaseFake();
    await processStripeEvent(
      subscriptionEvent("customer.subscription.updated", {
        metadata: { ...OLUNE_META, plan_key: "scale" },
        items: { data: [{ price: { recurring: { interval: "year" } } }] },
      }),
      asServiceClient(db),
    );

    const update = db.ops.find((o) => o.table === "studio_subscriptions" && o.kind === "update");
    const payload = update?.payload as Record<string, unknown>;
    expect(payload.plan_key).toBe("scale");
    expect(payload.billing_interval).toBe("year");
    expect(payload.status).toBe("active");
  });
});

describe("parent billing is unaffected", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets an unclaimed subscription event through to the subscriptions table", async () => {
    // No Olune metadata and no studio_subscriptions row: this is a studio
    // charging a family, and it must behave exactly as it did before 0119.
    const db = new SupabaseFake();
    const event = subscriptionEvent("customer.subscription.updated", {
      id: "sub_parent_1",
      metadata: {},
      customer: "cus_parent_1",
    });

    await processStripeEvent(event, asServiceClient(db));

    expect(db.tablesTouched("update")).toEqual(["subscriptions"]);
    expect(db.tablesTouched()).not.toContain("studio_subscriptions_update");
  });

  it("lets an unclaimed invoice.paid reach the parent invoice mirror", async () => {
    const db = new SupabaseFake();
    await processStripeEvent(invoicePaid(undefined, "sub_parent_1"), asServiceClient(db));

    // First thing the parent path does is try to finalise an existing invoice.
    expect(db.tablesTouched()).toContain("invoices");
  });
});
