import { describe, expect, it } from "vitest";
import { ageItems, balanceSheet, bankSummary, profitAndLoss, trialBalance } from "@/lib/ledger/reports";
import type { AccountMovement, DraftJournal } from "@/lib/ledger/types";
import { invoiceJournal, manualJournal, settlementJournal, billJournal } from "@/lib/ledger/posting";
import { packChart } from "./helpers/ledger-chart";

/** Aggregate journals into per-account movements, like ledger_account_balances. */
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

describe("statements", () => {
  const { chart, accounts } = packChart("NZ");
  const bank = chart.account("bank");
  const owner = chart.account("owner_funds");
  const rent = chart.byCode.get("469")!;

  // Last year: owner puts in $1,000, invoices $1,150 (incl GST), gets paid.
  const lastYear: DraftJournal[] = [
    manualJournal({ date: "2025-04-02", narration: "Capital", lines: [{ accountId: bank.id, debitCents: 100000, creditCents: 0 }, { accountId: owner.id, debitCents: 0, creditCents: 100000 }] }),
    invoiceJournal(chart, { id: "i1", reference: "INV-1", date: "2025-05-01", contactName: null, taxInclusive: true, amountCents: 115000, gstCents: 15000, lines: [{ description: "Term", lineTotalCents: 115000, accountCode: null, taxTreatment: "standard", taxRateBp: 1500 }] })!,
    settlementJournal(chart, { sourceType: "invoice_manual_payment", id: "i1", date: "2025-05-10", amountCents: 115000, bankAccountId: bank.id, settlesJournalId: "x", reference: null, contactName: null, narration: "Paid" })!,
  ];
  // This year: rent bill $460 incl GST, unpaid.
  const thisYear: DraftJournal[] = [
    billJournal(chart, { id: "b1", reference: "B1", date: "2026-04-15", contactName: "Landlord", amountsIncludeTax: true, lines: [{ description: "Rent", accountId: rent.id, taxRateId: "rate-GST15-P", lineTotalCents: 46000 }] }).journal,
  ];

  it("P&L for the year shows only this year's activity", () => {
    const pl = profitAndLoss(accounts, movements(thisYear), movements(lastYear));
    expect(pl.income.totalCents).toBe(0);
    expect(pl.expenses.totalCents).toBe(40000);
    expect(pl.netProfitCents).toBe(-40000);
    expect(pl.compare?.netProfitCents).toBe(100000);
  });

  it("balance sheet balances and rolls last year's profit into equity", () => {
    const bs = balanceSheet(accounts, movements([...lastYear, ...thisYear]), movements(lastYear));
    expect(bs.outOfBalanceCents).toBe(0);
    expect(bs.priorYearsEarningsCents).toBe(100000);
    expect(bs.currentYearEarningsCents).toBe(-40000);
    expect(bs.bank.totalCents).toBe(215000);
    // GST: $150 collected − $60 paid = $90 owed.
    const gst = bs.currentLiabilities.rows.find((r) => r.accountId === chart.account("tax_collected").id)!;
    expect(gst.amountCents).toBe(9000);
  });

  it("trial balance debits equal credits, P&L year-to-date only", () => {
    const tb = trialBalance(accounts, movements([...lastYear, ...thisYear]), movements(lastYear));
    expect(tb.totalDebitCents).toBe(tb.totalCreditCents);
    const sales = tb.rows.find((r) => r.accountId === chart.account("sales").id);
    expect(sales).toBeUndefined(); // last year's sales folded into retained earnings
    const retained = tb.rows.find((r) => r.accountId === chart.account("retained_earnings").id)!;
    expect(retained.creditCents).toBe(100000);
  });

  it("bank summary", () => {
    const rows = bankSummary(accounts, movements(lastYear), movements(thisYear));
    expect(rows.find((r) => r.accountId === bank.id)).toMatchObject({ openingCents: 215000, receivedCents: 0, spentCents: 0, closingCents: 215000 });
  });
});

describe("ageItems", () => {
  it("buckets by days past due", () => {
    const b = ageItems(
      [
        { dueDate: "2026-10-05", outstandingCents: 100 },
        { dueDate: "2026-09-20", outstandingCents: 200 },
        { dueDate: "2026-08-15", outstandingCents: 300 },
        { dueDate: "2026-07-20", outstandingCents: 400 },
        { dueDate: "2026-01-01", outstandingCents: 500 },
        { dueDate: null, outstandingCents: 600 },
      ],
      "2026-10-01",
    );
    expect(b).toEqual({ current: 700, d1to30: 200, d31to60: 300, d61to90: 400, d90plus: 500, total: 2100 });
  });
});
