import { describe, expect, it } from "vitest";
import {
  applyTax,
  assertPostable,
  bankCodedJournal,
  billJournal,
  cashSaleJournal,
  fingerprint,
  invoiceJournal,
  journalImbalance,
  refundJournal,
  settlementJournal,
  type PostedLine,
} from "@/lib/ledger/posting";
import { splitTax } from "@/lib/billing/tax";
import type { DraftJournal, DraftLine } from "@/lib/ledger/types";
import { packChart } from "./helpers/ledger-chart";

const sum = (lines: DraftLine[], f: (l: DraftLine) => number) => lines.reduce((s, l) => s + f(l), 0);
const byAccount = (j: DraftJournal, accountId: string) => j.lines.filter((l) => l.accountId === accountId);

describe("applyTax", () => {
  const { chart } = packChart("NZ");
  const gst = chart.rateByCode("GST15")!;

  it("matches lib/billing/tax.ts rounding for inclusive amounts", () => {
    for (const gross of [1, 99, 100, 115, 2875, 12345, 99999, 4567]) {
      expect(applyTax(gross, gst, true).taxCents).toBe(splitTax(gross, { inclusive: true, taxRateBp: 1500 }).taxCents);
    }
  });

  it("exclusive adds tax on top", () => {
    expect(applyTax(10000, gst, false)).toMatchObject({ netCents: 10000, taxCents: 1500, grossCents: 11500 });
  });

  it("negative amounts mirror positive ones", () => {
    const pos = applyTax(2875, gst, true);
    const neg = applyTax(-2875, gst, true);
    expect(neg.netCents).toBe(-pos.netCents);
    expect(neg.taxCents).toBe(-pos.taxCents);
  });

  it("splits compound rates by component and the parts always sum", () => {
    const { chart: bc } = packChart("CA", "BC");
    const rate = bc.rateByCode("GST+PST")!;
    for (const amt of [10000, 3333, 1, 98765]) {
      const r = applyTax(amt, rate, false);
      expect(r.components.reduce((s, c) => s + c.cents, 0)).toBe(r.taxCents);
    }
    const r = applyTax(10000, rate, false);
    expect(r.components.map((c) => [c.component.name, c.cents])).toEqual([["GST", 500], ["PST", 700]]);
  });

  it("handles fractional basis points (Québec QST 9.975%)", () => {
    const { chart: qc } = packChart("CA", "QC");
    const r = applyTax(10000, qc.rateByCode("GST+QST")!, false);
    expect(r.taxCents).toBe(1498); // 14.975% of $100.00, rounded
    expect(r.components.map((c) => c.cents)).toEqual([500, 998]);
  });
});

