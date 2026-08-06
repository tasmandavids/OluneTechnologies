import { describe, expect, it } from "vitest";
import {
  resolveLineCodes,
  studioDefaultAccountCode,
  xeroTaxType,
} from "@/lib/accounting/line-codes";
import type { BillingProduct } from "@/lib/billing/types";

type CodeSource = Pick<
  BillingProduct,
  "accountCode" | "itemCode" | "taxTreatment" | "taxRateBp" | "ledgerCodes"
>;

function source(overrides: Partial<CodeSource> = {}): CodeSource {
  return {
    accountCode: "210",
    itemCode: "TUITION",
    taxTreatment: "standard",
    taxRateBp: 1500,
    ledgerCodes: [],
    ...overrides,
  };
}

describe("resolveLineCodes — precedence", () => {
  it("1. a per-provider override wins over everything", () => {
    const codes = resolveLineCodes(
      source({
        ledgerCodes: [
          {
            provider: "quickbooks",
            accountCode: "4000",
            itemCode: "QB-TUITION",
            taxCode: "NZ-GST",
            trackingOption: null,
          },
        ],
      }),
      "quickbooks",
      { salesAccountCode: "200" },
    );

    expect(codes.accountCode).toBe("4000");
    expect(codes.itemCode).toBe("QB-TUITION");
    expect(codes.taxCode).toBe("NZ-GST");
  });

  it("ignores an override belonging to a different provider", () => {
    const codes = resolveLineCodes(
      source({
        ledgerCodes: [
          {
            provider: "quickbooks",
            accountCode: "4000",
            itemCode: null,
            taxCode: null,
            trackingOption: null,
          },
        ],
      }),
      "xero",
      { salesAccountCode: "200" },
    );

    expect(codes.accountCode).toBe("210");
  });

  it("2. falls back to the product's own codes", () => {
    const codes = resolveLineCodes(source(), "xero", { salesAccountCode: "200" });
    expect(codes.accountCode).toBe("210");
    expect(codes.itemCode).toBe("TUITION");
  });

  it("3. falls back to the studio's configured sales account", () => {
    const codes = resolveLineCodes(source({ accountCode: null }), "xero", {
      salesAccountCode: "260",
    });
    expect(codes.accountCode).toBe("260");
  });

  it("4. falls back to the package default when nothing else is set", () => {
    const codes = resolveLineCodes(source({ accountCode: null }), "xero", {});
    expect(codes.accountCode).toBe("200");
  });

  it("never invents an item code — an unknown one fails the whole Xero invoice", () => {
    expect(resolveLineCodes(source({ itemCode: null }), "xero", {}).itemCode).toBeNull();
  });

  it("still returns a usable account for a free-text line with no product", () => {
    const codes = resolveLineCodes(null, "xero", { salesAccountCode: "205" });
    expect(codes.accountCode).toBe("205");
    expect(codes.itemCode).toBeNull();
    expect(codes.taxTreatment).toBe("standard");
  });

  it("uses the product default when no ledger is connected at all", () => {
    expect(resolveLineCodes(source(), null, {}).accountCode).toBe("210");
  });
});

describe("studioDefaultAccountCode", () => {
  it("prefers the studio's setting, then the package default", () => {
    expect(studioDefaultAccountCode({ salesAccountCode: "260" })).toBe("260");
    expect(studioDefaultAccountCode({ salesAccountCode: null })).toBe("200");
    expect(studioDefaultAccountCode()).toBe("200");
  });
});

describe("xeroTaxType", () => {
  it("maps each treatment to Xero's own tax type", () => {
    expect(xeroTaxType("standard")).toBe("OUTPUT2");
    expect(xeroTaxType("zero_rated")).toBe("ZERORATED");
    expect(xeroTaxType("exempt")).toBe("NONE");
    expect(xeroTaxType(null)).toBe("OUTPUT2");
  });

  it("never posts GST for a studio that isn't registered", () => {
    expect(xeroTaxType("standard", false)).toBe("NONE");
    expect(xeroTaxType("zero_rated", false)).toBe("NONE");
  });
});
