// ============================================================================
//  lib/timeclock/hours.ts
//
//  The arithmetic behind the time clock. Pure — no Supabase, no request
//  context — so every rule below is unit-testable without a database, and so
//  the same functions serve the teacher's own timesheet, the manager's approval
//  queue and the payroll export without three implementations drifting apart.
//
//  ── What this deliberately does NOT do
//  It does not apply an overtime multiplier. `hour_type = 'overtime'` records
//  that hours WERE overtime; it does not decide they are worth 1.5×. Loading
//  rates vary by jurisdiction, by employment agreement and by day of week, and
//  a wrong multiplier here would produce a confident, wrong wage. Jackrabbit
//  ships the same restriction and labels its figure "estimated" for the same
//  reason. Anything Olune calls "estimated pay" is hours × rate and nothing
//  more — see estimatedGrossCents.
// ============================================================================

/** Hour types that accrue paid time. `unpaid` is recorded but never costed. */
const PAID_HOUR_TYPES = new Set(["regular", "overtime", "holiday", "sick", "vacation"]);

export type HourType = "regular" | "overtime" | "holiday" | "sick" | "vacation" | "unpaid";

export type TimeEntry = {
  entryDate: string; // YYYY-MM-DD, studio-local
  clockInAt: string; // ISO instant
  clockOutAt: string | null; // null = still on the clock
  hourType: HourType;
};

export type PayRate = {
  effectiveFrom: string; // YYYY-MM-DD
  rateCents: number;
};

/**
 * Worked minutes for one entry, or `null` while the shift is still open.
 *
 * `null` rather than 0 is load-bearing: an open shift has an *unknown*
 * duration, not a zero one, and a caller summing hours must be forced to decide
 * what to do about it rather than silently under-reporting the week.
 */
export function entryMinutes(entry: Pick<TimeEntry, "clockInAt" | "clockOutAt">): number | null {
  if (!entry.clockOutAt) return null;
  const start = Date.parse(entry.clockInAt);
  const end = Date.parse(entry.clockOutAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  const minutes = (end - start) / 60_000;
  // The DB constraint staff_time_entries_out_after_in makes this unreachable
  // via the app, but the export path also reads historical rows.
  return minutes > 0 ? minutes : null;
}

/** Total closed minutes across entries. Open shifts contribute nothing. */
export function totalMinutes(entries: Pick<TimeEntry, "clockInAt" | "clockOutAt">[]): number {
  return entries.reduce((sum, e) => sum + (entryMinutes(e) ?? 0), 0);
}

/** Count of entries still open, so a UI can say "2 still clocked in". */
export function openEntryCount(entries: Pick<TimeEntry, "clockOutAt">[]): number {
  return entries.filter((e) => !e.clockOutAt).length;
}

/**
 * Minutes between two `HH:MM[:SS]` wall-clock times from `staff_shifts`.
 *
 * Wall-clock, not instants: a shift row carries a date plus two local times, so
 * subtracting them is plain arithmetic in the studio's own day. The DB's
 * staff_shifts_time_order check already rejects end <= start, so no overnight
 * wrap is representable and none is handled here.
 */
export function shiftMinutes(startTime: string, endTime: string): number | null {
  const start = parseClockTime(startTime);
  const end = parseClockTime(endTime);
  if (start === null || end === null || end <= start) return null;
  return end - start;
}

function parseClockTime(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Actual minus scheduled, in minutes. Positive = worked over.
 *
 * This is the number Jackrabbit's staff portal is built around and the reason
 * `staff_shifts` (0046) turns out to have been worth having: the comparison is
 * free because both sides already exist.
 */
export function varianceMinutes(actualMinutes: number, scheduledMinutes: number): number {
  return actualMinutes - scheduledMinutes;
}

/**
 * The rate in force on `onDate` — the latest rate whose `effectiveFrom` is on
 * or before it.
 *
 * Returns `null` when the staff member had no rate yet on that date, which the
 * caller must surface rather than treating as zero: "we don't know what they
 * were on" and "they were on nothing" are different answers, and only one of
 * them should ever reach a payroll export.
 */
export function resolveRateCents(rates: PayRate[], onDate: string): number | null {
  let best: PayRate | null = null;
  for (const rate of rates) {
    if (rate.effectiveFrom > onDate) continue;
    if (!best || rate.effectiveFrom > best.effectiveFrom) best = rate;
  }
  return best ? best.rateCents : null;
}

export type GrossEstimate = {
  /** Hours × rate, in cents. Excludes unpaid hour types. No overtime loading. */
  grossCents: number;
  /** Paid minutes that were costed. */
  paidMinutes: number;
  /**
   * Entries skipped because no rate was in force on their date. Non-empty means
   * the figure is incomplete and the UI must say so rather than showing a total
   * that quietly omits someone's week.
   */
  unratedEntryDates: string[];
};

/**
 * Estimated gross pay for a set of entries. See the module header for what
 * "estimated" is doing in that name.
 */
export function estimatedGrossCents(entries: TimeEntry[], rates: PayRate[]): GrossEstimate {
  let grossCents = 0;
  let paidMinutes = 0;
  const unratedEntryDates: string[] = [];

  for (const entry of entries) {
    if (!PAID_HOUR_TYPES.has(entry.hourType)) continue;
    const minutes = entryMinutes(entry);
    if (minutes === null) continue; // open shift — nothing to cost yet

    const rateCents = resolveRateCents(rates, entry.entryDate);
    if (rateCents === null) {
      unratedEntryDates.push(entry.entryDate);
      continue;
    }

    paidMinutes += minutes;
    grossCents += (minutes / 60) * rateCents;
  }

  return {
    // Round once at the end. Rounding each entry would drift by up to a cent
    // per shift, which across a fortnight of a large studio is visible.
    grossCents: Math.round(grossCents),
    paidMinutes,
    unratedEntryDates,
  };
}

/** "7h 30m" / "45m" / "0m" — for display only, never for export. */
export function formatMinutes(minutes: number): string {
  const rounded = Math.round(minutes);
  const sign = rounded < 0 ? "-" : "";
  const abs = Math.abs(rounded);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0) return `${sign}${m}m`;
  if (m === 0) return `${sign}${h}h`;
  return `${sign}${h}h ${m}m`;
}

/** Decimal hours to 2dp — the unit every payroll system actually ingests. */
export function minutesToDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}
