export type BillingInterval = "week" | "fortnight" | "month";

export type SubscriptionLineInput = {
  itemType: "class" | "product" | "discount" | "adjustment";
  referenceId?: string;
  description: string;
  quantity: number;
  unitMonthlyCents: number;
};

export function lineTotalCents(line: Pick<SubscriptionLineInput, "quantity" | "unitMonthlyCents">): number {
  return line.quantity * line.unitMonthlyCents;
}

export function monthlyAmountCents(lines: SubscriptionLineInput[]): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line), 0);
}

export function discountCents(lines: SubscriptionLineInput[]): number {
  return lines
    .filter((l) => l.itemType === "discount" || l.unitMonthlyCents < 0)
    .reduce((sum, line) => sum + Math.abs(lineTotalCents(line)), 0);
}

/** Convert a monthly plan total into the per-charge amount for Stripe. */
export function chargeAmountCents(monthlyCents: number, interval: BillingInterval): number {
  if (monthlyCents <= 0) return 0;
  if (interval === "month") return monthlyCents;
  if (interval === "fortnight") return Math.round((monthlyCents * 12) / 26);
  return Math.round((monthlyCents * 12) / 52);
}

/** Average Gregorian month length in days (365.2425 / 12), for prorating a
 * monthly rate across a term of arbitrary length. */
const AVG_DAYS_PER_MONTH = 30.4369;

/**
 * Scale factor to turn a monthly rate into the amount owed for a term that
 * runs from startDate to endDate (both "YYYY-MM-DD"). A term doesn't line up
 * with calendar months, so this prorates by day count rather than assuming a
 * fixed number of months — a 10-week term and a 14-week term charge
 * proportionally different totals off the same monthly price.
 */
export function termLengthMonths(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.max(0, (end.getTime() - start.getTime()) / 86_400_000);
  return days / AVG_DAYS_PER_MONTH;
}

export function intervalLabel(interval: BillingInterval): string {
  if (interval === "week") return "weekly";
  if (interval === "fortnight") return "fortnightly";
  return "monthly";
}

export function stripeRecurring(interval: BillingInterval): { interval: "week" | "month"; interval_count?: number } {
  if (interval === "fortnight") return { interval: "week", interval_count: 2 };
  if (interval === "week") return { interval: "week", interval_count: 1 };
  return { interval: "month", interval_count: 1 };
}
