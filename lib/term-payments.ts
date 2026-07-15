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
