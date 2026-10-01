import { describe, expect, it } from "vitest";
import { addDays, firstOpenDate, fiscalYear, previousPeriod, taxPeriodContaining, taxPeriodsBetween } from "@/lib/ledger/periods";
import { getJurisdiction } from "@/lib/ledger/jurisdictions";

describe("fiscalYear", () => {
  it("NZ year runs 1 April – 31 March", () => {
    expect(fiscalYear("2026-03-31", 4)).toEqual({ start: "2025-04-01", end: "2026-03-31" });
    expect(fiscalYear("2026-04-01", 4)).toEqual({ start: "2026-04-01", end: "2027-03-31" });
  });
  it("UK-style 6 April start", () => {
    expect(fiscalYear("2026-04-05", 4, 6)).toEqual({ start: "2025-04-06", end: "2026-04-05" });
  });
  it("calendar year", () => {
    expect(fiscalYear("2026-10-01", 1)).toEqual({ start: "2026-01-01", end: "2026-12-31" });
  });
});

describe("taxPeriodContaining", () => {
  it("NZ two-monthly periods ending in odd months (anchor February)", () => {
    expect(taxPeriodContaining("2026-03-15", "bimonthly", 2)).toEqual({ start: "2026-02-01", end: "2026-03-31" });
    // Crosses the calendar year.
    expect(taxPeriodContaining("2026-01-10", "bimonthly", 2)).toEqual({ start: "2025-12-01", end: "2026-01-31" });
  });
  it("AU quarters aligned to a July financial year", () => {
    expect(taxPeriodContaining("2026-08-10", "quarterly", 7)).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(taxPeriodContaining("2026-12-31", "quarterly", 7)).toEqual({ start: "2026-10-01", end: "2026-12-31" });
  });
  it("monthly ignores the anchor", () => {
    expect(taxPeriodContaining("2024-02-29", "monthly", 5)).toEqual({ start: "2024-02-01", end: "2024-02-29" });
  });
  it("six-monthly and annual", () => {
    expect(taxPeriodContaining("2026-10-01", "six_monthly", 1)).toEqual({ start: "2026-07-01", end: "2026-12-31" });
    expect(taxPeriodContaining("2026-03-01", "annual", 4)).toEqual({ start: "2025-04-01", end: "2026-03-31" });
  });
});

describe("taxPeriodsBetween", () => {
  it("lists contiguous periods", () => {
    const ps = taxPeriodsBetween("2026-01-15", "2026-06-30", "quarterly", 1);
    expect(ps.map((p) => p.start)).toEqual(["2026-01-01", "2026-04-01"]);
    for (let i = 1; i < ps.length; i++) expect(ps[i].start).toBe(addDays(ps[i - 1].end, 1));
  });
});

describe("helpers", () => {
  it("previousPeriod of a month-aligned range", () => {
    expect(previousPeriod({ start: "2026-04-01", end: "2026-06-30" })).toEqual({ start: "2026-01-01", end: "2026-03-31" });
  });
  it("firstOpenDate pushes locked dates to the day after the lock", () => {
    expect(firstOpenDate("2026-03-31", "2026-03-15")).toBe("2026-04-01");
    expect(firstOpenDate("2026-03-31", "2026-04-02")).toBe("2026-04-02");
    expect(firstOpenDate(null, "2020-01-01")).toBe("2020-01-01");
  });
});

describe("return due dates", () => {
  it("NZ GST: 28th, except March → 7 May and November → 15 January", () => {
    const nz = getJurisdiction("NZ")!;
    expect(nz.returnForm.dueDate("2026-05-31", "bimonthly")).toBe("2026-06-28");
    expect(nz.returnForm.dueDate("2026-03-31", "bimonthly")).toBe("2026-05-07");
    expect(nz.returnForm.dueDate("2026-11-30", "bimonthly")).toBe("2027-01-15");
  });
  it("AU BAS: December quarter due 28 February", () => {
    const au = getJurisdiction("AU")!;
    expect(au.returnForm.dueDate("2026-12-31", "quarterly")).toBe("2027-02-28");
    expect(au.returnForm.dueDate("2026-09-30", "quarterly")).toBe("2026-10-28");
    expect(au.returnForm.dueDate("2026-09-30", "monthly")).toBe("2026-10-21");
  });
  it("UK VAT: one month and seven days", () => {
    const gb = getJurisdiction("GB")!;
    expect(gb.returnForm.dueDate("2026-06-30", "quarterly")).toBe("2026-08-07");
    expect(gb.returnForm.dueDate("2026-01-31", "monthly")).toBe("2026-03-07");
  });
});
