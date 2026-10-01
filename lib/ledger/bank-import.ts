// ============================================================================
//  Bank statement CSV import.
//
//  Every bank exports a different CSV. Rather than a parser per bank, this
//  detects the delimiter, finds the date / description / amount (or separate
//  debit & credit) columns by header name in several languages, and works out
//  the date order from the data itself. The studio confirms the mapping on
//  screen before anything is saved, so a wrong guess is visible, not silent.
//
//  Each row gets a dedupe hash (date, amount, text, and its occurrence number
//  among identical rows) so re-importing an overlapping statement is safe —
//  the unique index on (account, external_hash) drops the repeats.
// ============================================================================

import { fingerprint } from "./posting";
import { parseMoneyInput } from "./money";

export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = [",", ";", "\t", "|"]
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== "")) rows.push(row);
  return rows.map((r) => r.map((f) => f.trim()));
}

export type ColumnMapping = {
  date: number;
  description: number;
  reference: number | null;
  /** Either one signed amount column… */
  amount: number | null;
  /** …or separate money-out / money-in columns. */
  debit: number | null;
  credit: number | null;
};

const HEADER_HINTS = {
  date: ["date", "transaction date", "posted", "posting date", "value date", "datum", "buchungstag", "fecha", "data", "日付", "取引日", "거래일", "일자"],
  description: ["description", "details", "narrative", "payee", "memo", "particulars", "transaction", "name", "verwendungszweck", "omschrijving", "concepto", "libellé", "libelle", "descrizione", "摘要", "内容", "적요", "내용"],
  reference: ["reference", "ref", "code", "cheque", "check", "analysis", "referenz", "referencia", "riferimento", "référence"],
  amount: ["amount", "value", "betrag", "bedrag", "importe", "importo", "montant", "金額", "금액"],
  debit: ["debit", "withdrawal", "withdrawals", "money out", "paid out", "out", "soll", "af", "cargo", "dare", "出金", "출금"],
  credit: ["credit", "deposit", "deposits", "money in", "paid in", "in", "haben", "bij", "abono", "avere", "入金", "입금"],
};

/** Best-guess column mapping from a header row. */
export function guessMapping(header: string[]): ColumnMapping | null {
  const norm = header.map((h) => h.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").trim());
  const find = (hints: string[], exclude: number[] = []) => {
    for (const hint of hints) {
      const exact = norm.findIndex((h, i) => h === hint && !exclude.includes(i));
      if (exact >= 0) return exact;
    }
    for (const hint of hints) {
      if (hint.length < 3) continue;
      const partial = norm.findIndex((h, i) => h.includes(hint) && !exclude.includes(i));
      if (partial >= 0) return partial;
    }
    return -1;
  };
  const date = find(HEADER_HINTS.date);
  if (date < 0) return null;
  const amount = find(HEADER_HINTS.amount, [date]);
  const debit = find(HEADER_HINTS.debit, [date, amount]);
  const credit = find(HEADER_HINTS.credit, [date, amount, debit]);
  const description = find(HEADER_HINTS.description, [date, amount, debit, credit]);
  const reference = find(HEADER_HINTS.reference, [date, amount, debit, credit, description]);
  if (amount < 0 && (debit < 0 || credit < 0)) return null;
  return {
    date,
    description: description >= 0 ? description : reference >= 0 ? reference : date,
    reference: reference >= 0 ? reference : null,
    amount: amount >= 0 ? amount : null,
    debit: amount >= 0 ? null : debit,
    credit: amount >= 0 ? null : credit,
  };
}

export type DateOrder = "dmy" | "mdy" | "ymd";

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** Look at every date to decide between d/m/y and m/d/y; fall back to the locale's habit. */
export function detectDateOrder(values: string[], fallback: DateOrder): DateOrder {
  let dmy = false;
  let mdy = false;
  for (const v of values) {
    const m = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/.exec(v.trim());
    if (!m) continue;
    if (m[1].length === 4) return "ymd";
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  if (dmy && !mdy) return "dmy";
  if (mdy && !dmy) return "mdy";
  return fallback;
}

export function parseStatementDate(raw: string, order: DateOrder): string | null {
  const v = raw.trim();
  let y: number, m: number, d: number;
  const numeric = /^(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})/.exec(v);
  const named = /^(\d{1,2})[\s\-]([A-Za-z]{3,})\.?[\s\-,]+(\d{2,4})/.exec(v);
  if (numeric) {
    const [a, b, c] = [Number(numeric[1]), Number(numeric[2]), Number(numeric[3])];
    if (numeric[1].length === 4 || order === "ymd") [y, m, d] = [a, b, c];
    else if (order === "mdy") [m, d, y] = [a, b, c];
    else [d, m, y] = [a, b, c];
  } else if (named) {
    d = Number(named[1]);
    const name = named[2].toLowerCase();
    m = MONTHS[name.startsWith("sept") ? "sept" : name.slice(0, 3)] ?? 0;
    y = Number(named[3]);
  } else return null;
  if (y < 100) y += 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCMonth() !== m - 1) return null;
  return date.toISOString().slice(0, 10);
}

export type StatementLine = {
  date: string;
  description: string;
  reference: string | null;
  amountCents: number;
  externalHash: string;
};

export type ParsedStatement = { lines: StatementLine[]; errors: { row: number; reason: string }[] };

export function parseStatement(rows: string[][], mapping: ColumnMapping, dateOrder: DateOrder): ParsedStatement {
  const lines: StatementLine[] = [];
  const errors: { row: number; reason: string }[] = [];
  const seen = new Map<string, number>();

  rows.forEach((r, i) => {
    const rowNo = i + 2; // 1-based, after the header
    const date = parseStatementDate(r[mapping.date] ?? "", dateOrder);
    if (!date) {
      errors.push({ row: rowNo, reason: "date" });
      return;
    }
    let amount: number | null;
    if (mapping.amount != null) {
      amount = parseMoneyInput(r[mapping.amount] ?? "");
    } else {
      const out = parseMoneyInput(r[mapping.debit ?? -1] ?? "") ?? 0;
      const inn = parseMoneyInput(r[mapping.credit ?? -1] ?? "") ?? 0;
      amount = Math.abs(inn) - Math.abs(out);
    }
    if (amount == null || amount === 0) {
      errors.push({ row: rowNo, reason: "amount" });
      return;
    }
    const description = (r[mapping.description] ?? "").slice(0, 300);
    const reference = mapping.reference != null ? (r[mapping.reference] ?? "").slice(0, 120) || null : null;
    const base = fingerprint({ date, amount, description, reference });
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    lines.push({ date, description, reference, amountCents: amount, externalHash: n === 1 ? base : `${base}-${n}` });
  });

  return { lines, errors };
}
