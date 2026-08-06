// ============================================================================
//  What a dancer is charged for the classes they're enrolling in.
//
//  One function, three models, both sides of the wire. Until now the "second
//  night of a linked series is free" rule was written three times — in
//  lib/enrollment-billing.ts against the database, again in Step1SelectClass's
//  running total, and a third time in EnrollModal's quote loop — which is three
//  places for the parent's preview and the invoice to drift apart. This is the
//  one place, and it's pure, so the browser and the server run the same code.
//
//  The server stays authoritative regardless: the client passes what the family
//  picked, the server re-reads prices, enrolments and prior invoices from the
//  database before quoting. The client's copy is a preview, never a price.
//
//  Deliberately no Supabase and no server-only import. Everything this needs
//  about the studio — the model, the ladder, the combos, the sibling
//  percentage, what's already been invoiced — is resolved by the caller and
//  passed in.
// ============================================================================

import {
  ladderBandFor,
  ladderTotalCents,
  formatHours,
  type HoursLadder,
} from "./hours-ladder";
import { matchCombos, type BasketItem, type ComboDefinition } from "./combo-match";

export const TUITION_PRICING_MODELS = ["per_class", "hours", "per_class_combos"] as const;
export type TuitionPricingModel = (typeof TUITION_PRICING_MODELS)[number];

/** A class, as pricing sees it. */
export type QuoteClass = {
  classId: string;
  name: string;
  productId: string | null;
  priceCents: number;
  /** Weekly hours, from the class's start and end time. 0 when it has no end. */
  hours: number;
  recurringGroupId: string | null;
};

export type TuitionQuoteLine = {
  kind: "class" | "combo" | "combo_detail" | "hours";
  classId: string | null;
  productId: string | null;
  description: string;
  chargeCents: number;
  /** Why this line is free, when it is — drives the "Included" copy. */
  includedReason: "programme" | "combo" | null;
};

export type TuitionQuote = {
  model: TuitionPricingModel;
  lines: TuitionQuoteLine[];
  /** Before the sibling discount and before any prior credit. */
  grossCents: number;
  siblingDiscountCents: number;
  /** Tuition already invoiced this period. Hours model only. */
  priorCreditCents: number;
  totalCents: number;
  hours?: { before: number; after: number; bandLabel: string | null };
};

export type TuitionQuoteInput = {
  model: TuitionPricingModel;
  /** Classes being enrolled in right now. */
  adding: QuoteClass[];
  /** Already actively enrolled, with this batch excluded. See below. */
  existing: QuoteClass[];
  ladder?: HoursLadder | null;
  /** Name for the single hours line — the studio's ladder product. */
  ladderProductId?: string | null;
  ladderProductName?: string;
  combos?: ComboDefinition[];
  /** Tuition already invoiced for this dancer this period. Hours model only. */
  priorInvoicedCents?: number;
  /** Resolved by the caller via siblingDiscountInfo. 0 for self-managed adults. */
  siblingDiscountPct?: number;
};

/**
 * Spread one discount across the charged lines so they still sum to the total.
 *
 * Invoice lines have to reconcile against invoices.amount_cents, so the
 * discount can't just be subtracted from the total and left implicit. Largest
 * remainder, so the cents land somewhere rather than evaporating.
 */
