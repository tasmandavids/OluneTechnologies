// ============================================================================
//  Mapping Olune invoice lines onto Xero LineItems.
//
//  Pulled out of sync-sale.ts so the mapping is a pure function that can be
//  tested without a Xero client. Three things it must get right, all of which
//  used to be hardcoded:
//
//    · taxType came from a literal "OUTPUT2" on every line, which posts GST for
//      zero-rated supplies and for studios that aren't GST registered at all.
//      It now follows the treatment frozen onto the line (0105).
//    · lineAmountTypes is a property of the INVOICE in Xero, not the line, so a
//      mixed inclusive/exclusive invoice can't be expressed. The studio-level
//      setting is frozen onto invoices.tax_inclusive at creation and read back
//      here.
//    · itemCode is only ever sent when set. Xero rejects an itemCode that isn't
//      in its own Products & Services list, and a rejected line fails the whole
//      invoice — so an unset code must stay unset, never a guess.
//
//  accountCode is deliberately left as-is (possibly null) rather than defaulted
//  here; callers apply their own `?? cfg.sales_account_code ?? DEFAULT` chain
//  so a line's own code always wins.
// ============================================================================

import type { LineItem } from "xero-node";
import { xeroTaxType } from "@/lib/accounting/line-codes";
import type { TaxTreatment } from "@/lib/billing/types";
import { dollarsFromCents } from "./reports";

export type OluneLineItemRow = {
  description: string;
  quantity: number;
  unit_cents: number;
  sort_order: number;
  account_code: string | null;
  item_code: string | null;
  tax_treatment?: string | null;
  tax_rate_bp?: number | null;
};

export type LineItemMapOptions = {
  /** False for a studio that isn't GST registered — every line becomes NONE. */
  gstRegistered?: boolean;
  /** Used when the invoice has no invoice_line_items rows at all. */
  fallbackDescription: string;
  fallbackAmountCents: number;
};

/**
 * Mirror each real invoice_line_items row into Xero.
 *
 * Never flatten an itemized invoice into one generic line — the copy in Xero
 * would silently stop matching what the parent was actually billed for. The
 * single synthesized line is only for invoices that genuinely have no lines.
 */
export function toXeroLineItems(
  rows: OluneLineItemRow[],
  opts: LineItemMapOptions,
): { lineItems: LineItem[]; hasLineItems: boolean } {
  const registered = opts.gstRegistered !== false;
  const sorted = rows.slice().sort((a, b) => a.sort_order - b.sort_order);

  if (sorted.length === 0) {
    return {
      hasLineItems: false,
      lineItems: [
        {
          description: opts.fallbackDescription,
          quantity: 1,
          unitAmount: dollarsFromCents(opts.fallbackAmountCents),
          taxType: xeroTaxType("standard", registered),
        },
      ],
    };
  }

  return {
    hasLineItems: true,
    lineItems: sorted.map((li) => ({
      description: li.description,
      quantity: Number(li.quantity),
      unitAmount: dollarsFromCents(li.unit_cents),
      accountCode: li.account_code ?? undefined,
      itemCode: li.item_code ?? undefined,
      taxType: xeroTaxType((li.tax_treatment as TaxTreatment | null) ?? "standard", registered),
    })),
  };
}
