// ============================================================================
//  lib/invoices/contractor-invoice-email.ts
//
//  PURE rendering for a contractor's invoice email — no IO, fully testable.
//
//  Instructors could create invoices and mark them sent, but there was no way
//  to actually deliver one: no email, and nothing that told the studio an
//  invoice existed. "Mark sent" was honest about what it did; it just left the
//  teacher to send the thing themselves, out of band, from their own address.
//
//  Styling deliberately matches lib/notify/messages.ts so studio recipients
//  see one consistent sender rather than two different-looking systems.
// ============================================================================

import { escapeHtml } from "@/lib/notify/messages";
import { formatInvoiceNumber } from "./format-invoice-number";

export type ContractorInvoiceLine = {
  description: string;
  quantity: number;
  unit_cents: number;
};

export type ContractorInvoiceForEmail = {
  invoiceNumber: number | null;
  recipientLabel: string;
  description: string;
  lineItems: ContractorInvoiceLine[];
  amountCents: number;
  currency: string;
  dueDate: string | null;
  notes: string | null;
};

export type RenderedInvoiceEmail = { subject: string; html: string; text: string };

/** Money for humans: 12345 → "$123.45". Currency code shown for non-NZD. */
export function formatAmount(cents: number, currency: string): string {
  const value = (cents / 100).toFixed(2);
  const code = currency.toUpperCase();
  return code === "NZD" ? `$${value}` : `${code} ${value}`;
}

/** "12 August 2026" — an invoice due date should never be ambiguous. */
function formatDueDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-NZ", { day: "numeric", month: "long", year: "numeric" });
}

/** A line's own total. Quantities can be fractional (1.5 hours), so round at the end. */
export function lineTotalCents(line: ContractorInvoiceLine): number {
  return Math.round(line.quantity * line.unit_cents);
}

export function renderContractorInvoiceEmail(
  invoice: ContractorInvoiceForEmail,
  fromName: string,
): RenderedInvoiceEmail {
  const reference = invoice.invoiceNumber !== null ? formatInvoiceNumber(invoice.invoiceNumber) : null;
  const total = formatAmount(invoice.amountCents, invoice.currency);

  const subject = reference
    ? `Invoice ${reference} from ${fromName} — ${total}`
    : `Invoice from ${fromName} — ${total}`;

  const rows = invoice.lineItems
    .map((line) => {
      const qty = Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toFixed(2);
      return `<tr>
    <td style="padding:8px 0;border-bottom:1px solid #EEE">${escapeHtml(line.description)}</td>
    <td style="padding:8px 0;border-bottom:1px solid #EEE;text-align:right;white-space:nowrap">${qty} × ${formatAmount(line.unit_cents, invoice.currency)}</td>
    <td style="padding:8px 0 8px 16px;border-bottom:1px solid #EEE;text-align:right;white-space:nowrap">${formatAmount(lineTotalCents(line), invoice.currency)}</td>
  </tr>`;
    })
    .join("\n");

  const lineTable = invoice.lineItems.length
    ? `<table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0">
${rows}
  <tr>
    <td style="padding:12px 0;font-weight:700">Total</td>
    <td></td>
    <td style="padding:12px 0 12px 16px;text-align:right;font-weight:700;white-space:nowrap">${total}</td>
  </tr>
</table>`
    : `<p style="font-size:20px;font-weight:700;margin:16px 0">${total}</p>`;

  const due = invoice.dueDate
    ? `<p style="font-size:14px;margin:0 0 4px"><strong>Due:</strong> ${escapeHtml(formatDueDate(invoice.dueDate))}</p>`
    : "";

  const notes = invoice.notes?.trim()
    ? `<p style="font-size:13px;color:#666;line-height:1.5;margin:16px 0 0">${escapeHtml(invoice.notes.trim())}</p>`
    : "";

  const html = `<div style="font-family:Hanken Grotesk,Arial,sans-serif;color:#1F1D30;max-width:560px;margin:0 auto">
  <h1 style="font-size:20px;margin:0 0 4px">${escapeHtml(reference ? `Invoice ${reference}` : "Invoice")}</h1>
  <p style="font-size:14px;color:#666;margin:0 0 16px">From ${escapeHtml(fromName)} · For ${escapeHtml(invoice.recipientLabel)}</p>
  <p style="font-size:15px;line-height:1.55;margin:0">${escapeHtml(invoice.description)}</p>
  ${lineTable}
  ${due}
  ${notes}
</div>`;

  const textLines = [
    reference ? `Invoice ${reference}` : "Invoice",
    `From ${fromName} · For ${invoice.recipientLabel}`,
    "",
    invoice.description,
    "",
    ...invoice.lineItems.map((line) => {
      const qty = Number.isInteger(line.quantity) ? String(line.quantity) : line.quantity.toFixed(2);
      return `${line.description} — ${qty} × ${formatAmount(line.unit_cents, invoice.currency)} = ${formatAmount(lineTotalCents(line), invoice.currency)}`;
    }),
    "",
    `Total: ${total}`,
    invoice.dueDate ? `Due: ${formatDueDate(invoice.dueDate)}` : "",
    invoice.notes?.trim() ? `\n${invoice.notes.trim()}` : "",
  ].filter((l) => l !== "");

  return { subject, html, text: textLines.join("\n") };
}