describe("invoiceJournal", () => {
  const { chart } = packChart("NZ");
  const ar = chart.account("ar").id;
  const gstAcct = chart.account("tax_collected").id;
  const sales = chart.account("sales").id;

  it("posts Dr AR / Cr revenue / Cr GST and balances", () => {
    const j = invoiceJournal(chart, {
      id: "inv-1",
      reference: "INV-0001",
      date: "2026-05-01",
      contactName: "Alex Parent",
      taxInclusive: true,
      amountCents: 11500,
      gstCents: 1500,
      lines: [{ description: "Term 2 ballet", lineTotalCents: 11500, accountCode: "200", taxTreatment: "standard", taxRateBp: 1500 }],
    })!;
    assertPostable(j);
    expect(byAccount(j, ar)[0].debitCents).toBe(11500);
    expect(byAccount(j, sales)[0]).toMatchObject({ creditCents: 10000, taxCents: 1500, taxRateId: "rate-GST15" });
    expect(byAccount(j, gstAcct)[0]).toMatchObject({ creditCents: 1500, isTaxLine: true });
    expect(j.taxTiming).toBe("accrual");
    expect(j.grossCents).toBe(11500);
  });

  it("routes Olune's built-in class-pass code to the class passes account", () => {
    const j = invoiceJournal(chart, {
      id: "inv-2", reference: "INV-0002", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 2300, gstCents: 300,
      lines: [{ description: "10-class pass", lineTotalCents: 2300, accountCode: "200-01", taxTreatment: "standard", taxRateBp: 1500 }],
    })!;
    expect(j.lines.some((l) => l.accountId === chart.account("class_passes").id)).toBe(true);
  });

  it("zero-rated and exempt lines carry no tax but keep their rate for the return", () => {
    const j = invoiceJournal(chart, {
      id: "inv-3", reference: "INV-0003", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 5000, gstCents: 0,
      lines: [
        { description: "Export", lineTotalCents: 3000, accountCode: null, taxTreatment: "zero_rated", taxRateBp: 0 },
        { description: "Exempt", lineTotalCents: 2000, accountCode: null, taxTreatment: "exempt", taxRateBp: 0 },
      ],
    })!;
    assertPostable(j);
    expect(j.lines.filter((l) => l.isTaxLine)).toHaveLength(0);
    expect(j.lines.map((l) => l.taxRateId).filter(Boolean)).toEqual(["rate-ZERO", "rate-EXEMPT"]);
  });

  it("an unregistered studio posts no tax at all", () => {
    const { chart: unreg } = packChart("NZ", null, false);
    const j = invoiceJournal(unreg, {
      id: "inv-4", reference: "INV-0004", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 11500, gstCents: 0,
      lines: [{ description: "Class", lineTotalCents: 11500, accountCode: null, taxTreatment: "standard", taxRateBp: 1500 }],
    })!;
    expect(j.lines.filter((l) => l.isTaxLine)).toHaveLength(0);
    expect(j.lines.every((l) => !l.taxRateId)).toBe(true);
  });

  it("discount lines (negative) debit revenue and still balance", () => {
    const j = invoiceJournal(chart, {
      id: "inv-5", reference: "INV-0005", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 20700, gstCents: 2700,
      lines: [
        { description: "Two classes", lineTotalCents: 23000, accountCode: null, taxTreatment: "standard", taxRateBp: 1500 },
        { description: "Sibling discount", lineTotalCents: -2300, accountCode: null, taxTreatment: "standard", taxRateBp: 1500 },
      ],
    })!;
    assertPostable(j);
    expect(sum(j.lines, (l) => l.debitCents)).toBe(sum(j.lines, (l) => l.creditCents));
  });

  it("legacy invoices without lines use the stored GST", () => {
    const j = invoiceJournal(chart, { id: "inv-6", reference: "INV-0006", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 5750, gstCents: 750, lines: [] })!;
    assertPostable(j);
    expect(byAccount(j, gstAcct)[0].creditCents).toBe(750);
  });

  it("refuses line items that disagree with the invoice total by more than rounding", () => {
    expect(() =>
      invoiceJournal(chart, {
        id: "inv-7", reference: "INV-0007", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 50000, gstCents: 0,
        lines: [{ description: "x", lineTotalCents: 100, accountCode: null, taxTreatment: "standard", taxRateBp: 1500 }],
      }),
    ).toThrow(/don't add up/);
  });

  it("skips zero-value invoices", () => {
    expect(invoiceJournal(chart, { id: "z", reference: "Z", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 0, gstCents: 0, lines: [] })).toBeNull();
  });

  it("uses the matching rate when a product has a non-default percentage", () => {
    const { chart: de } = packChart("DE");
    const j = invoiceJournal(de, {
      id: "inv-8", reference: "R-8", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 10700, gstCents: 700,
      lines: [{ description: "Buch", lineTotalCents: 10700, accountCode: null, taxTreatment: "standard", taxRateBp: 700 }],
    })!;
    assertPostable(j);
    // 7% posts to its own SKR03 output account (1771), not the 19% one.
    const taxLine = j.lines.find((l) => l.isTaxLine)!;
    expect(de.byId.get(taxLine.accountId)!.code).toBe("1771");
  });
});

describe("cash sales, settlements and refunds", () => {
  const { chart } = packChart("AU");
  const clearing = chart.account("stripe_clearing").id;

  it("a shop order is Dr Stripe clearing, cash timing", () => {
    const j = cashSaleJournal(chart, {
      sourceType: "order", id: "o1", reference: "ORD-1", date: "2026-05-02", contactName: null, taxInclusive: true, amountCents: 5500,
      lines: [{ description: "Leotard", lineTotalCents: 5500, accountCode: null, taxTreatment: "standard", taxRateBp: 1000 }],
    })!;
    assertPostable(j);
    expect(byAccount(j, clearing)[0].debitCents).toBe(5500);
    expect(j.taxTiming).toBe("cash");
  });

  it("a payment settles its invoice journal", () => {
    const j = settlementJournal(chart, {
      sourceType: "invoice_payment", id: "p1", date: "2026-05-10", amountCents: 11000, bankAccountId: clearing, settlesJournalId: "jinv", reference: null, contactName: null, narration: "Card payment",
    })!;
    assertPostable(j);
    expect(j).toMatchObject({ taxTiming: "settlement", settlesJournalId: "jinv", settlesAmountCents: 11000 });
  });

  it("a payment for a pre-books invoice has no tax effect", () => {
    const j = settlementJournal(chart, {
      sourceType: "invoice_payment", id: "p2", date: "2026-05-10", amountCents: 100, bankAccountId: clearing, settlesJournalId: null, reference: null, contactName: null, narration: "x",
    })!;
    expect(j.taxTiming).toBe("none");
  });

  it("a partial refund reverses the refunded share of revenue and GST", () => {
    const sale = invoiceJournal(chart, {
      id: "inv", reference: "INV", date: "2026-05-01", contactName: null, taxInclusive: true, amountCents: 11000, gstCents: 1000,
      lines: [{ description: "Term", lineTotalCents: 11000, accountCode: null, taxTreatment: "standard", taxRateBp: 1000 }],
    })!;
    const posted: PostedLine[] = sale.lines.map((l) => ({ accountId: l.accountId, debitCents: l.debitCents, creditCents: l.creditCents, taxRateId: l.taxRateId ?? null, taxCents: l.taxCents ?? 0, isTaxLine: !!l.isTaxLine, description: null }));
    const r = refundJournal(chart, { id: "rf", date: "2026-05-20", refundCents: 5500, original: { grossCents: 11000, lines: posted }, reference: null, contactName: null, narration: "Refund", taxInclusive: true })!;
    assertPostable(r);
    const gst = r.lines.find((l) => l.isTaxLine)!;
    expect(gst.debitCents).toBe(500);
    expect(byAccount(r, clearing)[0].creditCents).toBe(5500);
    // AR is untouched: the money went back out of Stripe, not off the invoice.
    expect(r.lines.some((l) => l.accountId === chart.account("ar").id)).toBe(false);
  });

  it("a refund without its original reverses at the default rate", () => {
    const r = refundJournal(chart, { id: "rf2", date: "2026-05-20", refundCents: 1100, original: null, reference: null, contactName: null, narration: "Refund", taxInclusive: true })!;
    assertPostable(r);
    expect(r.lines.find((l) => l.isTaxLine)!.debitCents).toBe(100);
  });
});

describe("billJournal", () => {
  it("recoverable tax goes to input tax; non-recoverable PST is part of the cost", () => {
    const { chart } = packChart("CA", "BC");
    const rent = chart.byCode.get("469")!;
    const { journal, totals } = billJournal(chart, {
      id: "b1", reference: "B-1", date: "2026-05-01", contactName: "Landlord", amountsIncludeTax: false,
      lines: [{ description: "Supplies", accountId: rent.id, taxRateId: chart.rateByCode("GST+PST")!.id, lineTotalCents: 10000 }],
    });
    assertPostable(journal);
    expect(totals).toEqual({ subtotalCents: 10700, taxCents: 500, totalCents: 11200 });
    const expense = journal.lines.find((l) => l.accountId === rent.id)!;
    expect(expense).toMatchObject({ debitCents: 10700, taxCents: 500 });
    expect(journal.lines.find((l) => l.accountId === chart.account("ap").id)!.creditCents).toBe(11200);
  });

  it("separate input VAT account in EU charts", () => {
    const { chart } = packChart("FR");
    const rent = chart.byCode.get("613200")!;
    const { journal } = billJournal(chart, {
      id: "b2", reference: "F-2", date: "2026-05-01", contactName: "Bailleur", amountsIncludeTax: true,
      lines: [{ description: "Loyer", accountId: rent.id, taxRateId: chart.rateByCode("TVA20-D")!.id, lineTotalCents: 12000 }],
    });
    const taxLine = journal.lines.find((l) => l.isTaxLine)!;
    expect(chart.byId.get(taxLine.accountId)!.code).toBe("445660");
    expect(taxLine.debitCents).toBe(2000);
  });
});

describe("bankCodedJournal", () => {
  const { chart } = packChart("GB");
  const bank = chart.account("bank").id;

  it("money out coded to an expense with VAT", () => {
    const j = bankCodedJournal(
      chart,
      { id: "t1", date: "2026-05-03", amountCents: -12000, bankAccountId: bank, description: "Studio rent", reference: null, contactName: null },
      [{ accountId: chart.byCode.get("469")!.id, taxRateId: chart.rateByCode("VAT20-P")!.id, amountCents: 12000 }],
    );
    assertPostable(j);
    expect(j.taxTiming).toBe("cash");
    expect(byAccount(j, bank)[0].creditCents).toBe(12000);
  });

  it("a Stripe payout coded to clearing is a transfer with no tax", () => {
    const j = bankCodedJournal(
      chart,
      { id: "t2", date: "2026-05-04", amountCents: 50000, bankAccountId: bank, description: "STRIPE PAYOUT", reference: null, contactName: null },
      [{ accountId: chart.account("stripe_clearing").id, taxRateId: null, amountCents: 50000 }],
    );
    assertPostable(j);
    expect(j).toMatchObject({ sourceType: "transfer", taxTiming: "none" });
  });

  it("rejects coding that doesn't add up to the statement line", () => {
    expect(() =>
      bankCodedJournal(chart, { id: "t3", date: "2026-05-04", amountCents: -100, bankAccountId: bank, description: "", reference: null, contactName: null }, [
        { accountId: chart.byCode.get("429")!.id, taxRateId: null, amountCents: 99 },
      ]),
    ).toThrow();
  });
});

describe("guards", () => {
  it("journalImbalance and assertPostable", () => {
    expect(journalImbalance([{ debitCents: 100, creditCents: 0 }, { debitCents: 0, creditCents: 90 }])).toBe(10);
    expect(() => assertPostable({ date: "2026-01-01", narration: "x", sourceType: "manual", taxTiming: "none", lines: [{ accountId: "a", debitCents: 100, creditCents: 0 }, { accountId: "b", debitCents: 0, creditCents: 90 }] })).toThrow(/balance/);
    expect(() => assertPostable({ date: "2026-01-01", narration: "x", sourceType: "manual", taxTiming: "none", lines: [{ accountId: "a", debitCents: 100, creditCents: 100 }, { accountId: "b", debitCents: 0, creditCents: 0 }] })).toThrow();
  });

  it("fingerprint is order-independent for keys and sensitive to values", () => {
    expect(fingerprint({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(fingerprint({ b: { d: [1, 2], c: 2 }, a: 1 }));
    expect(fingerprint({ a: 1, b: { c: 2 } })).not.toBe(fingerprint({ a: 1, b: { c: 3 } }));
  });
});
