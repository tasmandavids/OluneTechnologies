import { describe, expect, it } from "vitest";
import { EVENT_TICKET_LEDGER_SELECT } from "@/lib/ledger/source-projections";

describe("ledger source projections", () => {
  it("selects the canonical event name for automatic ticket posting", () => {
    expect(EVENT_TICKET_LEDGER_SELECT).toMatch(
      /events!inner\s*\(\s*studio_id,\s*name\s*\)/,
    );
    expect(EVENT_TICKET_LEDGER_SELECT).not.toContain("title");
  });
});
