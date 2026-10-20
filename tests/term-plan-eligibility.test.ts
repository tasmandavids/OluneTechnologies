import { describe, expect, it } from "vitest";
import { listPlanEligibleInvoices } from "@/lib/term-payment-plan-service";

// Minimal chainable stand-in for the two queries the service issues.
function fakeSupabase(invoices: unknown[], activePlanIds: string[]) {
  return {
    from(table: string) {
      const result =
        table === "invoices"
          ? { data: invoices, error: null }
          : { data: activePlanIds.map((id) => ({ id, status: "active" })), error: null };
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: () => chain,
        in: () => chain,
        then: (resolve: (v: unknown) => unknown) => resolve(result),
      };
      return chain;
    },
  } as never;
}

describe("listPlanEligibleInvoices (audit B-06)", () => {
  it("does not offer invoices already collected by an active plan", async () => {
    const rows = [
      { id: "a", amount_cents: 10000, studio_id: "s", term_payment_plan_id: "plan1", status: "sent" },
      { id: "b", amount_cents: 20000, studio_id: "s", term_payment_plan_id: null, status: "sent" },
    ];
    const out = await listPlanEligibleInvoices(fakeSupabase(rows, ["plan1"]), "payer");
    expect(out.map((i) => i.id)).toEqual(["b"]);
  });

  it("offers invoices whose plan is no longer active", async () => {
    const rows = [
      { id: "a", amount_cents: 10000, studio_id: "s", term_payment_plan_id: "old", status: "overdue" },
    ];
    const out = await listPlanEligibleInvoices(fakeSupabase(rows, []), "payer");
    expect(out.map((i) => i.id)).toEqual(["a"]);
  });
});
