import { describe, expect, it } from "vitest";
import type { ClassPassRefundPatch } from "@/lib/passes/refunds";
import {
  refundPaidClassPassesForInvoice,
  refundPaidClassPassesForPaymentIntent,
} from "@/lib/passes/refunds";

type UpdateCall = {
  table: string;
  patch: ClassPassRefundPatch;
  filters: Array<{ column: string; value: string }>;
};

function createSupabaseRecorder() {
  const calls: UpdateCall[] = [];

  return {
    calls,
    supabase: {
      from(table: string) {
        return {
          update(patch: ClassPassRefundPatch) {
            const call: UpdateCall = { table, patch, filters: [] };
            calls.push(call);
            const result = Promise.resolve({ error: null });

            const chain = {
              eq(column: string, value: string) {
                call.filters.push({ column, value });
                return chain;
              },
              then: result.then.bind(result),
            };

            return chain;
          },
        };
      },
    },
  };
}

const patch: ClassPassRefundPatch = {
  status: "refunded",
  refunded_at: "2026-07-20T11:00:00.000Z",
  refund_amount_cents: 2500,
  stripe_refund_id: "re_123",
};

describe("class-pass refund helpers", () => {
  it("invalidates paid class passes linked to a refunded invoice", async () => {
    const { calls, supabase } = createSupabaseRecorder();

    await refundPaidClassPassesForInvoice(supabase, "inv_123", "studio_123", patch);

    expect(calls).toEqual([
      {
        table: "class_passes",
        patch,
        filters: [
          { column: "invoice_id", value: "inv_123" },
          { column: "studio_id", value: "studio_123" },
          { column: "status", value: "paid" },
        ],
      },
    ]);
  });

  it("invalidates only paid class passes for a refunded payment intent", async () => {
    const { calls, supabase } = createSupabaseRecorder();

    await refundPaidClassPassesForPaymentIntent(supabase, "pi_123", patch);

    expect(calls[0]).toMatchObject({
      table: "class_passes",
      patch,
      filters: [
        { column: "stripe_payment_intent_id", value: "pi_123" },
        { column: "status", value: "paid" },
      ],
    });
  });
});
