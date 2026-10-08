// ============================================================================
//  lib/term-payments.ts
//
//  Studio term fees are quoted as a full-term amount (typically ~3 months).
//  Parents may pay in 3 equal monthly installments instead of upfront.
// ============================================================================

/** Default number of monthly payments per dance term. */
export const TERM_INSTALLMENT_COUNT = 3;

/**
 * Split a term total into `count` installment amounts (cents).
 * Remainder cents are applied to the final installment.
 */
export function splitTermInstallments(
  totalCents: number,
  count: number = TERM_INSTALLMENT_COUNT,
): number[] {
  if (totalCents <= 0 || count <= 0) return [];
  const base = Math.floor(totalCents / count);
  const remainder = totalCents - base * count;
  const amounts = Array.from({ length: count }, () => base);
  amounts[count - 1] = base + remainder;
  return amounts;
}

/**
 * Monthly auto-pay charge for a full-term class fee. Auto-pay spreads the same
 * term total as the 3-installment plan, so the monthly figure is the first
 * installment — keeping subscriptions and installments quoting the same amount.
 */
export function monthlyFromTermFeeCents(termCents: number): number {
  return splitTermInstallments(termCents)[0] ?? 0;
}

/**
 * Monthly auto-pay charge for a class, from its catalogue product (audit B-08).
 * The product price is per its own pricing model, so a $90/month class charges
 * $90 — not a third of it. Returns null when the model cannot be auto-paid
 * (one-off and per-session fees have no recurring cycle).
 *
 * A class with no product (legacy price_cents) keeps the term-fee rule.
 */
export function autoPayMonthlyCents(cls: {
  priceCents: number;
  pricingModel: string | null;
  recurringInterval: string | null;
  recurringIntervalCount: number;
}): number | null {
  const { priceCents, pricingModel, recurringInterval, recurringIntervalCount } = cls;
  if (pricingModel === null || pricingModel === "term") return monthlyFromTermFeeCents(priceCents);
  if (pricingModel !== "recurring") return null;
  const n = Math.max(1, recurringIntervalCount);
  switch (recurringInterval) {
    case "month":
      return Math.round(priceCents / n);
    case "week":
      return Math.round((priceCents * 52) / 12 / n);
    case "fortnight":
      return Math.round((priceCents * 26) / 12 / n);
    case "year":
      return Math.round(priceCents / 12 / n);
    case "term":
      return monthlyFromTermFeeCents(Math.round(priceCents / n));
    default:
      return null;
  }
}

/** Next installment amount for a plan, or null when complete. */
export function nextInstallmentAmountCents(
  installmentAmounts: number[],
  installmentsPaid: number,
): number | null {
  if (installmentsPaid >= installmentAmounts.length) return null;
  return installmentAmounts[installmentsPaid] ?? null;
}

/** ISO date string one calendar month from today (UTC date portion). */
export function nextMonthlyDueDate(from = new Date()): string {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}