function applyDiscountAcrossLines(
  lines: TuitionQuoteLine[],
  discountCents: number,
): TuitionQuoteLine[] {
  if (discountCents <= 0) return lines;

  const chargeable = lines.filter((l) => l.chargeCents > 0);
  const gross = chargeable.reduce((sum, l) => sum + l.chargeCents, 0);
  if (gross <= 0) return lines;

  const shares = chargeable.map((line) => {
    const exact = (line.chargeCents * discountCents) / gross;
    return { line, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let leftover = discountCents - shares.reduce((sum, s) => sum + s.floor, 0);
  const byRemainder = [...shares].sort((a, b) => b.remainder - a.remainder);
  const extra = new Map<TuitionQuoteLine, number>();

  for (const share of byRemainder) {
    if (leftover <= 0) break;
    extra.set(share.line, 1);
    leftover -= 1;
  }

  const deduction = new Map(
    shares.map((s) => [s.line, s.floor + (extra.get(s.line) ?? 0)] as const),
  );

  return lines.map((line) =>
    deduction.has(line)
      ? { ...line, chargeCents: Math.max(line.chargeCents - deduction.get(line)!, 0) }
      : line,
  );
}

/**
 * Per-class lines with the linked-recurring-series rule applied.
 *
 * A programme that runs Mon/Wed/Fri as three class rows sharing one
 * recurring_group_id is paid for once. `existing` is walked first so a group
 * the dancer is already in doesn't bill again; within `adding`, the first class
 * of each group bills and the rest are included.
 */
function perClassLines(adding: QuoteClass[], existing: QuoteClass[]): TuitionQuoteLine[] {
  const paidGroups = new Set<string>();

  for (const cls of existing) {
    if (cls.recurringGroupId) paidGroups.add(cls.recurringGroupId);
  }

  return adding.map((cls) => {
    const base: TuitionQuoteLine = {
      kind: "class",
      classId: cls.classId,
      productId: cls.productId,
      description: cls.name,
      chargeCents: cls.priceCents,
      includedReason: null,
    };

    if (cls.priceCents <= 0) return { ...base, chargeCents: 0 };
    if (!cls.recurringGroupId) return base;

    if (paidGroups.has(cls.recurringGroupId)) {
      return { ...base, chargeCents: 0, includedReason: "programme" };
    }

    paidGroups.add(cls.recurringGroupId);
    return base;
  });
}

/**
 * Combo lines: the combo at its price, then each class it covers as a
 * zero-priced detail line. Same shape expandPackage produces for invoices, so
 * the review screen and the invoice read identically.
 */
function comboLines(
  adding: QuoteClass[],
  existing: QuoteClass[],
  combos: ComboDefinition[],
): TuitionQuoteLine[] {
  // Combos price what's being bought now. Retroactively re-pricing a term the
  // family has already been invoiced for is a credit note, not a quote.
  const basket: BasketItem[] = adding.map((cls) => ({
    classId: cls.classId,
    productId: cls.productId,
    name: cls.name,
    priceCents: cls.priceCents,
  }));

  const { fires, leftovers } = matchCombos(basket, combos);
  const lines: TuitionQuoteLine[] = [];

  for (const fire of fires) {
    lines.push({
      kind: "combo",
      classId: null,
      productId: fire.combo.productId,
      description: fire.combo.name,
      chargeCents: fire.combo.priceCents,
      includedReason: null,
    });

    for (const item of fire.consumed) {
      lines.push({
        kind: "combo_detail",
        classId: item.classId,
        productId: item.productId,
        description: `  · ${item.name}`,
        chargeCents: 0,
        includedReason: "combo",
      });
    }
  }

  // Anything no combo covered is priced per class, programme rule and all.
  const leftoverIds = new Set(leftovers.map((l) => l.classId));
  lines.push(
    ...perClassLines(
      adding.filter((cls) => leftoverIds.has(cls.classId)),
      existing,
    ),
  );

  return lines;
}

function sumHours(classes: QuoteClass[]): number {
  return classes.reduce((sum, cls) => sum + (Number.isFinite(cls.hours) ? cls.hours : 0), 0);
}

/**
 * Quote a dancer's enrolment under whichever model the studio charges on.
 *
 * `existing` must EXCLUDE every class in `adding`. The enrol flow inserts all
 * the enrollment rows before billing runs, so a naive "what are they already
 * in" read includes the classes being paid for — which zeroes the charge in
 * per-class mode and makes the hours top-up $0. This is the same trap
 * batchEnrollmentBillableCents documents; the caller has to do the excluding
 * because only it knows the batch.
 */
export function quoteTuition(input: TuitionQuoteInput): TuitionQuote {
  const { model, adding, existing } = input;
  const siblingPct = Math.min(Math.max(input.siblingDiscountPct ?? 0, 0), 100);

  let lines: TuitionQuoteLine[] = [];
  let hours: TuitionQuote["hours"];
  let priorCreditCents = 0;

  if (model === "hours") {
    const ladder = input.ladder ?? null;
    const before = sumHours(existing);
    const after = before + sumHours(adding);
    const { band } = ladder
      ? ladderBandFor(ladder, after)
      : { band: null as { minHours: number } | null };

    const total = ladder ? ladderTotalCents(ladder, after) : 0;
    hours = {
      before,
      after,
      bandLabel: band ? formatHours(after) : null,
    };

    lines = [
      {
        kind: "hours",
        classId: null,
        productId: input.ladderProductId ?? null,
        description: input.ladderProductName
          ? `${input.ladderProductName} — ${formatHours(after)} a week`
          : `Tuition — ${formatHours(after)} a week`,
        chargeCents: total,
        includedReason: null,
      },
    ];

    priorCreditCents = Math.max(input.priorInvoicedCents ?? 0, 0);
  } else if (model === "per_class_combos") {
    lines = comboLines(adding, existing, input.combos ?? []);
  } else {
    lines = perClassLines(adding, existing);
  }

  const grossCents = lines.reduce((sum, line) => sum + line.chargeCents, 0);

  // The discount applies once to the whole quote, not per class — a family
  // taking three classes gets one sibling discount, not three.
  const siblingDiscountCents =
    siblingPct > 0 ? grossCents - Math.round((grossCents * (100 - siblingPct)) / 100) : 0;

  lines = applyDiscountAcrossLines(lines, siblingDiscountCents);

  // In hours mode the ladder priced the dancer's WHOLE week, so whatever the
  // period has already been invoiced comes off. That's what turns "you're now
  // on 3 hours, $230" into "$60 to pay", and it's what makes a retried submit
  // charge nothing the second time.
  const afterDiscount = grossCents - siblingDiscountCents;
  const totalCents = Math.max(afterDiscount - priorCreditCents, 0);

  if (priorCreditCents > 0) {
    lines = applyDiscountAcrossLines(lines, Math.min(priorCreditCents, afterDiscount));
  }

  return {
    model,
    lines,
    grossCents,
    siblingDiscountCents,
    priorCreditCents: Math.min(priorCreditCents, afterDiscount),
    totalCents,
    hours,
  };
}
