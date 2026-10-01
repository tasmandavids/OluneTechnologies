import { describe, expect, it } from "vitest";
import { normaliseExtraction, planDraftBill, supplierKey, type PlanContext } from "@/lib/ledger/invoice-extract";
import { attachmentPath, checkAttachment, isStudioAttachmentPath } from "@/lib/ledger/attachments";
import { countryCodeFromName, quickSetupInput } from "@/lib/ledger/quick-setup";
import { validateSetup } from "@/lib/ledger/server/setup";
import { JURISDICTIONS } from "@/lib/ledger/jurisdictions";

const ctx: PlanContext = {
  accounts: [
    { id: "acct-429", code: "429" },
    { id: "acct-469", code: "469" },
  ],
  fallbackAccountId: "acct-429",
  contactDefaultAccountId: null,
  taxRegistered: true,
  defaultPurchaseRateId: "rate-GST15-P",
  noTaxRateId: "rate-EXEMPT",
  baseCurrency: "NZD",
  pricesIncludeTax: true,
};

describe("normaliseExtraction", () => {
  it("accepts a JSON string, with or without code fences", () => {
    const ex = normaliseExtraction('```json\n{"supplierName":" Acme Ltd ","total":"$1,150.00","issueDate":"2026-04-01","lines":[]}\n```');
    expect(ex?.supplierName).toBe("Acme Ltd");
    expect(ex?.total).toBe(1150);
    expect(ex?.issueDate).toBe("2026-04-01");
    expect(ex?.isInvoice).toBe(true);
  });

  it("drops impossible dates and junk currencies", () => {
    const ex = normaliseExtraction({ issueDate: "2026-02-30", dueDate: "next week", currency: "dollars", lines: [] });
    expect(ex?.issueDate).toBeNull();
    expect(ex?.dueDate).toBeNull();
    expect(ex?.currency).toBeNull();
  });

  it("refuses something that isn't an object", () => {
    expect(normaliseExtraction("not json")).toBeNull();
    expect(normaliseExtraction([1, 2])).toBeNull();
  });
});

describe("planDraftBill", () => {
  it("keeps quantity × unit when it reproduces the line and uses the suggested account", () => {
    const plan = planDraftBill(
      normaliseExtraction({
        supplierName: "Landlord",
        invoiceNumber: "R-7",
        amountsIncludeTax: true,
        total: 920,
        tax: 120,
        lines: [{ description: "Studio rent", quantity: 2, unitAmount: 460, amount: 920, accountCode: "469" }],
      })!,
      ctx,
    );
    expect(plan.reference).toBe("R-7");
    expect(plan.lines).toEqual([{ description: "Studio rent", accountId: "acct-469", taxRateId: "rate-GST15-P", quantity: 2, unitCents: 46000 }]);
    expect(plan.warnings).toEqual([]);
  });

  it("works out exclusive amounts from which total the lines add up to", () => {
    const plan = planDraftBill(normaliseExtraction({ subtotal: 100, tax: 15, total: 115, lines: [{ description: "Tape", amount: 100 }] })!, { ...ctx, pricesIncludeTax: true });
    expect(plan.amountsIncludeTax).toBe(false);
    expect(plan.lines[0].unitCents).toBe(10000);
  });

  it("uses the no-tax rate when the document shows no tax", () => {
    const plan = planDraftBill(normaliseExtraction({ subtotal: 50, tax: 0, total: 50, lines: [{ description: "Lesson", amount: 50 }] })!, ctx);
    expect(plan.lines[0].taxRateId).toBe("rate-EXEMPT");
  });

  it("makes one line from the total when there are no usable lines", () => {
    const plan = planDraftBill(normaliseExtraction({ supplierName: "Power Co", invoiceNumber: "P1", total: 230, tax: 30, amountsIncludeTax: true, lines: [] })!, ctx);
    expect(plan.lines).toHaveLength(1);
    expect(plan.lines[0].unitCents).toBe(23000);
    expect(plan.lines[0].description).toBe("Power Co P1");
    expect(plan.lines[0].accountId).toBe("acct-429");
  });

  it("flags lines that don't add up, other currencies and non-invoices", () => {
    const plan = planDraftBill(
      normaliseExtraction({ isInvoice: false, currency: "AUD", amountsIncludeTax: true, total: 100, lines: [{ description: "A", amount: 60 }] })!,
      ctx,
    );
    expect(plan.warnings).toEqual(expect.arrayContaining(["notInvoice", "foreignCurrency", "linesDontAddUp"]));
  });

  it("leaves tax off entirely for a studio that isn't registered", () => {
    const plan = planDraftBill(normaliseExtraction({ total: 80, tax: 10, lines: [{ description: "Costume", amount: 80 }] })!, { ...ctx, taxRegistered: false });
    expect(plan.lines[0].taxRateId).toBeNull();
  });

  it("asks for amounts when there are none", () => {
    expect(planDraftBill(normaliseExtraction({ supplierName: "X", lines: [] })!, ctx).warnings).toContain("noAmounts");
  });
});

