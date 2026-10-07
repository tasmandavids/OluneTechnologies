import { describe, expect, it } from "vitest";
import { cashSaleJournal } from "@/lib/ledger/posting";
import { packChart } from "./helpers/ledger-chart";

// Audit D-01: checkout adds no tax on top of a ticket or shop price, so the
// sale is posted as gross = cash received, whatever the studio's posture.
describe("ticket cash sale is posted tax-inclusive", () => {
  for (const [jurisdiction, region] of [["NZ", undefined], ["US", "CA"], ["CA", "ON"]] as const) {
    it(`${jurisdiction}${region ? `/${region}` : ""} balances and debits the cash taken`, () => {
      const { chart } = packChart(jurisdiction, region as never);
      const journal = cashSaleJournal(chart, {
        sourceType: "ticket",
        id: "00000000-0000-0000-0000-000000000001",
        reference: "TKT-1",
        date: "2026-09-01",
        contactName: "Parent",
        taxInclusive: true,
        amountCents: 5000,
        lines: [
          { description: "Gala — ticket", lineTotalCents: 5000, accountCode: null, taxTreatment: "standard", taxRateBp: null },
        ],
      });
      const debit = journal.lines.reduce((n, l) => n + (l.debitCents ?? 0), 0);
      const credit = journal.lines.reduce((n, l) => n + (l.creditCents ?? 0), 0);
      expect(debit).toBe(5000);
      expect(credit).toBe(5000);
    });
  }
});
