// ============================================================================
//  Tax splitting for invoice amounts.
//
//  lib/currency.ts only ever knew one case: NZ GST at 15%, embedded in a
//  GST-inclusive gross. The billing catalogue (0105) adds three more that a
//  real studio hits — GST-exclusive pricing, zero-rated supplies, and studios
//  that aren't GST registered at all — so the split moves here and
//  gstComponentCents delegates to it.
//
//  Inclusive rounding is deliberately `round(gross − gross / (1 + rate))`,
//  not `gross − round(gross / (1 + rate))`. The two disagree by a cent when the
//  quotient lands exactly on .5, and the first is what every already-issued
//  invoice in the database was computed with. Changing it would make historical
//  gst_cents values irreproducible.
// ============================================================================

import type { TaxTreatment } from "./types";

export type TaxSplit = {
  /** Amount excluding tax. */
  subtotalCents: number;
  taxCents: number;
  /** What the payer is charged. */
  totalCents: number;
};

export type TaxSplitOptions = {
  /** True when the amount already contains tax (NZ retail convention). */
  inclusive: boolean;
  /** Basis points — 1500 = 15%. */
  taxRateBp: number;
  treatment?: TaxTreatment;
  /** False for a studio that isn't GST registered: no tax on anything. */
  registered?: boolean;
};

/** True when this line carries tax at all. */
export function isTaxable(treatment: TaxTreatment | undefined, registered = true): boolean {
  return registered && (treatment ?? "standard") === "standard";
}

/**
 * Split an amount into subtotal + tax + total.
 *
 * `amountCents` is the gross when `inclusive`, the net when not. Zero-rated,
 * exempt and unregistered all produce zero tax, so subtotal === total and the
 * inclusive/exclusive distinction stops mattering.
 */
export function splitTax(amountCents: number, opts: TaxSplitOptions): TaxSplit {
  const amount = Math.round(amountCents);

  if (!isTaxable(opts.treatment, opts.registered ?? true) || opts.taxRateBp <= 0) {
    return { subtotalCents: amount, taxCents: 0, totalCents: amount };
  }

  const rate = opts.taxRateBp / 10_000;

  if (opts.inclusive) {
    const taxCents = Math.round(amount - amount / (1 + rate));
    return { subtotalCents: amount - taxCents, taxCents, totalCents: amount };
  }

  const taxCents = Math.round(amount * rate);
  return { subtotalCents: amount, taxCents, totalCents: amount + taxCents };
}

export type TaxableLine = {
  lineTotalCents: number;
  taxTreatment?: TaxTreatment;
  taxRateBp?: number;
};

/**
 * Total an invoice from its lines. Tax is summed per line rather than applied
 * to the invoice total, so a mixed standard/zero-rated invoice comes out right
 * and each line's own rate is honoured.
 */
export function totalInvoice(
  lines: TaxableLine[],
  opts: { inclusive: boolean; registered?: boolean; defaultTaxRateBp?: number },
): TaxSplit {
  return lines.reduce<TaxSplit>(
    (acc, line) => {
      const split = splitTax(line.lineTotalCents, {
        inclusive: opts.inclusive,
        taxRateBp: line.taxRateBp ?? opts.defaultTaxRateBp ?? 1500,
        treatment: line.taxTreatment,
        registered: opts.registered,
      });
      return {
        subtotalCents: acc.subtotalCents + split.subtotalCents,
        taxCents: acc.taxCents + split.taxCents,
        totalCents: acc.totalCents + split.totalCents,
      };
    },
    { subtotalCents: 0, taxCents: 0, totalCents: 0 },
  );
}
