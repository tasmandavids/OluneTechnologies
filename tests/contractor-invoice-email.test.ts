import { describe, it, expect } from "vitest";
import {
  formatAmount,
  lineTotalCents,
  renderContractorInvoiceEmail,
  type ContractorInvoiceForEmail,
} from "@/lib/invoices/contractor-invoice-email";

const base = (over: Partial<ContractorInvoiceForEmail> = {}): ContractorInvoiceForEmail => ({
  invoiceNumber: 42,
  recipientLabel: "Sunrise Dance Studio",
  description: "Term 3 cover teaching",
  lineItems: [{ description: "Ballet — Tuesday", quantity: 4, unit_cents: 6500 }],
  amountCents: 26000,
  currency: "nzd",
  dueDate: "2026-08-20",
  notes: null,
  ...over,
});

describe("formatAmount", () => {
  it("formats NZD as a bare dollar amount", () => {
    expect(formatAmount(26000, "nzd")).toBe("$260.00");
    expect(formatAmount(5, "NZD")).toBe("$0.05");
  });

  it("names any other currency so the amount is never ambiguous", () => {
    expect(formatAmount(26000, "aud")).toBe("AUD 260.00");
  });
});

describe("lineTotalCents", () => {
  it("multiplies quantity by unit price", () => {
    expect(lineTotalCents({ description: "x", quantity: 4, unit_cents: 6500 })).toBe(26000);
  });

  // Hourly work is billed in halves and quarters; a float total would render
  // as $97.50000000000001 on some inputs.
  it("rounds fractional quantities to whole cents", () => {
    expect(lineTotalCents({ description: "x", quantity: 1.5, unit_cents: 6500 })).toBe(9750);
    expect(lineTotalCents({ description: "x", quantity: 0.1, unit_cents: 333 })).toBe(33);
  });
});

describe("renderContractorInvoiceEmail", () => {
  it("puts the reference, sender and total in the subject", () => {
    const { subject } = renderContractorInvoiceEmail(base(), "Jane Smith");
    expect(subject).toContain("INV-0042");
    expect(subject).toContain("Jane Smith");
    expect(subject).toContain("$260.00");
  });

  it("copes with an invoice that has no number yet", () => {
    const { subject, html } = renderContractorInvoiceEmail(base({ invoiceNumber: null }), "Jane Smith");
    expect(subject).toBe("Invoice from Jane Smith — $260.00");
    expect(html).not.toContain("INV-");
  });

  it("renders each line with its own total", () => {
    const { html, text } = renderContractorInvoiceEmail(
      base({
        lineItems: [
          { description: "Ballet — Tuesday", quantity: 4, unit_cents: 6500 },
          { description: "Costume fitting", quantity: 1.5, unit_cents: 4000 },
        ],
        amountCents: 32000,
      }),
      "Jane Smith",
    );
    expect(html).toContain("Ballet — Tuesday");
    expect(html).toContain("$260.00");
    expect(text).toContain("Costume fitting — 1.50 × $40.00 = $60.00");
  });

  it("falls back to a bare total when there are no line items", () => {
    const { html } = renderContractorInvoiceEmail(base({ lineItems: [] }), "Jane Smith");
    expect(html).toContain("$260.00");
    expect(html).not.toContain("<table");
  });

  it("spells the due date out in full so it can't be misread", () => {
    const { html } = renderContractorInvoiceEmail(base(), "Jane Smith");
    expect(html).toContain("20 August 2026");
  });

  it("omits the due row entirely when there's no due date", () => {
    const { html } = renderContractorInvoiceEmail(base({ dueDate: null }), "Jane Smith");
    expect(html).not.toContain("<strong>Due:</strong>");
  });

  // Descriptions and notes are instructor-authored free text landing in an
  // HTML email — they must not be able to inject markup.
  it("escapes instructor-supplied text", () => {
    const { html } = renderContractorInvoiceEmail(
      base({
        description: '<script>alert("x")</script>',
        recipientLabel: "Tom & Sons <Studio>",
        notes: "<img src=x onerror=alert(1)>",
      }),
      "Jane <b>Smith</b>",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Tom &amp; Sons &lt;Studio&gt;");
    expect(html).toContain("Jane &lt;b&gt;Smith&lt;/b&gt;");
  });

  it("includes notes when present and nothing when blank", () => {
    expect(renderContractorInvoiceEmail(base({ notes: "Bank: 12-3456" }), "J").html).toContain(
      "Bank: 12-3456",
    );
    expect(renderContractorInvoiceEmail(base({ notes: "   " }), "J").text).not.toContain("  \n");
  });
});