describe("supplierKey", () => {
  it("matches the same supplier written differently", () => {
    expect(supplierKey("Acme Holdings Ltd.")).toBe(supplierKey("ACME holdings limited"));
    expect(supplierKey("Mirror & Barre Co")).toBe(supplierKey("mirror barre"));
  });
});

describe("attachments", () => {
  const studio = "3f1e2d4c-1111-4222-8333-444455556666";

  it("accepts PDFs and photos up to 20 MB", () => {
    expect(checkAttachment("application/pdf", 1000)).toEqual({ ok: true, ext: "pdf" });
    expect(checkAttachment("image/heic", 5_000_000)).toEqual({ ok: true, ext: "heic" });
    expect(checkAttachment("text/html", 10)).toEqual({ ok: false, error: "attachmentType" });
    expect(checkAttachment("application/pdf", 21 * 1024 * 1024)).toEqual({ ok: false, error: "attachmentSize" });
  });

  it("only trusts paths inside the studio's own folder", () => {
    const path = attachmentPath(studio, "pdf", "0b8f6c1e-2a3b-4c5d-8e9f-0a1b2c3d4e5f");
    expect(isStudioAttachmentPath(studio, path)).toBe(true);
    expect(isStudioAttachmentPath("00000000-0000-0000-0000-000000000000", path)).toBe(false);
    expect(isStudioAttachmentPath(studio, `${studio}/../other/x.pdf`)).toBe(false);
    expect(isStudioAttachmentPath(studio, `${studio}/x.exe`)).toBe(false);
  });
});

describe("quick setup", () => {
  it("reads countries the way studios type them", () => {
    expect(countryCodeFromName("New Zealand")).toBe("NZ");
    expect(countryCodeFromName("uk")).toBe("GB");
    expect(countryCodeFromName("Australia")).toBe("AU");
    expect(countryCodeFromName("Narnia")).toBeNull();
  });

  it("produces a setup every pack accepts", () => {
    for (const j of JURISDICTIONS) {
      const region = j.regions?.[0]?.code ?? null;
      for (const registered of [true, false]) {
        const input = quickSetupInput({ country: j.code, region, taxRegistered: registered, taxNumber: null }, "2026-10-02");
        expect(input, j.code).not.toBeNull();
        expect(validateSetup(input!), `${j.code} registered=${registered}`).toBeNull();
      }
    }
  });

  it("starts a registered NZ studio at the start of its GST period", () => {
    const input = quickSetupInput({ country: "NZ", region: null, taxRegistered: true, taxNumber: null }, "2026-10-02")!;
    expect(input.jurisdiction).toBe("NZ");
    expect(input.conversionDate <= "2026-10-01").toBe(true);
    expect(input.custom).toBeNull();
  });

  it("needs a region where the pack has them", () => {
    const withRegions = JURISDICTIONS.find((j) => j.regions?.length);
    if (withRegions) expect(quickSetupInput({ country: withRegions.code, region: null, taxRegistered: true, taxNumber: null }, "2026-10-02")).toBeNull();
  });
});
