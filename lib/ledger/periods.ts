// ============================================================================
//  Financial years and tax periods.
//
//  Everything is ISO yyyy-mm-dd strings compared lexically. No Date objects
//  leak out, so a studio in Auckland and a server in Sydney (or a test runner
//  in UTC) always agree on which period 31 March falls in.
// ============================================================================

import { iso, parseIso } from "./jurisdictions/helpers";
import { FREQUENCY_MONTHS, type FilingFrequency } from "./types";

export type Period = { start: string; end: string };

export function todayIso(timeZone?: string): string {
  // en-CA formats as yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseIso(date);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

export function dayBefore(date: string): string {
  return addDays(date, -1);
}

/** The financial year containing `date`. */
export function fiscalYear(date: string, startMonth: number, startDay = 1): Period {
  const { y } = parseIso(date);
  let start = iso(y, startMonth, startDay);
  if (date < start) start = iso(y - 1, startMonth, startDay);
  const { y: sy } = parseIso(start);
  const nextStart = iso(sy + 1, startMonth, startDay);
  return { start, end: dayBefore(nextStart) };
}

/** Start of the month-aligned period of `frequency` containing `date`. */
export function taxPeriodContaining(date: string, frequency: FilingFrequency, anchorMonth: number): Period {
  const months = FREQUENCY_MONTHS[frequency];
  const { y, m } = parseIso(date);
  // Months since the anchor in an unbounded month index, so periods crossing
  // a calendar year (NZ Dec–Jan, AU Jul–Jun) come out right.
  const index = y * 12 + (m - 1);
  const anchor = anchorMonth - 1;
  const offset = (((index - anchor) % months) + months) % months;
  const startIndex = index - offset;
  const sy = Math.floor(startIndex / 12);
  const sm = (startIndex % 12) + 1;
  const start = iso(sy, sm, 1);
  const end = dayBefore(iso(sy, sm + months, 1));
  return { start, end };
}

/** Consecutive tax periods from the one containing `from` through the one containing `to`. */
export function taxPeriodsBetween(from: string, to: string, frequency: FilingFrequency, anchorMonth: number): Period[] {
  const out: Period[] = [];
  let p = taxPeriodContaining(from, frequency, anchorMonth);
  while (p.start <= to && out.length < 240) {
    out.push(p);
    p = taxPeriodContaining(addDays(p.end, 1), frequency, anchorMonth);
  }
  return out;
}

/** Calendar month containing `date`. */
export function monthOf(date: string): Period {
  const { y, m } = parseIso(date);
  return { start: iso(y, m, 1), end: dayBefore(iso(y, m + 1, 1)) };
}

/** The same-length period immediately before `p` (for P&L comparisons). */
export function previousPeriod(p: Period): Period {
  const a = parseIso(p.start);
  const b = parseIso(addDays(p.end, 1));
  const months = (b.y - a.y) * 12 + (b.m - a.m);
  if (a.d === 1 && b.d === 1 && months > 0) {
    return { start: iso(a.y, a.m - months, 1), end: dayBefore(p.start) };
  }
  const days = Math.round((Date.parse(p.end) - Date.parse(p.start)) / 86_400_000) + 1;
  return { start: addDays(p.start, -days), end: dayBefore(p.start) };
}

/** The first day that can still take postings. */
export function firstOpenDate(lockDate: string | null, wanted: string): string {
  if (!lockDate || wanted > lockDate) return wanted;
  return addDays(lockDate, 1);
}

/** Calendar months overlapping [from, to], each clipped to the range. At most `max`, newest kept. */
export function monthsBetween(from: string, to: string, max = 24): Period[] {
  const out: Period[] = [];
  let m = monthOf(from);
  while (m.start <= to) {
    out.push({ start: m.start < from ? from : m.start, end: m.end > to ? to : m.end });
    m = monthOf(addDays(m.end, 1));
  }
  return out.slice(-max);
}
