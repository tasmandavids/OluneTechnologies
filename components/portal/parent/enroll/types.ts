// Shared types + formatter for the enrol flow steps. Pure file split from
// EnrollModal.tsx (1.6.1).

import type { TuitionQuote } from "@/lib/billing/tuition-quote";

export const NZD = new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" });

export type SelectedClass = {
  classId: string;
  className: string;
  priceCents: number;
  recurringGroupId: string | null;
};

export type EnrollData = {
  childId: string;
  childName: string | null;
  classes: SelectedClass[];
  /**
   * The server's authoritative quote, fetched once on the way into review.
   * Absent until then — Step 3 falls back to the raw class prices, which is
   * only ever a display state, never what gets charged.
   */
  quote?: TuitionQuote;
  waitlisted: boolean;
  payLater?: boolean;
  paidOnline?: boolean;
  payMonthly?: boolean;
  installmentCents?: number;
};
