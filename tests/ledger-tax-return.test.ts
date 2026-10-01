import { describe, expect, it } from "vitest";
import { buildReturnEntries, computeReturn, rateBreakdown } from "@/lib/ledger/tax-return";
import type { TaxSummaryRow } from "@/lib/ledger/types";
import { packChart } from "./helpers/ledger-chart";

const row = (rateCode: string, direction: "sales" | "purchases", netCents: number, taxCents: number, basis: "accrual" | "cash" = "accrual"): TaxSummaryRow => ({
  basis,
  direction,
  taxRateId: `rate-${rateCode}`,
  netCents,
  taxCents,
});

const boxes = (r: ReturnType<typeof computeReturn>) => Object.fromEntries(r.boxes.map((b) => [b.id, b.valueCents]));

describe("NZ GST101A", () => {
  const { j, rates } = packChart("NZ");
  it("computes boxes 5–15 from the 3/23 fraction", () => {
    const entries = buildReturnEntries(
      [row("GST15", "sales", 1000000, 150000), row("ZERO", "sales", 50000, 0), row("GST15-P", "purchases", 200000, 30000), row("NOGST", "sales", 99999, 0)],
      rates,
      { sales: "accrual", purchases: "accrual" },
    );
    const b = boxes(computeReturn(j, entries));
    expect(b["5"]).toBe(1200000); // 1,150,000 standard gross + 50,000 zero-rated; out of scope excluded
    expect(b["6"]).toBe(50000);
    expect(b["7"]).toBe(1150000);
    expect(b["8"]).toBe(150000);
    expect(b["11"]).toBe(230000);
    expect(b["12"]).toBe(30000);
    expect(b["15"]).toBe(120000);
  });

  it("hybrid basis picks accrual for sales and cash for purchases", () => {
    const entries = buildReturnEntries(
      [row("GST15", "sales", 1000, 150, "accrual"), row("GST15", "sales", 500, 75, "cash"), row("GST15-P", "purchases", 800, 120, "accrual"), row("GST15-P", "purchases", 400, 60, "cash")],
      rates,
      { sales: "accrual", purchases: "cash" },
    );
    expect(entries.map((e) => [e.direction, e.netCents])).toEqual([["sales", 1000], ["purchases", 400]]);
  });

  it("manual box values flow into totals", () => {
    const r = computeReturn(j, [], { "9": 1234 });
    expect(boxes(r)["10"]).toBe(1234);
    expect(r.netPayableCents).toBe(1234);
  });
});

describe("UK VAT100", () => {
  it("boxes 1, 4, 5, 6, 7", () => {
    const { j, rates } = packChart("GB");
    const entries = buildReturnEntries(
      [row("VAT20", "sales", 100000, 20000), row("EXEMPT", "sales", 30000, 0), row("VAT20-P", "purchases", 40000, 8000)],
      rates,
      { sales: "accrual", purchases: "accrual" },
    );
    const b = boxes(computeReturn(j, entries));
    expect([b["1"], b["3"], b["4"], b["5"], b["6"], b["7"]]).toEqual([20000, 20000, 8000, 12000, 130000, 40000]);
  });
});

describe("AU BAS", () => {
  it("G1 includes GST; 1A − 1B is the net", () => {
    const { j, rates } = packChart("AU");
    const entries = buildReturnEntries(
      [row("GST", "sales", 100000, 10000), row("FRE", "sales", 5000, 0), row("CAP", "purchases", 20000, 2000), row("GST-P", "purchases", 30000, 3000)],
      rates,
      { sales: "accrual", purchases: "accrual" },
    );
    const r = computeReturn(j, entries);
    const b = boxes(r);
    expect(b.G1).toBe(115000);
    expect(b.G3).toBe(5000);
    expect(b.G10).toBe(22000);
    expect(b.G11).toBe(33000);
    expect(r.netPayableCents).toBe(5000);
  });
});

describe("Canada GST34 with PST", () => {
  it("line 103 counts only the GST share of a compound rate; PST reported separately", () => {
    const { j, rates } = packChart("CA", "BC");
    const entries = buildReturnEntries(
      [row("GST+PST", "sales", 10000, 1200), row("GST", "sales", 20000, 1000), row("GST+PST", "purchases", 10700, 500)],
      rates,
      { sales: "accrual", purchases: "accrual" },
    );
    const b = boxes(computeReturn(j, entries));
    expect(b["103"]).toBe(1500); // 500 GST from compound + 1000 GST-only
    expect(b["PST"]).toBe(700);
    // Purchase tax on a compound rate is only the recoverable GST.
    expect(b["106"]).toBe(500);
    expect(b["109"]).toBe(1000);
  });
});

describe("Japan consumption tax", () => {
  it("separates national and local tax", () => {
    const { j, rates } = packChart("JP");
    const entries = buildReturnEntries([row("10%", "sales", 1000000, 100000), row("10%仕", "purchases", 400000, 40000)], rates, { sales: "accrual", purchases: "accrual" });
    const b = boxes(computeReturn(j, entries));
    expect(b["消費税額"]).toBe(78000);
    expect(b["控除対象仕入税額"]).toBe(31200);
    expect(b["譲渡割額"]).toBe(22000 - 8800);
    expect(b["合計"]).toBe(60000);
  });
});

describe("rateBreakdown", () => {
  it("groups by direction and rate", () => {
    const { rates } = packChart("NZ");
    const entries = buildReturnEntries([row("GST15", "sales", 100, 15), row("GST15-P", "purchases", 50, 7)], rates, { sales: "accrual", purchases: "accrual" });
    expect(rateBreakdown(entries)).toEqual([
      { rateCode: "GST15", direction: "sales", netCents: 100, taxCents: 15 },
      { rateCode: "GST15-P", direction: "purchases", netCents: 50, taxCents: 7 },
    ]);
  });
});
