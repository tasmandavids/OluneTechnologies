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

/** Offset (ms) of `timezone` from UTC at the given instant. */
function tzOffsetMs(timezone: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const m: Record<string, number> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = Number(p.value);
  const asUtc = Date.UTC(m.year, m.month - 1, m.day, m.hour, m.minute, m.second);
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * Turn a studio-local wall-clock time ("2026-11-20T19:00" or with seconds)
 * into the UTC instant it denotes, as an ISO string. An offset-less literal
 * sent to Postgres is read in the session timezone (UTC on Supabase), which
 * shifts a NZ evening recital to the next morning. Strings that already carry
 * an offset or "Z" are passed through as instants. Returns null if unparsable.
 */
export function studioLocalToUtcIso(local: string, timezone?: string | null): string | null {
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(local)) {
    const d = new Date(local);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(local.trim());
  if (!m) return null;
  const [y, mo, d, h = "0", mi = "0", s = "0"] = m.slice(1);
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  const tz = timezone || DEFAULT_STUDIO_TIMEZONE;
  try {
    // Two passes so the offset is taken at the resolved instant (DST edges).
    let utc = wall - tzOffsetMs(tz, new Date(wall));
    utc = wall - tzOffsetMs(tz, new Date(utc));
    return new Date(utc).toISOString();
  } catch {
    return null;
  }
}
