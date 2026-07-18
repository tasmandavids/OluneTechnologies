import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

vi.mock("@/lib/term-payment-plan-service", () => ({
  recordTermInstallmentPaid: vi.fn(),
}));

vi.mock("@/lib/xero/webhook-sync", () => ({
  xeroSyncAfterPayment: vi.fn(),
  xeroSyncAfterRefund: vi.fn(),
  xeroSyncTicketByPaymentIntent: vi.fn(),
}));

vi.mock("@/lib/stripe/connect", () => ({
  syncStripeAccountStatus: vi.fn(),
}));

import { processStripeEvent } from "@/lib/webhooks/process-stripe-event";

type ClassPassRow = { id: string; studio_id: string; student_id: string };
type Filter = { column: string; value: unknown };
type UpdateOperation = {
  table: string;
  values: Record<string, unknown>;
  filters: Filter[];
  columns: string;
};
type InsertOperation = { table: string; values: Record<string, unknown> };

function classPassPaymentEvent(
  metadata: Stripe.Metadata = { class_pass_id: "pass_1", user_id: "student_1" },
): Stripe.Event {
  return {
    id: "evt_1",
    type: "payment_intent.succeeded",
    data: {
      object: {
        id: "pi_pass_1",
        amount_received: 2500,
        currency: "nzd",
        metadata,
      },
    },
  } as unknown as Stripe.Event;
}

function makeSupabase(updatedPasses: ClassPassRow[]) {
  const updates: UpdateOperation[] = [];
  const inserts: InsertOperation[] = [];

  return {
    updates,
    inserts,
    supabase: {
      from(table: string) {
        if (table === "class_passes") {
          return new ClassPassUpdateBuilder(table, updatedPasses, updates);
        }
        return {
          insert(values: Record<string, unknown>) {
            inserts.push({ table, values });
            return Promise.resolve({ data: null, error: null });
          },
        };
      },
    } as unknown as Parameters<typeof processStripeEvent>[1],
  };
}

class ClassPassUpdateBuilder {
  private values: Record<string, unknown> = {};
  private filters: Filter[] = [];

  constructor(
    private readonly table: string,
    private readonly rows: ClassPassRow[],
    private readonly updates: UpdateOperation[],
  ) {}

  update(values: Record<string, unknown>) {
    this.values = values;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  select(columns: string) {
    this.updates.push({
      table: this.table,
      values: this.values,
      filters: this.filters,
      columns,
    });
    return Promise.resolve({ data: this.rows, error: null });
  }
}

describe("processStripeEvent class pass payment handling", () => {
  it("marks the reserved class pass paid and records payment side effects", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { supabase, updates, inserts } = makeSupabase([
      { id: "pass_1", studio_id: "studio_1", student_id: "student_1" },
    ]);

    await processStripeEvent(classPassPaymentEvent(), supabase);

    expect(updates).toEqual([
      {
        table: "class_passes",
        values: { status: "paid" },
        filters: [
          { column: "id", value: "pass_1" },
          { column: "stripe_payment_intent_id", value: "pi_pass_1" },
          { column: "status", value: "reserved" },
        ],
        columns: "id, studio_id, student_id",
      },
    ]);
    expect(inserts).toEqual([
      {
        table: "payments",
        values: {
          studio_id: "studio_1",
          payer_id: "student_1",
          invoice_id: null,
          amount_cents: 2500,
          currency: "nzd",
          stripe_payment_intent_id: "pi_pass_1",
          status: "succeeded",
          description: "Adult ballet class pass",
        },
      },
      {
        table: "notifications",
        values: {
          studio_id: "studio_1",
          user_id: "student_1",
          type: "class_pass_paid",
          title: "Your class pass is ready",
          body: "Show the QR code at the studio to redeem it for any single adult ballet class.",
          link: "/portal/student",
        },
      },
    ]);

    log.mockRestore();
  });

  it("does not record payment side effects when no reserved pass matches the PaymentIntent", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { supabase, updates, inserts } = makeSupabase([]);

    await processStripeEvent(classPassPaymentEvent(), supabase);

    expect(updates).toHaveLength(1);
    expect(inserts).toEqual([]);
    expect(warn).toHaveBeenCalledWith(
      "[stripe-webhook] payment_intent.succeeded — class_pass pass_1 PI mismatch or not found",
    );

    warn.mockRestore();
  });
});
