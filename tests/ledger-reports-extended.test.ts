import { describe, expect, it } from "vitest";
import { cashFlow, profitTrend } from "@/lib/ledger/reports";
import { monthsBetween } from "@/lib/ledger/periods";
import { billJournal, invoiceJournal, manualJournal, settlementJournal } from "@/lib/ledger/posting";
import type { AccountMovement, DraftJournal } from "@/lib/ledger/types";
import { packChart } from "./helpers/ledger-chart";

function movements(journals: DraftJournal[]): AccountMovement[] {
  const m = new Map<string, AccountMovement>();
  for (const j of journals) {
    for (const l of j.lines) {
      const cur = m.get(l.accountId) ?? { accountId: l.accountId, debitCents: 0, creditCents: 0 };
      cur.debitCents += l.debitCents;
      cur.creditCents += l.creditCents;
      m.set(l.accountId, cur);
    }
  }
  return [...m.values()];
}

const line = (accountId: string, debitCents: number, creditCents: number) => ({ accountId, debitCents, creditCents });

describe("cash flow statement", () => {
  const { chart, accounts } = packChart("NZ");
  const bank = chart.account("bank");
  const owner = chart.account("owner_funds");
  const equipment = chart.byCode.get("710")!;
  const equipmentDep = chart.byCode.get("711")!;
  const depreciation = chart.byCode.get("497")!;
  const rent = chart.byCode.get("469")!;

  const opening: DraftJournal[] = [manualJournal({ date: "2026-03-01", narration: "Capital", lines: [line(bank.id, 500000, 0), line(owner.id, 0, 500000)] })];
  const period: DraftJournal[] = [
    // $1,150 term fees invoiced and paid; a $460 rent bill still unpaid.
    invoiceJournal(chart, { id: "i1", reference: "INV-1", date: "2026-04-01", contactName: null, taxInclusive: true, amountCents: 115000, gstCents: 15000, lines: [{ description: "Term", lineTotalCents: 115000, accountCode: null, taxTreatment: "standard", taxRateBp: 1500 }] })!,
    settlementJournal(chart, { sourceType: "invoice_manual_payment", id: "i1", date: "2026-04-05", amountCents: 115000, bankAccountId: bank.id, settlesJournalId: "x", reference: null, contactName: null, narration: "Paid" })!,
    billJournal(chart, { id: "b1", reference: "B1", date: "2026-04-15", contactName: "Landlord", amountsIncludeTax: true, lines: [{ description: "Rent", accountId: rent.id, taxRateId: "rate-GST15-P", lineTotalCents: 46000 }] }).journal,
    // Mirrors bought for $2,000 cash, $100 depreciated, owner draws $300.
    manualJournal({ date: "2026-04-20", narration: "Mirrors", lines: [line(equipment.id, 200000, 0), line(bank.id, 0, 200000)] }),
    manualJournal({ date: "2026-04-30", narration: "Depreciation", lines: [line(depreciation.id, 10000, 0), line(equipmentDep.id, 0, 10000)] }),
    manualJournal({ date: "2026-04-30", narration: "Drawings", lines: [line(owner.id, 30000, 0), line(bank.id, 0, 30000)] }),
  ];

  const cf = cashFlow(accounts, movements(period), movements(opening));

  it("reconciles to the change in bank balances", () => {
    expect(cf.unexplainedCents).toBe(0);
    expect(cf.openingCashCents).toBe(500000);
    expect(cf.closingCashCents).toBe(500000 + 115000 - 200000 - 30000);
    expect(cf.netChangeCents).toBe(115000 - 200000 - 30000);
  });

  it("adds depreciation back and shows equipment at cost", () => {
    // Profit: $1,000 fees − $400 rent − $100 depreciation.
    expect(cf.netProfitCents).toBe(50000);
    expect(cf.operating.find((l) => l.key === "depreciation")?.amountCents).toBe(10000);
    expect(cf.investingTotalCents).toBe(-200000);
  });

  it("puts owner drawings under financing", () => {
    expect(cf.financingTotalCents).toBe(-30000);
  });

  it("operating cash is profit adjusted for what's still owed", () => {
    // $500 profit + $100 depreciation + $460 rent still owed + $90 GST still owed.
    expect(cf.operatingTotalCents).toBe(cf.netChangeCents - cf.investingTotalCents - cf.financingTotalCents);
    expect(cf.operatingTotalCents).toBe(115000);
  });
});

describe("profit by month", () => {
  const { chart, accounts } = packChart("NZ");
  const rent = chart.byCode.get("469")!;
  const bank = chart.account("bank");
  const april = [manualJournal({ date: "2026-04-10", narration: "Rent", lines: [line(rent.id, 40000, 0), line(bank.id, 0, 40000)] })];
  const may = [manualJournal({ date: "2026-05-10", narration: "Rent", lines: [line(rent.id, 45000, 0), line(bank.id, 0, 45000)] })];

  it("lays each month side by side with a total", () => {
    const trend = profitTrend(accounts, [movements(april), movements(may)]);
    expect(trend.expenses.rows).toHaveLength(1);
    expect(trend.expenses.rows[0].amounts).toEqual([40000, 45000]);
    expect(trend.expenses.rows[0].totalCents).toBe(85000);
    expect(trend.netProfit).toEqual([-40000, -45000]);
    expect(trend.netProfitTotalCents).toBe(-85000);
  });
});

describe("monthsBetween", () => {
  it("clips the first and last month to the range", () => {
    expect(monthsBetween("2026-04-15", "2026-06-10")).toEqual([
      { start: "2026-04-15", end: "2026-04-30" },
      { start: "2026-05-01", end: "2026-05-31" },
      { start: "2026-06-01", end: "2026-06-10" },
    ]);
  });

  it("keeps the newest months when capped", () => {
    const months = monthsBetween("2024-01-01", "2026-06-30", 12);
    expect(months).toHaveLength(12);
    expect(months[11].start).toBe("2026-06-01");
  });
});
