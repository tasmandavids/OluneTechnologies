// ============================================================================
//  CSV and FEC exports. Pure — the export route feeds them rows.
// ============================================================================

import { centsToDecimal } from "./money";

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    // Leading =,+,-,@ would be evaluated as a formula by spreadsheet apps.
    const safe = /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}

export type FecLine = {
  journalCode: string;
  journalLabel: string;
  entryNumber: number;
  entryDate: string;
  accountCode: string;
  accountLabel: string;
  reference: string;
  documentDate: string;
  label: string;
  debitCents: number;
  creditCents: number;
  validationDate: string;
};

/**
 * France's Fichier des Écritures Comptables (art. A47 A-1 LPF): 18 columns,
 * tab- or pipe-separated, dates yyyymmdd, comma decimal. Required on request
 * in a tax audit. Auxiliary (customer/supplier) and lettering columns are
 * left empty: Olune Books doesn't keep subsidiary ledgers by third party.
 */
export function toFec(lines: FecLine[]): string {
  const header = [
    "JournalCode", "JournalLib", "EcritureNum", "EcritureDate", "CompteNum", "CompteLib", "CompAuxNum", "CompAuxLib",
    "PieceRef", "PieceDate", "EcritureLib", "Debit", "Credit", "EcritureLet", "DateLet", "ValidDate", "Montantdevise", "Idevise",
  ];
  const d = (iso: string) => iso.replace(/-/g, "");
  const amt = (c: number) => centsToDecimal(c).replace(".", ",");
  const clean = (s: string) => s.replace(/[|\t\r\n]/g, " ").trim();
  const rows = lines.map((l) => [
    l.journalCode, clean(l.journalLabel), String(l.entryNumber), d(l.entryDate), l.accountCode, clean(l.accountLabel), "", "",
    clean(l.reference || String(l.entryNumber)), d(l.documentDate), clean(l.label), amt(l.debitCents), amt(l.creditCents), "", "", d(l.validationDate), "", "",
  ]);
  return [header, ...rows].map((r) => r.join("|")).join("\r\n") + "\r\n";
}

/** FEC journal codes by source, in the conventional French short form. */
export const FEC_JOURNALS: Record<string, [code: string, label: string]> = {
  invoice: ["VE", "Ventes"],
  order: ["VE", "Ventes"],
  ticket: ["VE", "Ventes"],
  refund: ["VE", "Ventes"],
  bill: ["AC", "Achats"],
  invoice_payment: ["BQ", "Banque"],
  invoice_manual_payment: ["BQ", "Banque"],
  bill_payment: ["BQ", "Banque"],
  bank: ["BQ", "Banque"],
  transfer: ["BQ", "Banque"],
  opening_balance: ["AN", "A-nouveaux"],
  manual: ["OD", "Opérations diverses"],
  tax_settlement: ["OD", "Opérations diverses"],
  reversal: ["OD", "Opérations diverses"],
};
