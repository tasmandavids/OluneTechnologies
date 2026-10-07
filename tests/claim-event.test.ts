import { describe, expect, it } from "vitest";
import { CLAIM_TTL_MS, claimStripeEvent } from "@/lib/webhooks/claim-event";

type Result = { data?: unknown; error?: { code?: string; message: string } | null };

function fakeSupabase(insert: Result, takeover: Result) {
  const calls: Array<{ op: string; filters: string[] }> = [];
  return {
    calls,
    from() {
      const filters: string[] = [];
      const chain: Record<string, unknown> = {
        insert: () => Promise.resolve(insert),
        update: () => chain,
        eq: (c: string) => (filters.push(`eq:${c}`), chain),
        is: (c: string) => (filters.push(`is:${c}`), chain),
        lt: (c: string) => (filters.push(`lt:${c}`), chain),
        select: () => {
          calls.push({ op: "takeover", filters });
          return Promise.resolve(takeover);
        },
      };
      return chain;
    },
  };
}

const claim = { id: "evt_1", type: "payment_intent.succeeded", account: null };

describe("claimStripeEvent (audit B-16)", () => {
  it("claims a new event", async () => {
    const sb = fakeSupabase({ error: null }, {});
    expect((await claimStripeEvent(sb as never, claim)).status).toBe("claimed");
  });

  it("takes over a stale, unprocessed claim", async () => {
    const sb = fakeSupabase({ error: { code: "23505", message: "dup" } }, { data: [{ id: "evt_1" }] });
    expect((await claimStripeEvent(sb as never, claim)).status).toBe("claimed");
    expect(sb.calls[0].filters).toEqual(["eq:id", "is:processed_at", "lt:received_at"]);
  });

  it("treats a processed or fresh claim as a duplicate", async () => {
    const sb = fakeSupabase({ error: { code: "23505", message: "dup" } }, { data: [] });
    expect((await claimStripeEvent(sb as never, claim)).status).toBe("duplicate");
  });

  it("reports ledger failures other than a duplicate", async () => {
    const sb = fakeSupabase({ error: { code: "XX000", message: "down" } }, {});
    expect(await claimStripeEvent(sb as never, claim)).toMatchObject({ status: "error", message: "down" });
  });

  it("uses a five minute window", () => {
    expect(CLAIM_TTL_MS).toBe(300_000);
  });
});
