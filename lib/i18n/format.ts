import { useLocale } from "next-intl";
import { useCallback, useMemo } from "react";

/** Parse "HH:MM" or "HH:MM:SS" into a Date for Intl formatting. */
function timeToDate(time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setHours(h, m ?? 0, 0, 0);
  return d;
}

export function formatTimeShort(time: string | null, locale: string): string {
  if (!time) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
  }).format(timeToDate(time));
}

export function formatDateMedium(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function useFormatTimeShort() {
  const locale = useLocale();
  return useCallback((time: string | null) => formatTimeShort(time, locale), [locale]);
}

export function useFormatDateMedium() {
  const locale = useLocale();
  return useCallback((iso: string) => formatDateMedium(iso, locale), [locale]);
}

// ── Money ───────────────────────────────────────────────────────────────────
//
//  Currency and display locale are separate decisions. The *currency* is the
//  studio's (NZD today — see lib/currency.ts); the *locale* is the reader's,
//  and it governs grouping, decimal separator and symbol placement. Formatting
//  NZD with a hardcoded "en-NZ" gave a Russian or Chinese reader Latin
//  grouping on every price in the app.

import { CURRENCY_CODE } from "@/lib/currency";

export function formatMoney(
  cents: number,
  locale: string,
  opts?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: CURRENCY_CODE,
    ...opts,
  }).format((cents ?? 0) / 100);
}

export function useFormatMoney(opts?: Intl.NumberFormatOptions) {
  const locale = useLocale();
  return useCallback(
    (cents: number, override?: Intl.NumberFormatOptions) =>
      formatMoney(cents, locale, { ...opts, ...override }),
    [locale, opts],
  );
}

// ── Dates ───────────────────────────────────────────────────────────────────

/** Locale-aware date formatting with caller-chosen Intl options. */
export function formatDate(
  value: string | Date,
  locale: string,
  opts: Intl.DateTimeFormatOptions,
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return d.toLocaleDateString(locale, opts);
}

export function useFormatDate(opts: Intl.DateTimeFormatOptions) {
  const locale = useLocale();
  return useCallback(
    (value: string | Date) => formatDate(value, locale, opts),
    [locale, opts],
  );
}

/** Locale-aware date+time, for message timestamps and audit trails. */
export function useFormatDateTime(opts: Intl.DateTimeFormatOptions) {
  const locale = useLocale();
  return useCallback((value: string | Date) => {
    const d = typeof value === "string" ? new Date(value) : value;
    return d.toLocaleString(locale, opts);
  }, [locale, opts]);
}

/**
 * An Intl.NumberFormat bound to the reader's locale.
 *
 * Same shape as `new Intl.NumberFormat(...)`, so a module-level formatter can
 * be moved into component scope without touching its call sites — only the
 * declaration changes.
 */
export function useNumberFormat(opts?: Intl.NumberFormatOptions) {
  const locale = useLocale();
  // Callers pass an object literal, which is a fresh reference every render;
  // key the memo on its contents so the formatter is actually reused.
  const key = JSON.stringify(opts ?? {});
  return useMemo(
    () => new Intl.NumberFormat(locale, JSON.parse(key) as Intl.NumberFormatOptions),
    [locale, key],
  );
}

/** An Intl.DateTimeFormat bound to the reader's locale. Same rationale. */
export function useDateTimeFormat(opts?: Intl.DateTimeFormatOptions) {
  const locale = useLocale();
  const key = JSON.stringify(opts ?? {});
  return useMemo(
    () => new Intl.DateTimeFormat(locale, JSON.parse(key) as Intl.DateTimeFormatOptions),
    [locale, key],
  );
}

/**
 * Locale-aware formatting for a date-only ISO string ("YYYY-MM-DD").
 *
 * Anchors to local noon before formatting. `new Date("2026-01-05")` parses as
 * UTC midnight, which renders as the 4th anywhere west of Greenwich — the bug
 * the hand-rolled `${iso}T12:00:00` helpers in this codebase were working
 * around. Keeping that here means call sites get both the anchor and the
 * reader's locale, instead of picking one.
 */
export function useFormatDateOnly(opts: Intl.DateTimeFormatOptions) {
  const locale = useLocale();
  const key = JSON.stringify(opts);
  return useCallback(
    (iso: string) =>
      new Date(`${iso}T12:00:00`).toLocaleDateString(
        locale,
        JSON.parse(key) as Intl.DateTimeFormatOptions,
      ),
    [locale, key],
  );
}

/**
 * Locale-aware relative time ("5 min ago", "il y a 5 min", "5分前").
 *
 * Replaces hand-rolled `${mins}m ago` strings, which were English word order
 * and English abbreviations baked into the markup — invisible to the message
 * files and untranslatable without rewriting the call site. Intl picks the
 * unit's plural form and the before/after word order per locale.
 *
 * Falls back to an absolute date past the week mark, which is what the
 * hand-rolled versions did and reads better than "47 days ago".
 */
export function useTimeAgo(absoluteOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }) {
  const locale = useLocale();
  const absKey = JSON.stringify(absoluteOpts);
  return useCallback(
    (iso: string) => {
      const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
      const diffMs = Date.now() - new Date(iso).getTime();
      const mins = Math.floor(diffMs / 60_000);
      if (mins < 1) return rtf.format(0, "minute");
      if (mins < 60) return rtf.format(-mins, "minute");
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) return rtf.format(-hrs, "hour");
      const days = Math.floor(hrs / 24);
      if (days < 7) return rtf.format(-days, "day");
      return new Date(iso).toLocaleDateString(
        locale,
        JSON.parse(absKey) as Intl.DateTimeFormatOptions,
      );
    },
    [locale, absKey],
  );
}
