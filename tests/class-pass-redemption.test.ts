import { describe, expect, it } from "vitest";
import type { ClassPassRedemptionRollback } from "@/lib/passes/redemption";
import { rollbackRedeemedClassPassClaim } from "@/lib/passes/redemption";

type UpdateCall = {
  table: string;
  patch: ClassPassRedemptionRollback;
  filters: Array<{ column: string; value: string }>;
};

function createSupabaseRecorder() {
  const calls: UpdateCall[] = [];

  return {
    calls,
    supabase: {
      from(table: string) {
        return {
          update(patch: ClassPassRedemptionRollback) {
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

describe("class-pass redemption rollback", () => {
  it("restores only the pass claim made by the failed redemption attempt", async () => {
    const { calls, supabase } = createSupabaseRecorder();

    await rollbackRedeemedClassPassClaim(supabase, {
      passId: "pass_123",
      studioId: "studio_123",
      classId: "class_123",
      date: "2026-07-20",
      redeemedBy: "admin_123",
    });

    expect(calls).toEqual([
      {
        table: "class_passes",
        patch: {
          status: "paid",
          redeemed_at: null,
          redeemed_class_id: null,
          redeemed_date: null,
          redeemed_by: null,
        },
        filters: [
          { column: "id", value: "pass_123" },
          { column: "studio_id", value: "studio_123" },
          { column: "status", value: "redeemed" },
          { column: "redeemed_class_id", value: "class_123" },
          { column: "redeemed_date", value: "2026-07-20" },
          { column: "redeemed_by", value: "admin_123" },
        ],
      },
    ]);
  });
});
