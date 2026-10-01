// ============================================================================
//  Money formatting for the ledger.
//
//  lib/currency.ts is pinned to NZD because that's what Olune charges in. The
//  ledger reports in the studio's base currency, so it formats here instead.
//  Amounts are always integer minor units (cents) — for zero-decimal currencies
//  like JPY and KRW the ledger still stores hundredths, and display rounds.
// ============================================================================

const cache = new Map<string, Intl.NumberFormat>();

function formatter(currency: string, locale: string, whole: boolean): Intl.NumberFormat {
  const key = `${currency}|${locale}|${whole}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      ...(whole ? { maximumFractionDigits: 0, minimumFractionDigits: 0 } : {}),
    });
    cache.set(key, f);
  }
  return f;
}

export function formatLedgerMoney(
  cents: number,
  currency: string,
  locale = "en-NZ",
  opts: { whole?: boolean } = {},
): string {
  return formatter(currency, locale, !!opts.whole).format((cents ?? 0) / 100);
}

/** Parse a user-typed amount ("1,234.50", "1234,50", "$12") into cents. Null if unreadable. */
export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/[^\d.,\-]/g, "");
  if (!cleaned || cleaned === "-") return null;
  const negative = cleaned.startsWith("-");
  const body = cleaned.replace(/-/g, "");
  const lastSep = Math.max(body.lastIndexOf("."), body.lastIndexOf(","));
  let normalised: string;
  if (lastSep === -1) {
    normalised = body;
  } else {
    const decimals = body.length - lastSep - 1;
    // "1,234" and "1.234" with three trailing digits are thousands separators.
    const whole = body.slice(0, lastSep);
    const other = body[lastSep] === "." ? "," : ".";
    if (decimals === 3 && !body.includes(other) && whole !== "0" && whole !== "") {
      normalised = body.replace(/[.,]/g, "");
    } else {
      normalised = body.slice(0, lastSep).replace(/[.,]/g, "") + "." + body.slice(lastSep + 1);
    }
  }
  const n = Number(normalised);
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

/** Plain decimal for CSV: no symbol, no grouping, dot decimal. */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
