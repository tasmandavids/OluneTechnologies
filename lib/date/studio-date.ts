// ============================================================================
//  lib/date/studio-date.ts
//
//  New Zealand is UTC+12/+13 — always ahead of UTC. Computing a business date
//  ("today", a due date, a booking cut-off) on the server via
//  `new Date().toISOString().slice(0, 10)` renders in UTC, which lags the
//  real NZ calendar date for roughly the first 12–13 hours of every NZ day.
//  That silently shifts "today" back a day for a large chunk of the day —
//  see commit f4682b3 (lib/staff/week.ts) for the first instance of this bug.
//
//  Always compute studio-facing calendar dates through this module instead of
//  toISOString() directly. Pass a studio's `timezone` column when it's
//  already in scope; every current studio is NZ-based, so the default covers
//  them all.
// ============================================================================

const DEFAULT_STUDIO_TIMEZONE = "Pacific/Auckland";

/** A `Date` instant formatted as "YYYY-MM-DD" in the given IANA timezone. */
export function studioLocalYmd(timezone?: string | null, base: Date = new Date()): string {
  const tz = timezone || DEFAULT_STUDIO_TIMEZONE;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(base);
    const m: Record<string, string> = {};
    for (const p of parts) m[p.type] = p.value;
    return `${m.year}-${m.month}-${m.day}`;
  } catch {
    return base.toISOString().slice(0, 10);
  }
}

/**
 * `studioLocalYmd()` offset by `days` (negative to go back). Anchors at noon
 * UTC on the local date so the UTC-day arithmetic never itself rolls over
 * into the previous/next local day.
 */
export function studioLocalYmdOffset(
  days: number,
  timezone?: string | null,
  base: Date = new Date(),
): string {
  const ymd = studioLocalYmd(timezone, base);
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
