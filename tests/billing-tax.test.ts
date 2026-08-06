import { describe, expect, it } from "vitest";
import { isTaxable, splitTax, totalInvoice } from "@/lib/billing/tax";
import { gstComponentCents, GST_RATE } from "@/lib/currency";

const NZ_GST = 1500;

describe("splitTax — GST inclusive (the NZ default)", () => {
  it("pulls the embedded GST out of a gross amount", () => {
    expect(splitTax(11500, { inclusive: true, taxRateBp: NZ_GST })).toEqual({
      subtotalCents: 10000,
      taxCents: 1500,
      totalCents: 11500,
    });
  });

  it("keeps subtotal + tax === total at every amount", () => {
    for (const gross of [1, 3, 4, 7, 99, 100, 2500, 12345, 999999]) {
      const split = splitTax(gross, { inclusive: true, taxRateBp: NZ_GST });
      expect(split.subtotalCents + split.taxCents).toBe(split.totalCents);
      expect(split.totalCents).toBe(gross);
    }
  });

  it("matches gstComponentCents exactly — historical invoices must stay reproducible", () => {
    for (const gross of [1, 3, 4, 7, 13, 99, 100, 115, 2500, 4999, 12345, 999999]) {
      expect(splitTax(gross, { inclusive: true, taxRateBp: GST_RATE * 10_000 }).taxCents).toBe(
        gstComponentCents(gross),
      );
    }
  });
});

describe("splitTax — GST exclusive", () => {
  it("adds GST on top of the entered price", () => {
    expect(splitTax(10000, { inclusive: false, taxRateBp: NZ_GST })).toEqual({
      subtotalCents: 10000,
      taxCents: 1500,
      totalCents: 11500,
    });
  });

  it("charges the payer more than the exclusive price", () => {
    const split = splitTax(4500, { inclusive: false, taxRateBp: NZ_GST });
    expect(split.totalCents).toBeGreaterThan(4500);
    expect(split.subtotalCents).toBe(4500);
  });
});

describe("splitTax — zero-rated, exempt and unregistered", () => {
  it("charges nothing on a zero-rated line", () => {
    expect(splitTax(11500, { inclusive: true, taxRateBp: NZ_GST, treatment: "zero_rated" })).toEqual(
      { subtotalCents: 11500, taxCents: 0, totalCents: 11500 },
    );
  });

  it("charges nothing on an exempt line", () => {
    expect(splitTax(11500, { inclusive: true, taxRateBp: NZ_GST, treatment: "exempt" })).toEqual({
      subtotalCents: 11500,
      taxCents: 0,
      totalCents: 11500,
    });
  });

  it("charges nothing at all when the studio isn't GST registered", () => {
    const split = splitTax(11500, {
      inclusive: true,
      taxRateBp: NZ_GST,
      treatment: "standard",
      registered: false,
    });
    expect(split.taxCents).toBe(0);
    expect(split.subtotalCents).toBe(11500);
  });

  it("treats a zero rate as no tax even when standard-rated", () => {
    expect(splitTax(5000, { inclusive: false, taxRateBp: 0 }).taxCents).toBe(0);
  });
});

describe("isTaxable", () => {
  it("is true only for a standard-rated line at a registered studio", () => {
    expect(isTaxable("standard", true)).toBe(true);
    expect(isTaxable("standard", false)).toBe(false);
    expect(isTaxable("zero_rated", true)).toBe(false);
    expect(isTaxable("exempt", true)).toBe(false);
    expect(isTaxable(undefined, true)).toBe(true);
  });
});

describe("totalInvoice", () => {
  it("sums tax per line so a mixed invoice comes out right", () => {
    const totals = totalInvoice(
      [
        { lineTotalCents: 11500, taxTreatment: "standard", taxRateBp: NZ_GST },
        { lineTotalCents: 5000, taxTreatment: "zero_rated", taxRateBp: NZ_GST },
      ],
      { inclusive: true },
    );

    // Only the standard-rated line carries GST.
    expect(totals.taxCents).toBe(1500);
    expect(totals.totalCents).toBe(16500);
    expect(totals.subtotalCents).toBe(15000);
  });

  it("honours a per-line rate over the invoice default", () => {
    const totals = totalInvoice([{ lineTotalCents: 10000, taxRateBp: 0 }], {
      inclusive: false,
      defaultTaxRateBp: NZ_GST,
    });
    expect(totals.taxCents).toBe(0);
  });

  it("returns zeroes for an invoice with no lines", () => {
    expect(totalInvoice([], { inclusive: true })).toEqual({
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
    });
  });
});
