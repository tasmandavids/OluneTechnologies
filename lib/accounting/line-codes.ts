// ============================================================================
//  Which ledger codes does this invoice line carry?
//
//  Before the catalogue, only class-derived lines had codes at all
//  (classes.xero_account_code, 0082/0083) and everything else fell back to the
//  studio default. Products now carry provider-neutral defaults, with a
//  per-provider override row only when a studio's QuickBooks/MYOB chart of
//  accounts uses different codes than its Xero one.
//
//  Resolution order, most specific first:
//    1. billing_product_ledger_codes for the active provider
//    2. the product's own account_code / item_code
//    3. xero_connections.settings.sales_account_code
//    4. DEFAULT_XERO_SETTINGS.sales_account_code ("200")
//
//  itemCode has no studio-level fallback on purpose. Xero rejects an itemCode
//  that isn't in its own Products & Services list, so an unset item code must
//  stay unset rather than become a guess that fails the whole invoice.
// ============================================================================

import type { BillingProduct, LedgerProvider, TaxTreatment } from "@/lib/billing/types";
import { DEFAULT_XERO_SETTINGS } from "@/lib/xero/types";

export type ResolvedLineCodes = {
  accountCode: string | null;
  itemCode: string | null;
  /** Provider-native tax code, when the studio pinned one. */
  taxCode: string | null;
  trackingOption: string | null;
  taxTreatment: TaxTreatment;
  taxRateBp: number;
};

export type LineCodeDefaults = {
  /** From xero_connections.settings.sales_account_code. */
  salesAccountCode?: string | null;
};

export function studioDefaultAccountCode(defaults: LineCodeDefaults = {}): string {
  return (
    defaults.salesAccountCode ??
    DEFAULT_XERO_SETTINGS.sales_account_code ??
    "200"
  );
}

/**
 * Resolve the codes to freeze onto a line for `product`.
 *
 * Pure: callers pass the product (already loaded tenant-scoped) and the
 * studio's ledger defaults, so this is testable without a database and safe to
 * call inside a loop over line items.
 */
export function resolveLineCodes(
  product: Pick<BillingProduct, "accountCode" | "itemCode" | "taxTreatment" | "taxRateBp" | "ledgerCodes"> | null,
  provider: LedgerProvider | null,
  defaults: LineCodeDefaults = {},
): ResolvedLineCodes {
  if (!product) {
    return {
      accountCode: studioDefaultAccountCode(defaults),
      itemCode: null,
      taxCode: null,
      trackingOption: null,
      taxTreatment: "standard",
      taxRateBp: 1500,
    };
  }

  const override = provider
    ? (product.ledgerCodes ?? []).find((l) => l.provider === provider)
    : undefined;

  return {
    accountCode:
      override?.accountCode ?? product.accountCode ?? studioDefaultAccountCode(defaults),
    itemCode: override?.itemCode ?? product.itemCode ?? null,
    taxCode: override?.taxCode ?? null,
    trackingOption: override?.trackingOption ?? null,
    taxTreatment: product.taxTreatment,
    taxRateBp: product.taxRateBp,
  };
}

/**
 * Xero TaxType for a line.
 *
 * A studio that isn't GST registered must not send OUTPUT2 on anything — Xero
 * would post GST it never collected.
 */
export function xeroTaxType(
  treatment: TaxTreatment | null | undefined,
  gstRegistered = true,
): "OUTPUT2" | "ZERORATED" | "NONE" {
  if (!gstRegistered) return "NONE";
  switch (treatment ?? "standard") {
    case "zero_rated":
      return "ZERORATED";
    case "exempt":
      return "NONE";
    default:
      return "OUTPUT2";
  }
}
