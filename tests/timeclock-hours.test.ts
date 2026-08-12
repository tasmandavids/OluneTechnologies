import { describe, it, expect } from "vitest";
import {
  entryMinutes,
  estimatedGrossCents,
  formatMinutes,
  minutesToDecimalHours,
  openEntryCount,
  resolveRateCents,
  shiftMinutes,
  totalMinutes,
  varianceMinutes,
  type TimeEntry,
} from "@/lib/timeclock/hours";

function entry(over: Partial<TimeEntry> = {}): TimeEntry {
  return {
    entryDate: "2026-08-07",
    clockInAt: "2026-08-07T09:00:00Z",
    clockOutAt: "2026-08-07T17:00:00Z",
    hourType: "regular",
    ...over,
  };
}

describe("entryMinutes", () => {
  it("measures a closed shift", () => {
    expect(entryMinutes(entry())).toBe(480);
  });

  it("returns null for an open shift rather than zero", () => {
    // Zero would let a caller silently under-report the week; null forces a
    // decision.
    expect(entryMinutes(entry({ clockOutAt: null }))).toBeNull();
  });

  it("returns null for unparseable or inverted instants", () => {
    expect(entryMinutes(entry({ clockInAt: "not-a-date" }))).toBeNull();
    expect(entryMinutes(entry({ clockOutAt: "2026-08-07T08:00:00Z" }))).toBeNull();
  });
});

describe("totalMinutes / openEntryCount", () => {
  it("sums closed entries and ignores open ones", () => {
    const entries = [entry(), entry({ clockOutAt: null }), entry({ clockOutAt: "2026-08-07T12:00:00Z" })];
    expect(totalMinutes(entries)).toBe(480 + 180);
    expect(openEntryCount(entries)).toBe(1);
  });
});

describe("shiftMinutes", () => {
  it("measures a scheduled shift from wall-clock times", () => {
    expect(shiftMinutes("09:00:00", "17:00:00")).toBe(480);
    expect(shiftMinutes("09:30", "10:15")).toBe(45);
  });

  it("rejects malformed or non-advancing times", () => {
    expect(shiftMinutes("17:00", "09:00")).toBeNull();
    expect(shiftMinutes("09:00", "09:00")).toBeNull();
    expect(shiftMinutes("25:00", "26:00")).toBeNull();
    expect(shiftMinutes("nope", "17:00")).toBeNull();
  });
});

describe("varianceMinutes", () => {
  it("is positive when worked over and negative when under", () => {
    expect(varianceMinutes(500, 480)).toBe(20);
    expect(varianceMinutes(450, 480)).toBe(-30);
  });
});

describe("resolveRateCents", () => {
  const rates = [
    { effectiveFrom: "2026-01-01", rateCents: 2500 },
    { effectiveFrom: "2026-07-01", rateCents: 2800 },
  ];

  it("picks the latest rate in force on the date", () => {
    expect(resolveRateCents(rates, "2026-06-30")).toBe(2500);
    expect(resolveRateCents(rates, "2026-07-01")).toBe(2800);
    expect(resolveRateCents(rates, "2026-08-07")).toBe(2800);
  });

  it("does not let a future pay rise reprice past work", () => {
    // The whole point of effective dating: an approved, paid timesheet must not
    // change value when someone gets a raise.
    expect(resolveRateCents(rates, "2026-02-01")).toBe(2500);
  });

  it("returns null when no rate was in force yet", () => {
    expect(resolveRateCents(rates, "2025-12-31")).toBeNull();
    expect(resolveRateCents([], "2026-08-07")).toBeNull();
  });

  it("is order-independent", () => {
    expect(resolveRateCents([...rates].reverse(), "2026-08-07")).toBe(2800);
  });
});

describe("estimatedGrossCents", () => {
  const rates = [{ effectiveFrom: "2026-01-01", rateCents: 3000 }]; // $30/h

  it("costs paid hours at the rate in force", () => {
    const result = estimatedGrossCents([entry()], rates);
    expect(result.paidMinutes).toBe(480);
    expect(result.grossCents).toBe(24000); // 8h × $30
  });

  it("excludes unpaid hour types", () => {
    const result = estimatedGrossCents([entry({ hourType: "unpaid" })], rates);
    expect(result.grossCents).toBe(0);
    expect(result.paidMinutes).toBe(0);
  });

  it("applies no overtime multiplier", () => {
    // Recording that hours were overtime is not a claim about their value —
    // see the module header.
    const regular = estimatedGrossCents([entry()], rates);
    const overtime = estimatedGrossCents([entry({ hourType: "overtime" })], rates);
    expect(overtime.grossCents).toBe(regular.grossCents);
  });

  it("skips open shifts without costing them", () => {
    const result = estimatedGrossCents([entry({ clockOutAt: null })], rates);
    expect(result.grossCents).toBe(0);
    expect(result.unratedEntryDates).toEqual([]);
  });

  it("reports entries it could not cost instead of treating them as free", () => {
    const result = estimatedGrossCents(
      [entry({ entryDate: "2025-06-01", clockInAt: "2025-06-01T09:00:00Z", clockOutAt: "2025-06-01T17:00:00Z" })],
      rates,
    );
    expect(result.grossCents).toBe(0);
    expect(result.unratedEntryDates).toEqual(["2025-06-01"]);
  });

  it("rounds once at the end, not per entry", () => {
    // 10 minutes at $30/h is 500.0 cents exactly; three of them must not drift.
    const short = entry({ clockOutAt: "2026-08-07T09:10:00Z" });
    const result = estimatedGrossCents([short, short, short], rates);
    expect(result.grossCents).toBe(1500);
  });
});

describe("formatting", () => {
  it("formats minutes for display", () => {
    expect(formatMinutes(480)).toBe("8h");
    expect(formatMinutes(450)).toBe("7h 30m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(-30)).toBe("-30m");
  });

  it("converts to the decimal hours payroll systems ingest", () => {
    expect(minutesToDecimalHours(480)).toBe(8);
    expect(minutesToDecimalHours(450)).toBe(7.5);
    expect(minutesToDecimalHours(50)).toBe(0.83);
  });
});
