/**
 * Format a Date's *local* calendar date as "YYYY-MM-DD". Deliberately avoids
 * toISOString(), which renders in UTC — for any timezone ahead of UTC (e.g.
 * New Zealand, UTC+12/+13), converting local midnight to UTC rolls back to
 * the previous calendar day, silently shifting every date by one.
 */
function toLocalIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getWeekRange(base = new Date()) {
  const d = new Date(base);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);

  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(d);
    cur.setDate(d.getDate() + i);
    weekDates.push(toLocalIsoDate(cur));
  }

  return {
    weekStart: weekDates[0]!,
    weekEnd: weekDates[6]!,
    weekDates,
  };
}

export function addWeeks(isoDate: string, weeks: number): string {
  const d = new Date(isoDate + "T12:00:00");
  d.setDate(d.getDate() + weeks * 7);
  return toLocalIsoDate(d);
}

import { formatTimeShort as formatTimeShortI18n } from "@/lib/i18n/format";

/** @deprecated Prefer formatTimeShort from @/lib/i18n/format with an explicit locale. */
export function formatTimeShort(time: string, locale = "en"): string {
  return formatTimeShortI18n(time, locale);
}
