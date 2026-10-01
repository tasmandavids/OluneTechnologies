import "server-only";

// ============================================================================
//  Report assembly: fetch aggregates, hand them to the pure builders.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { dayBefore, fiscalYear, monthsBetween, previousPeriod, type Period } from "../periods";
import { ageItems, balanceSheet, bankSummary, cashFlow, profitAndLoss, profitTrend, trialBalance } from "../reports";
import { buildReturnEntries, computeReturn, rateBreakdown } from "../tax-return";
import type { BooksContext } from "./data";
import { fetchAll, fetchMovements, fetchTaxSummary } from "./data";

export async function getProfitAndLoss(supabase: SupabaseClient, ctx: BooksContext, period: Period, compare = true) {
  const id = ctx.settings.studioId;
  const prev = previousPeriod(period);
  const [cur, cmp] = await Promise.all([
    fetchMovements(supabase, id, period.start, period.end),
    compare ? fetchMovements(supabase, id, prev.start, prev.end) : Promise.resolve(undefined),
  ]);
  return { period, comparePeriod: compare ? prev : null, report: profitAndLoss(ctx.accounts, cur, cmp) };
}

export async function getBalanceSheet(supabase: SupabaseClient, ctx: BooksContext, asAt: string) {
  const id = ctx.settings.studioId;
  const fy = fiscalYear(asAt, ctx.settings.fiscalYearStartMonth, ctx.settings.fiscalYearStartDay);
  const [all, before] = await Promise.all([fetchMovements(supabase, id, null, asAt), fetchMovements(supabase, id, null, dayBefore(fy.start))]);
  return { asAt, fiscalYear: fy, report: balanceSheet(ctx.accounts, all, before) };
}

export async function getTrialBalance(supabase: SupabaseClient, ctx: BooksContext, asAt: string) {
  const id = ctx.settings.studioId;
  const fy = fiscalYear(asAt, ctx.settings.fiscalYearStartMonth, ctx.settings.fiscalYearStartDay);
  const [all, before] = await Promise.all([fetchMovements(supabase, id, null, asAt), fetchMovements(supabase, id, null, dayBefore(fy.start))]);
  return { asAt, report: trialBalance(ctx.accounts, all, before) };
}

export async function getBankSummary(supabase: SupabaseClient, ctx: BooksContext, period: Period) {
  const id = ctx.settings.studioId;
  const [before, cur] = await Promise.all([fetchMovements(supabase, id, null, dayBefore(period.start)), fetchMovements(supabase, id, period.start, period.end)]);
  return { period, rows: bankSummary(ctx.accounts, before, cur) };
}

/** P&L with one column per month (up to 12, newest kept). */
export async function getProfitTrend(supabase: SupabaseClient, ctx: BooksContext, period: Period) {
  const id = ctx.settings.studioId;
  const months = monthsBetween(period.start, period.end, 12);
  const periods = await Promise.all(months.map((m) => fetchMovements(supabase, id, m.start, m.end)));
  return { months, report: profitTrend(ctx.accounts, periods) };
}

export async function getCashFlow(supabase: SupabaseClient, ctx: BooksContext, period: Period) {
  const id = ctx.settings.studioId;
  const [cur, before] = await Promise.all([fetchMovements(supabase, id, period.start, period.end), fetchMovements(supabase, id, null, dayBefore(period.start))]);
  return { period, report: cashFlow(ctx.accounts, cur, before) };
}

/** What was spent with each supplier in a period, from approved bills. */
export async function getSupplierSpend(supabase: SupabaseClient, studioId: string, period: Period) {
  const rows = await fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from("ledger_bills")
      .select("total_cents, tax_cents, paid_cents, contact:ledger_contacts ( name )")
      .eq("studio_id", studioId)
      .in("status", ["awaiting_payment", "paid"])
      .gte("issue_date", period.start)
      .lte("issue_date", period.end)
      .range(from, to),
  );
  const by = new Map<string, { name: string; bills: number; totalCents: number; taxCents: number; outstandingCents: number }>();
  for (const r of rows) {
    const name = (r.contact as { name?: string } | null)?.name ?? "—";
    const cur = by.get(name) ?? { name, bills: 0, totalCents: 0, taxCents: 0, outstandingCents: 0 };
    cur.bills += 1;
    cur.totalCents += Number(r.total_cents);
    cur.taxCents += Number(r.tax_cents);
    cur.outstandingCents += Number(r.total_cents) - Number(r.paid_cents);
    by.set(name, cur);
  }
  const suppliers = [...by.values()].sort((a, b) => b.totalCents - a.totalCents);
  return {
    period,
    suppliers,
    totals: suppliers.reduce(
      (t, s) => ({ bills: t.bills + s.bills, totalCents: t.totalCents + s.totalCents, taxCents: t.taxCents + s.taxCents, outstandingCents: t.outstandingCents + s.outstandingCents }),
      { bills: 0, totalCents: 0, taxCents: 0, outstandingCents: 0 },
    ),
  };
}

