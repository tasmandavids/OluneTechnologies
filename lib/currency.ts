// ============================================================================
//  Single source of truth for currency + GST across the whole app.
//
//  Olune studios are NZ-based: invoices carry NZ GST (15%), the UI locale is
//  en-NZ, and the root <html lang> is en-NZ. All Stripe charges therefore use
//  NZD so the charged currency matches the displayed currency. Previously some
//  flows charged AUD while displaying NZD — import from here everywhere instead
//  of hand-rolling Intl formatters or hardcoding currency strings.
// ============================================================================

import { splitTax } from "./billing/tax";

/** Stripe charge currency (lowercase ISO-4217, as Stripe expects). */
export const CURRENCY = "nzd" as const;

/** ISO-4217 code for Intl.NumberFormat. */
export const CURRENCY_CODE = "NZD" as const;

/** Display locale. */
export const CURRENCY_LOCALE = "en-NZ" as const;

/** NZ GST rate. Prices are GST-inclusive (NZ retail convention). */
export const GST_RATE = 0.15;

/** Format integer cents as a localized currency string, e.g. 2000 → "$20.00". */
export function formatMoney(cents: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: "currency",
    currency: CURRENCY_CODE,
    ...opts,
  }).format((cents ?? 0) / 100);
}

/**
 * GST component embedded in a GST-inclusive gross amount (integer cents).
 * For 15% inclusive GST: gst = gross − gross / 1.15.
 *
 * Kept as the shorthand for the default NZ case. Anything that needs
 * GST-exclusive pricing, zero-rated supplies, or a studio that isn't GST
 * registered should call splitTax directly.
 */
export function gstComponentCents(grossCents: number): number {
  return splitTax(grossCents, { inclusive: true, taxRateBp: GST_RATE * 10_000 }).taxCents;
}
