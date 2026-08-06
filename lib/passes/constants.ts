// ============================================================================
//  Class-pass fallbacks.
//
//  These used to BE the price and the account code. Since the billing catalogue
//  (0105) both come from the studio's own PASS-DROPIN product, and RLS (0107)
//  validates a pass's price against that product rather than against a literal.
//  They survive only as the values used to seed PASS-DROPIN in the 0106
//  backfill, and as the last-resort defaults if a studio somehow has no pass
//  product at all.
// ============================================================================

/** Seed price for a studio's drop-in pass product — cents, studio's CURRENCY (NZD). */
export const CLASS_PASS_PRICE_CENTS = 2500;

/** Seed revenue account for the drop-in pass product. */
export const CLASS_PASS_XERO_ACCOUNT_CODE = "200-01";

/** Studio SKU of the drop-in pass product, seeded by 0106. */
export const CLASS_PASS_PRODUCT_CODE = "PASS-DROPIN";