export type LedgerDetailRow = {
  lineId: string;
  journalId: string;
  journalNumber: number;
  date: string;
  narration: string;
  reference: string | null;
  sourceType: string;
  description: string | null;
  debitCents: number;
  creditCents: number;
  balanceCents: number;
  reconciled: boolean;
};

/** One account's lines in a period with a running balance (debit-positive). */
export async function getGeneralLedger(supabase: SupabaseClient, ctx: BooksContext, accountId: string, period: Period) {
  const id = ctx.settings.studioId;
  const opening = (await fetchMovements(supabase, id, null, dayBefore(period.start))).find((m) => m.accountId === accountId);
  const openingCents = opening ? opening.debitCents - opening.creditCents : 0;
  const rows = await fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from("ledger_journal_lines")
      .select("id, description, debit_cents, credit_cents, reconciled_bank_txn_id, journal:ledger_journals!inner ( id, journal_number, date, narration, reference, source_type, status )")
      .eq("studio_id", id)
      .eq("account_id", accountId)
      .eq("journal.status", "posted")
      .gte("journal.date", period.start)
      .lte("journal.date", period.end)
      .range(from, to),
  );
  type J = { id: string; journal_number: number; date: string; narration: string; reference: string | null; source_type: string };
  const sorted = rows
    .map((r) => ({ r, j: r.journal as J }))
    .sort((a, b) => (a.j.date === b.j.date ? a.j.journal_number - b.j.journal_number : a.j.date < b.j.date ? -1 : 1));
  let balance = openingCents;
  const lines: LedgerDetailRow[] = sorted.map(({ r, j }) => {
    const debit = Number(r.debit_cents);
    const credit = Number(r.credit_cents);
    balance += debit - credit;
    return {
      lineId: r.id as string,
      journalId: j.id,
      journalNumber: j.journal_number,
      date: j.date,
      narration: j.narration,
      reference: j.reference,
      sourceType: j.source_type,
      description: (r.description as string | null) ?? null,
      debitCents: debit,
      creditCents: credit,
      balanceCents: balance,
      reconciled: !!r.reconciled_bank_txn_id,
    };
  });
  return { period, openingCents, closingCents: balance, lines };
}

export async function getTaxReturn(supabase: SupabaseClient, ctx: BooksContext, period: Period, manualValues: Record<string, number> = {}) {
  const rows = await fetchTaxSummary(supabase, ctx.settings.studioId, period.start, period.end);
  const entries = buildReturnEntries(rows, ctx.rates, { sales: ctx.settings.salesTaxBasis, purchases: ctx.settings.purchasesTaxBasis });
  const computed = computeReturn(ctx.jurisdiction, entries, manualValues);
  return {
    period,
    computed,
    breakdown: rateBreakdown(entries).map((b) => ({ ...b, rateName: ctx.rates.find((r) => r.code === b.rateCode)?.name ?? b.rateCode })),
    dueDate: ctx.jurisdiction.returnForm.dueDate(period.end, ctx.settings.filingFrequency),
  };
}

export async function getAgedReceivables(supabase: SupabaseClient, studioId: string, asAt: string) {
  const rows = await fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from("invoices")
      .select("id, invoice_number, amount_cents, due_date, status, payer:profiles!payer_id ( full_name )")
      .eq("studio_id", studioId)
      .in("status", ["sent", "overdue"])
      .range(from, to),
  );
  const byContact = new Map<string, { dueDate: string | null; outstandingCents: number }[]>();
  for (const r of rows) {
    const who = (r.payer as { full_name?: string } | null)?.full_name ?? "—";
    const list = byContact.get(who) ?? [];
    list.push({ dueDate: (r.due_date as string | null) ?? null, outstandingCents: Number(r.amount_cents ?? 0) });
    byContact.set(who, list);
  }
  const contacts = [...byContact.entries()]
    .map(([name, items]) => ({ name, buckets: ageItems(items, asAt) }))
    .sort((a, b) => b.buckets.total - a.buckets.total);
  return { asAt, contacts, totals: ageItems([...byContact.values()].flat(), asAt) };
}

export async function getAgedPayables(supabase: SupabaseClient, studioId: string, asAt: string) {
  const rows = await fetchAll<Record<string, unknown>>((from, to) =>
    supabase
      .from("ledger_bills")
      .select("id, total_cents, paid_cents, due_date, contact:ledger_contacts ( name )")
      .eq("studio_id", studioId)
      .eq("status", "awaiting_payment")
      .range(from, to),
  );
  const byContact = new Map<string, { dueDate: string | null; outstandingCents: number }[]>();
  for (const r of rows) {
    const who = (r.contact as { name?: string } | null)?.name ?? "—";
    const list = byContact.get(who) ?? [];
    list.push({ dueDate: (r.due_date as string | null) ?? null, outstandingCents: Number(r.total_cents) - Number(r.paid_cents) });
    byContact.set(who, list);
  }
  const contacts = [...byContact.entries()]
    .map(([name, items]) => ({ name, buckets: ageItems(items, asAt) }))
    .sort((a, b) => b.buckets.total - a.buckets.total);
  return { asAt, contacts, totals: ageItems([...byContact.values()].flat(), asAt) };
}
