import { describe, expect, it } from "vitest";
import { dollarsFromCents, centsFromDollars } from "@/lib/xero/reports";
import { toXeroLineItems, type OluneLineItemRow } from "@/lib/xero/line-items";

function row(overrides: Partial<OluneLineItemRow> = {}): OluneLineItemRow {
  return {
    description: "Term tuition",
    quantity: 1,
    unit_cents: 22000,
    sort_order: 0,
    account_code: "210",
    item_code: "TUITION",
    tax_treatment: "standard",
    tax_rate_bp: 1500,
    ...overrides,
  };
}

const fallback = { fallbackDescription: "Tuition & fees", fallbackAmountCents: 5000 };

describe("toXeroLineItems", () => {
  it("mirrors each line with its frozen codes and tax type", () => {
    const { lineItems, hasLineItems } = toXeroLineItems([row()], fallback);

    expect(hasLineItems).toBe(true);
    expect(lineItems[0]).toEqual({
      description: "Term tuition",
      quantity: 1,
      unitAmount: 220,
      accountCode: "210",
      itemCode: "TUITION",
      taxType: "OUTPUT2",
    });
  });

  it("maps zero-rated and exempt lines to their own tax types", () => {
    const { lineItems } = toXeroLineItems(
      [row({ tax_treatment: "zero_rated" }), row({ tax_treatment: "exempt", sort_order: 1 })],
      fallback,
    );
    expect(lineItems[0].taxType).toBe("ZERORATED");
    expect(lineItems[1].taxType).toBe("NONE");
  });

  it("posts no GST at all for a studio that isn't registered", () => {
    const { lineItems } = toXeroLineItems([row()], { ...fallback, gstRegistered: false });
    expect(lineItems[0].taxType).toBe("NONE");
  });

  it("leaves accountCode undefined so the caller's fallback chain can apply", () => {
    const { lineItems } = toXeroLineItems([row({ account_code: null })], fallback);
    expect(lineItems[0].accountCode).toBeUndefined();
  });

  it("omits an unset itemCode rather than guessing — Xero rejects unknown ones", () => {
    const { lineItems } = toXeroLineItems([row({ item_code: null })], fallback);
    expect(lineItems[0].itemCode).toBeUndefined();
  });

  it("preserves fractional quantities from hourly products", () => {
    const { lineItems } = toXeroLineItems([row({ quantity: 1.75, unit_cents: 6000 })], fallback);
    expect(lineItems[0].quantity).toBe(1.75);
    expect(lineItems[0].unitAmount).toBe(60);
  });

  it("keeps lines in sort order rather than query order", () => {
    const { lineItems } = toXeroLineItems(
      [row({ description: "second", sort_order: 1 }), row({ description: "first", sort_order: 0 })],
      fallback,
    );
    expect(lineItems.map((l) => l.description)).toEqual(["first", "second"]);
  });

  it("synthesizes one line only when the invoice genuinely has none", () => {
    const { lineItems, hasLineItems } = toXeroLineItems([], fallback);
    expect(hasLineItems).toBe(false);
    expect(lineItems).toEqual([
      { description: "Tuition & fees", quantity: 1, unitAmount: 50, taxType: "OUTPUT2" },
    ]);
  });

  it("defaults an uncoded legacy line to standard GST", () => {
    const { lineItems } = toXeroLineItems(
      [row({ tax_treatment: null, tax_rate_bp: null })],
      fallback,
    );
    expect(lineItems[0].taxType).toBe("OUTPUT2");
  });
});

describe("xero money helpers", () => {
  it("converts cents to dollars for Xero API payloads", () => {
    expect(dollarsFromCents(1999)).toBe(19.99);
    expect(centsFromDollars(19.99)).toBe(1999);
  });
});

describe("xero sync idempotency key", () => {
  it("uses stable source_type + source_id composite", () => {
    const key = { source_type: "invoice" as const, source_id: "abc-123" };
    expect(`${key.source_type}:${key.source_id}`).toBe("invoice:abc-123");
  });
});
