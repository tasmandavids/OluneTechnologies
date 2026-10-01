import { describe, expect, it } from "vitest";
import { detectDateOrder, guessMapping, parseCsv, parseStatement, parseStatementDate } from "@/lib/ledger/bank-import";
import { parseMoneyInput } from "@/lib/ledger/money";
import { codingHint, suggestMatches } from "@/lib/ledger/reconcile";

describe("parseCsv", () => {
  it("handles quotes, embedded commas, CRLF and a BOM", () => {
    const rows = parseCsv('﻿Date,Description,Amount\r\n01/05/2026,"Rent, May",-1200.00\r\n02/05/2026,"Stripe ""payout""",450.10\r\n');
    expect(rows).toEqual([
      ["Date", "Description", "Amount"],
      ["01/05/2026", "Rent, May", "-1200.00"],
      ["02/05/2026", 'Stripe "payout"', "450.10"],
    ]);
  });
  it("detects semicolon-delimited European exports", () => {
    expect(parseCsv("Datum;Verwendungszweck;Betrag\n01.05.2026;Miete;-1.200,00\n")[1]).toEqual(["01.05.2026", "Miete", "-1.200,00"]);
  });
});

describe("guessMapping", () => {
  it("finds a single amount column", () => {
    expect(guessMapping(["Date", "Description", "Reference", "Amount"])).toEqual({ date: 0, description: 1, reference: 2, amount: 3, debit: null, credit: null });
  });
  it("finds split debit/credit columns", () => {
    expect(guessMapping(["Transaction Date", "Details", "Money Out", "Money In", "Balance"])).toMatchObject({ date: 0, description: 1, amount: null, debit: 2, credit: 3 });
  });
  it("German headers", () => {
    expect(guessMapping(["Buchungstag", "Verwendungszweck", "Betrag"])).toMatchObject({ date: 0, description: 1, amount: 2 });
  });
  it("returns null without a date column", () => {
    expect(guessMapping(["Foo", "Bar"])).toBeNull();
  });
});

describe("dates", () => {
  it("detects order from the data", () => {
    expect(detectDateOrder(["01/05/2026", "25/05/2026"], "mdy")).toBe("dmy");
    expect(detectDateOrder(["05/01/2026", "05/25/2026"], "dmy")).toBe("mdy");
    expect(detectDateOrder(["2026-05-01"], "dmy")).toBe("ymd");
    expect(detectDateOrder(["01/02/2026"], "mdy")).toBe("mdy");
  });
  it("parses common formats and rejects impossible dates", () => {
    expect(parseStatementDate("31/12/2026", "dmy")).toBe("2026-12-31");
    expect(parseStatementDate("12/31/26", "mdy")).toBe("2026-12-31");
    expect(parseStatementDate("01.05.2026", "dmy")).toBe("2026-05-01");
    expect(parseStatementDate("3 Mar 2026", "dmy")).toBe("2026-03-03");
    expect(parseStatementDate("12 September 2026", "dmy")).toBe("2026-09-12");
    expect(parseStatementDate("2026/05/01", "dmy")).toBe("2026-05-01");
    expect(parseStatementDate("31/02/2026", "dmy")).toBeNull();
    expect(parseStatementDate("nonsense", "dmy")).toBeNull();
  });
});

describe("parseMoneyInput", () => {
  it.each([
    ["1,234.56", 123456],
    ["1.234,56", 123456],
    ["-1,200.00", -120000],
    ["$12", 1200],
    ["12,5", 1250],
    ["1,234", 123400],
    ["1,234,567", 123456700],
    ["0.125", 13],
    ["", null],
    ["abc", null],
  ])("%s → %s", (raw, cents) => expect(parseMoneyInput(raw)).toBe(cents));
});

describe("parseStatement", () => {
  it("signs debit/credit columns and dedupes identical rows by occurrence", () => {
    const rows = [
      ["01/05/2026", "Coffee", "4.50", ""],
      ["01/05/2026", "Coffee", "4.50", ""],
      ["02/05/2026", "Deposit", "", "100.00"],
      ["bad", "x", "1", ""],
      ["03/05/2026", "Zero", "", ""],
    ];
    const { lines, errors } = parseStatement(rows, { date: 0, description: 1, reference: null, amount: null, debit: 2, credit: 3 }, "dmy");
    expect(lines.map((l) => l.amountCents)).toEqual([-450, -450, 10000]);
    expect(new Set(lines.map((l) => l.externalHash)).size).toBe(3);
    expect(errors).toEqual([{ row: 5, reason: "date" }, { row: 6, reason: "amount" }]);
  });

  it("hashes are stable across imports", () => {
    const m = { date: 0, description: 1, reference: null, amount: 2, debit: null, credit: null };
    const a = parseStatement([["01/05/2026", "Rent", "-100"]], m, "dmy").lines[0].externalHash;
    const b = parseStatement([["01/05/2026", "Rent", "-100"]], m, "dmy").lines[0].externalHash;
    expect(a).toBe(b);
  });
});

describe("reconciliation suggestions", () => {
  const candidates = [
    { lineId: "l1", journalId: "j1", journalNumber: 1, date: "2026-05-01", amountCents: -12000, narration: "Bill B-1 — Landlord", reference: "B-1" },
    { lineId: "l2", journalId: "j2", journalNumber: 2, date: "2026-05-20", amountCents: -12000, narration: "Bill B-2 — Landlord", reference: "B-2" },
    { lineId: "l3", journalId: "j3", journalNumber: 3, date: "2026-05-02", amountCents: -9999, narration: "Other", reference: null },
  ];
  it("requires the exact amount and prefers the closest date and shared words", () => {
    const s = suggestMatches({ date: "2026-05-03", amountCents: -12000, description: "LANDLORD LTD B-1", reference: null }, candidates);
    expect(s.map((m) => m.lineId)).toEqual(["l1"]); // l2 is 17 days away, l3 the wrong amount
  });
  it("hints Stripe payouts and bank fees", () => {
    expect(codingHint({ amountCents: 50000, description: "STRIPE PAYOUT" }).kind).toBe("stripe_payout");
    expect(codingHint({ amountCents: -500, description: "Monthly account fee" }).kind).toBe("bank_fee");
    expect(codingHint({ amountCents: -500, description: "Rent" }).kind).toBeNull();
  });
});
