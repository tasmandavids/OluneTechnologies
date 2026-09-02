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
