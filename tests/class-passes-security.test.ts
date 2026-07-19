import { readFileSync } from "node:fs";
import { join } from "node:path";
import type Stripe from "stripe";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/xero/webhook-sync", () => ({
  xeroSyncAfterPayment: vi.fn(),
  xeroSyncAfterRefund: vi.fn(),
  xeroSyncTicketByPaymentIntent: vi.fn(),
}));

vi.mock("@/lib/stripe/connect", () => ({
  syncStripeAccountStatus: vi.fn(),
}));

import { processStripeEvent } from "@/lib/webhooks/process-stripe-event";

const repoRoot = process.cwd();
type FakeResult = { data: unknown[] | Record<string, unknown> | null; error: null };

function readRepoFile(path: string) {
  return readFileSync(join(repoRoot, path), "utf8");
}

function normaliseSql(sql: string) {
  return sql.toLowerCase().replace(/\s+/g, " ");
}

describe("class pass RLS hardening migration", () => {
  it("forces student-created passes to start as unpaid reserved checkout rows", () => {
    const migration = normaliseSql(readRepoFile("supabase/migrations/0092_class_pass_security_fixes.sql"));

    expect(migration).toContain('drop policy if exists "class_passes_student_insert_own"');
    expect(migration).toContain('create policy "class_passes_student_insert_own"');
    expect(migration).toContain("status = 'reserved'");
    expect(migration).toContain("stripe_payment_intent_id is null");
    expect(migration).toContain("qr_code is null");
    expect(migration).toContain("redeemed_at is null");
    expect(migration).toContain("refunded_at is null");
    expect(migration).toContain("price_cents = 2500");
    expect(migration).toContain("currency = 'nzd'");
  });

  it("allows only reserved self-managed students to attach checkout details", () => {
    const migration = normaliseSql(readRepoFile("supabase/migrations/0092_class_pass_security_fixes.sql"));

    expect(migration).toContain('create policy "class_passes_student_update_reserved_checkout"');
    expect(migration).toContain("for update");
    expect(migration).toContain("student_id = auth.uid()");
    expect(migration).toContain("public.is_self_managed_student()");
    expect(migration).toContain("status = 'reserved'");
    expect(migration).toContain("stripe_payment_intent_id is not null");
    expect(migration).toContain("redeemed_at is null");
    expect(migration).toContain("refunded_at is null");
  });
});

describe("class pass checkout UI", () => {
  it("renders the Stripe checkout before showing the purchased QR code", () => {
    const component = readRepoFile("components/portal/student/BuyClassPass.tsx");

    const checkoutBranch = component.indexOf(") : clientSecret ? (");
    const qrBranch = component.indexOf(") : purchasedQr ? (");

    expect(checkoutBranch).toBeGreaterThan(-1);
    expect(qrBranch).toBeGreaterThan(-1);
    expect(checkoutBranch).toBeLessThan(qrBranch);
    expect(component).toContain("setPurchasedQr(pendingQr)");
  });
});

class FakeQuery {
  filters: Array<{ op: "eq" | "neq"; column: string; value: unknown }> = [];
  insertPayload: unknown;
  private selectColumns: string | null = null;
  private limitCount: number | null = null;
  private updatePatch: unknown;
  private operation: "select" | "update" | "insert" | null = null;
  private single = false;

  constructor(
    readonly table: string,
    private readonly calls: FakeQuery[],
    private readonly options: { redeemedClassPass?: Record<string, unknown> } = {},
  ) {
    this.calls.push(this);
  }

  select(columns: string) {
    this.operation ??= "select";
    this.selectColumns = columns;
    return this;
  }

  update(patch: unknown) {
    this.operation = "update";
    this.updatePatch = patch;
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

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.single = true;
    return this;
  }

  insert(payload: unknown) {
    this.operation = "insert";
    this.insertPayload = payload;
    return Promise.resolve({ data: null, error: null });
  }

  then<TResult1 = FakeResult, TResult2 = never>(
    onfulfilled?: ((value: FakeResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    void this.selectColumns;
    void this.limitCount;
    void this.updatePatch;
    let data: unknown[] | Record<string, unknown> | null = [];
    if (
      this.table === "class_passes" &&
      this.operation === "select" &&
      this.filters.some((filter) => filter.op === "eq" && filter.column === "status" && filter.value === "redeemed")
    ) {
      data = this.single ? (this.options.redeemedClassPass ?? null) : this.options.redeemedClassPass ? [this.options.redeemedClassPass] : [];
    }
    return Promise.resolve({ data, error: null } satisfies FakeResult).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(options: { redeemedClassPass?: Record<string, unknown> } = {}) {
  const calls: FakeQuery[] = [];
  return {
    calls,
    client: {
      from(table: string) {
        return new FakeQuery(table, calls, options);
      },
    },
  };
}

describe("class pass Stripe refund reconciliation", () => {
  it("does not flip already-redeemed class passes to refunded", async () => {
    const supabase = fakeSupabase();
    const event = {
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_class_pass_refund",
          payment_intent: "pi_class_pass",
          amount_refunded: 2500,
          currency: "nzd",
          refunds: { data: [{ id: "re_class_pass" }] },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeEvent(event, supabase.client as never);

    const classPassUpdate = supabase.calls.find((call) => call["table"] === "class_passes");
    expect(classPassUpdate?.filters).toContainEqual({ op: "eq", column: "status", value: "paid" });
    expect(classPassUpdate?.filters).not.toContainEqual({
      op: "neq",
      column: "status",
      value: "refunded",
    });
  });

  it("records a Stripe refund ledger row for redeemed passes without mutating redemption status", async () => {
    const supabase = fakeSupabase({
      redeemedClassPass: {
        id: "pass_redeemed",
        student_id: "student_1",
        studio_id: "studio_1",
      },
    });
    const event = {
      type: "charge.refunded",
      data: {
        object: {
          id: "ch_redeemed_class_pass_refund",
          payment_intent: "pi_redeemed_class_pass",
          amount_refunded: 2500,
          currency: "nzd",
          refunds: { data: [{ id: "re_redeemed_class_pass" }] },
        },
      },
    } as unknown as Stripe.Event;

    await processStripeEvent(event, supabase.client as never);

    const redeemedLookup = supabase.calls.find(
      (call) =>
        call.table === "class_passes" &&
        call.filters.some((filter) => filter.op === "eq" && filter.column === "status" && filter.value === "redeemed"),
    );
    const paidStatusUpdate = supabase.calls.find(
      (call) =>
        call.table === "class_passes" &&
        call.filters.some((filter) => filter.op === "eq" && filter.column === "status" && filter.value === "paid"),
    );
    const ledgerInsert = supabase.calls.find(
      (call) => call.table === "payments" && call.insertPayload && !call.filters.length,
    );

    expect(redeemedLookup).toBeDefined();
    expect(paidStatusUpdate).toBeDefined();
    expect(ledgerInsert?.insertPayload).toMatchObject({
      studio_id: "studio_1",
      payer_id: "student_1",
      amount_cents: -2500,
      currency: "nzd",
      stripe_payment_intent_id: "pi_redeemed_class_pass",
      stripe_refund_id: "re_redeemed_class_pass",
      status: "refunded",
    });
  });
});
