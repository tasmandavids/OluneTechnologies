// ============================================================================
//  Pure pricing maths for the billing catalogue.
//
//  Split out from lib/billing/catalog.ts (which is server-only and talks to
//  Supabase) so the rules that decide what a family actually gets charged can
//  be unit-tested directly and reused in the browser for live quote previews.
//
//  Every amount is integer cents; quantities are the only place a fraction is
//  allowed, and only because hourly billing needs 1.5 hours to mean 1.5 hours.
// ============================================================================

import type {
  BillingProduct,
  PricedLine,
  PriceTier,
  RecurringInterval,
} from "./types";

/** Quantities round to 3dp — the DB column is numeric(10,3). */
const QTY_DP = 1000;

function roundQuantity(value: number): number {
  return Math.round(value * QTY_DP) / QTY_DP;
}

/**
 * Apply a product's minimum and rounding increment to a raw quantity.
 *
 * A 20-minute private lesson on a product with a 1-hour minimum bills an hour;
 * a 95-minute one on 15-minute increments bills 1.75. Rounds up, never down —
 * a studio that sets a 15-minute increment is stating the smallest unit it is
 * willing to sell, not a target to round toward.
 */
export function applyUnitRules(
  quantity: number,
  rules: { minUnits?: number | null; incrementUnits?: number | null },
): number {
  let qty = Math.max(quantity, 0);
  const increment = rules.incrementUnits ?? null;
  if (increment && increment > 0) {
    qty = Math.ceil(roundQuantity(qty / increment) - 1e-9) * increment;
  }
  const min = rules.minUnits ?? null;
  if (min && min > 0) qty = Math.max(qty, min);
  return roundQuantity(qty);
}

/**
 * Unit price at a given quantity, honouring volume tiers.
 *
 * The highest tier whose minQuantity the order reaches wins. A tier states
 * either an absolute unit price or a discount off the base price, never both
 * (enforced by a DB check constraint).
 */
export function resolveTierPrice(
  product: Pick<BillingProduct, "unitAmountCents" | "tiers">,
  quantity: number,
): number {
  const tiers = (product.tiers ?? [])
    .filter((t) => quantity >= t.minQuantity)
    .sort((a, b) => a.minQuantity - b.minQuantity);

  const tier: PriceTier | undefined = tiers.at(-1);
  if (!tier) return product.unitAmountCents;

  if (tier.unitAmountCents != null) return tier.unitAmountCents;
  if (tier.discountBp != null) {
    return Math.round(product.unitAmountCents * (1 - tier.discountBp / 10_000));
  }
  return product.unitAmountCents;
}

/** How a recurring product reads on an invoice line: "per 2 weeks", "per month". */
export function recurrenceLabel(
  interval: RecurringInterval | null,
  count: number,
): string | null {
  if (!interval) return null;
  return count > 1 ? `per ${count} ${interval}s` : `per ${interval}`;
}

/** Default unit label when the studio didn't set one. */
export function defaultUnitLabel(product: Pick<BillingProduct, "pricingModel" | "unitLabel" | "recurringInterval">): string | null {
  if (product.unitLabel) return product.unitLabel;
  switch (product.pricingModel) {
    case "hourly":
      return "hour";
    case "per_session":
      return "session";
    case "pass":
      return "pass";
    case "term":
      return "term";
    case "recurring":
      return product.recurringInterval;
    default:
      return null;
  }
}

export type PriceLineOptions = {
  /** Overrides the catalogue description on the invoice line. */
  description?: string;
  /** Overrides the resolved unit price — an admin discretionary adjustment. */
  unitCentsOverride?: number;
};

/**
 * Price one catalogue product into an invoice line, ready to freeze.
 *
 * The returned accountCode/itemCode/taxTreatment are snapshots: 0082 and 0083
 * established that a product's later ledger reassignment must not rewrite
 * invoices already sent, and the same holds for its price and tax treatment.
 */
export function priceProductLine(
  product: BillingProduct,
  quantity = 1,
  opts: PriceLineOptions = {},
): PricedLine {
  const qty =
    product.pricingModel === "hourly"
      ? applyUnitRules(quantity, product)
      : roundQuantity(Math.max(quantity, 0));

  const unitCents = opts.unitCentsOverride ?? resolveTierPrice(product, qty);
  const unitLabel = defaultUnitLabel(product);

  const suffix =
    product.pricingModel === "recurring"
      ? recurrenceLabel(product.recurringInterval, product.recurringIntervalCount)
      : null;

  return {
    productId: product.id,
    description: opts.description ?? (suffix ? `${product.name} (${suffix})` : product.name),
    quantity: qty,
    unitCents,
    lineTotalCents: Math.round(unitCents * qty),
    unitLabel,
    taxTreatment: product.taxTreatment,
    taxRateBp: product.taxRateBp,
    accountCode: product.accountCode,
    // Xero rejects an itemCode that doesn't exist in its own catalogue, so the
    // studio SKU is NOT used as a silent fallback here — only an explicitly set
    // item code is ever sent.
    itemCode: product.itemCode,
  };
}

/**
 * Expand a package into the lines an invoice should show.
 *
 * The package's own price is what's charged; components are informational, so
 * they're emitted as zero-priced detail lines beneath the package line. Pricing
 * them individually would double-bill.
 */
export function expandPackage(
  pkg: BillingProduct,
  componentProducts: Map<string, BillingProduct>,
  quantity = 1,
): PricedLine[] {
  const head = priceProductLine(pkg, quantity);
  const details = (pkg.components ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map<PricedLine>((component) => {
      const child = componentProducts.get(component.componentProductId);
      const name = child?.name ?? component.componentName ?? "Included";
      return {
        productId: component.componentProductId,
        description: `  · ${name} × ${roundQuantity(component.quantity * quantity)}`,
        quantity: roundQuantity(component.quantity * quantity),
        unitCents: 0,
        lineTotalCents: 0,
        unitLabel: child ? defaultUnitLabel(child) : null,
        taxTreatment: pkg.taxTreatment,
        taxRateBp: pkg.taxRateBp,
        accountCode: pkg.accountCode,
        itemCode: null,
      };
    });

  return [head, ...details];
}

/** Hours between two `HH:MM[:SS]` times, for pricing an hourly booking. */
export function hoursBetween(startTime: string, endTime: string): number {
  const toMinutes = (t: string) => {
    const [h = "0", m = "0"] = t.split(":");
    return Number(h) * 60 + Number(m);
  };
  const minutes = toMinutes(endTime) - toMinutes(startTime);
  return minutes > 0 ? roundQuantity(minutes / 60) : 0;
}
