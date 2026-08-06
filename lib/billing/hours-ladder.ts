// ============================================================================
//  The hours rate card — Studio Pro style tuition.
//
//  A studio types a table and that table is the whole pricing model:
//
//      1.0 hr/wk   $95        3.0   $230
//      1.5         $135       4.0   $270
//      2.0         $170       5.0   $290   + $25 per extra hour
//
//  No percentages, no per-hour arithmetic, nothing derived. "Two hours a week
//  is $170" is a sentence the studio can read back to a parent on the phone,
//  which is the entire reason this model exists alongside per-class pricing.
//
//  Pure by design: no Supabase, no server-only imports. The admin rate-card
//  editor previews with the same functions the enrolment path bills with, so
//  the number a studio sees while typing is the number a family is charged.
//
//  Every amount is integer cents. Hours are the fractional side — a 45-minute
//  class is 0.75, and the bands are numeric(5,2) to match.
// ============================================================================

/** One row of the rate card: from this many hours, the total is this. */
export type HourBand = {
  minHours: number;
  totalCents: number;
};

export type HoursLadder = {
  /** Ascending by minHours. Use normaliseLadder rather than assuming. */
  bands: HourBand[];
  /**
   * What each hour past the last band costs. Null means the last band is a cap:
   * "5 hours or more is $290, however many they actually do".
   */
  overflowRateCents: number | null;
};

/** Hours round to 2dp — the DB column is numeric(5,2). */
const HOURS_DP = 100;

function roundHours(value: number): number {
  return Math.round(value * HOURS_DP) / HOURS_DP;
}

/**
 * Sort the bands and drop the unusable ones.
 *
 * Rows arrive from the DB already ordered, but also from a half-typed editor
 * form, so this is the gate everything else in the file assumes has run.
 */
export function normaliseLadder(
  bands: HourBand[],
  overflowRateCents: number | null,
): HoursLadder {
  return {
    bands: bands
      .filter((b) => Number.isFinite(b.minHours) && b.minHours > 0 && b.totalCents >= 0)
      .map((b) => ({ minHours: roundHours(b.minHours), totalCents: Math.round(b.totalCents) }))
      .sort((a, b) => a.minHours - b.minHours),
    overflowRateCents:
      overflowRateCents != null && overflowRateCents >= 0 ? Math.round(overflowRateCents) : null,
  };
}

/**
 * Which row applies to a dancer doing `hours` a week, and how far past it they
 * are. Drives both the pricing below and the "3.0 hrs a week" copy in the UI.
 */
export function ladderBandFor(
  ladder: HoursLadder,
  hours: number,
): { band: HourBand | null; index: number; extraHours: number } {
  if (!ladder.bands.length || !Number.isFinite(hours) || hours <= 0) {
    return { band: null, index: -1, extraHours: 0 };
  }

  // Below the smallest row, charge the smallest row. A 45-minute dancer on a
  // ladder that starts at an hour pays the hour — the same statement
  // applyUnitRules' minUnits makes about private lessons: the smallest row is
  // the smallest thing the studio is willing to sell, not a target to round to.
  let index = 0;

  for (let i = 0; i < ladder.bands.length; i += 1) {
    if (hours >= ladder.bands[i].minHours) index = i;
  }

  const band = ladder.bands[index];
  const isLast = index === ladder.bands.length - 1;
  const extraHours = isLast ? Math.max(roundHours(hours - band.minHours), 0) : 0;

  return { band, index, extraHours };
}

/**
 * What a dancer doing `hours` a week pays for the studio's billing period.
 *
 * The highest band whose minHours the dancer reaches wins — deliberately the
 * same sentence as resolveTierPrice, so there's one rule in this codebase and
 * not two. Past the last band, the overflow rate applies per extra hour, or the
 * band caps if there isn't one.
 */
export function ladderTotalCents(ladder: HoursLadder, hours: number): number {
  const { band, extraHours } = ladderBandFor(ladder, hours);
  if (!band) return 0;

  if (extraHours > 0 && ladder.overflowRateCents != null) {
    return band.totalCents + Math.round(ladder.overflowRateCents * extraHours);
  }

  return band.totalCents;
}

/**
 * What adding hours costs a dancer who already has some — the mid-term add.
 *
 * A dancer at 2.0 hrs ($170) picking up another hour moves to the 3.0 band
 * ($230) and owes the $60 difference, not $230 again. Never negative: dropping
 * hours doesn't generate an automatic credit, which is a deliberate limit —
 * a refund is a decision a studio makes, not one enrolment makes for it.
 */
export function ladderTopUpCents(
  ladder: HoursLadder,
  priorHours: number,
  addedHours: number,
): number {
  const before = ladderTotalCents(ladder, Math.max(priorHours, 0));
  const after = ladderTotalCents(ladder, Math.max(priorHours, 0) + Math.max(addedHours, 0));
  return Math.max(after - before, 0);
}

/** "3 hrs" / "2.5 hrs" / "1 hr" — hours as a studio would write them. */
export function formatHours(hours: number): string {
  const rounded = roundHours(hours);
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
  return `${text} ${rounded === 1 ? "hr" : "hrs"}`;
}
