"use server";

// ============================================================================
//  Olune Books server actions.
//
//  Every write re-checks studio + admin (and the paywall) through
//  getAdminStudio, re-reads ids that arrive from the client tenant-scoped, and
//  posts journals only through lib/ledger/server/post.ts. RLS and the ledger's
//  own triggers check all of it again underneath.
//
//  Errors come back as `{ ok: false, error }` where `error` is a key under
//  books.errors when it's one we anticipated, or the database's message when
//  it isn't (a trigger refusing a locked period says so in plain words).
// ============================================================================

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAdminStudio } from "@/lib/portal/access";
import { logAuditEvent } from "@/lib/audit/log";
import { bankCodedJournal, billJournal, manualJournal, settlementJournal, taxedLines } from "@/lib/ledger/posting";
import { firstOpenDate, todayIso } from "@/lib/ledger/periods";
import { fetchMovements, loadBooksContext, type BooksContext } from "@/lib/ledger/server/data";
import { postJournal, undoJournal } from "@/lib/ledger/server/post";
import { getTaxReturn } from "@/lib/ledger/server/reports";
import { provisionBooks, type SetupInput } from "@/lib/ledger/server/setup";
import { syncStudioLedger } from "@/lib/ledger/server/sync";
import { ACCOUNT_SUBTYPES, FILING_FREQUENCIES, TAX_REPORT_CATEGORIES, accountTypeOf, type AccountSubtype, type DraftLine } from "@/lib/ledger/types";

export type BooksActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const BOOKS = "/portal/admin/books";
const ALL_SUBTYPES = Object.values(ACCOUNT_SUBTYPES).flat() as [AccountSubtype, ...AccountSubtype[]];
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cents = z.number().int().min(0).max(1_000_000_000_00);

async function access() {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId) return { error: ctx.error ?? "Not authorized." } as const;
  return { supabase: ctx.supabase, studioId: ctx.studioId, userId: ctx.userId } as const;
}

type BooksAccess = { supabase: SupabaseClient; studioId: string; userId: string | null; books: BooksContext };

async function withBooks<T>(fn: (a: BooksAccess) => Promise<BooksActionResult<T>>): Promise<BooksActionResult<T>> {
  const a = await access();
  if ("error" in a) return { ok: false, error: a.error as string };
  const books = await loadBooksContext(a.supabase, a.studioId);
  if (!books) return { ok: false, error: "notSetUp" };
  try {
    return await fn({ ...a, books });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "unexpected" };
  }
}

function revalidateBooks() {
  revalidatePath(BOOKS, "layout");
}

// ─── Setup ───────────────────────────────────────────────────────────────────

const SetupSchema = z.object({
  jurisdiction: z.string().regex(/^[A-Z]{2}$/),
  region: z.string().max(10).nullable(),
  custom: z
    .object({
      countryName: z.string().trim().min(1).max(80),
      currency: z.string().trim().length(3),
      taxName: z.string().trim().min(1).max(30),
      standardRateBp: z.number().min(0).max(10_000),
      reducedRateBp: z.number().min(0).max(10_000).nullable(),
    })
    .nullable(),
  taxRegistered: z.boolean(),
  taxNumber: z.string().trim().max(40).nullable(),
  basisId: z.string().max(30),
  filingFrequency: z.enum(FILING_FREQUENCIES),
  taxPeriodAnchorMonth: z.number().int().min(1).max(12),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  fiscalYearStartDay: z.number().int().min(1).max(31),
  conversionDate: isoDate,
  pricesIncludeTax: z.boolean(),
  updateProductRates: z.boolean(),
});

export async function setupBooksAction(input: SetupInput): Promise<BooksActionResult> {
  const a = await access();
  if ("error" in a) return { ok: false, error: a.error as string };
  const parsed = SetupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  // One ledger at a time: Books can't be switched on beside a connected Xero.
  const { data: xero } = await a.supabase.from("xero_connections").select("id").eq("studio_id", a.studioId).maybeSingle();
  if (xero) return { ok: false, error: "xeroConnected" };

  const result = await provisionBooks(a.supabase, a.studioId, parsed.data as SetupInput);
  if (!result.ok) return result;

  await logAuditEvent({
    studioId: a.studioId,
    actorId: a.userId,
    action: "books.enabled",
    targetType: "ledger_settings",
    targetId: a.studioId,
    metadata: { jurisdiction: parsed.data.jurisdiction, region: parsed.data.region, conversionDate: parsed.data.conversionDate },
  });
  await syncStudioLedger(a.supabase, a.studioId, { userId: a.userId, force: true });
  revalidateBooks();
  revalidatePath("/portal/admin/settings/connections");
  return { ok: true };
}

export async function syncNowAction(): Promise<BooksActionResult<{ posted: number; reposted: number; undone: number; errors: number }>> {
  const a = await access();
  if ("error" in a) return { ok: false, error: a.error as string };
  const report = await syncStudioLedger(a.supabase, a.studioId, { userId: a.userId, force: true });
  revalidateBooks();
  if (!report) return { ok: false, error: "notSetUp" };
  return { ok: true, data: { posted: report.posted, reposted: report.reposted, undone: report.undone, errors: report.errors.length } };
}

// ─── Chart of accounts & tax rates ───────────────────────────────────────────

const AccountSchema = z.object({
  id: z.string().uuid().nullable(),
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(150),
  subtype: z.enum(ALL_SUBTYPES),
  description: z.string().trim().max(300).nullable(),
  defaultTaxRateId: z.string().uuid().nullable(),
  bankKind: z.enum(["bank", "clearing", "cash", "credit_card"]).nullable(),
  bankNumber: z.string().trim().max(40).nullable(),
});

export async function saveAccountAction(input: z.infer<typeof AccountSchema>): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, books }) => {
    const parsed = AccountSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    if (v.defaultTaxRateId && !books.rates.some((r) => r.id === v.defaultTaxRateId)) return { ok: false, error: "invalid" };
    const row = {
      code: v.code,
      name: v.name,
      type: accountTypeOf(v.subtype),
      subtype: v.subtype,
      description: v.description || null,
      default_tax_rate_id: v.defaultTaxRateId,
      bank_kind: v.subtype === "bank" ? (v.bankKind ?? "bank") : null,
      bank_number: v.subtype === "bank" ? v.bankNumber || null : null,
      auto_created: false,
    };
    if (v.id) {
      const existing = books.accounts.find((x) => x.id === v.id);
      if (!existing) return { ok: false, error: "notFound" };
      // System accounts keep their role; only their name/code/tax default change.
      const { error } = await supabase
        .from("ledger_accounts")
        .update(existing.systemKey ? { code: row.code, name: row.name, description: row.description, default_tax_rate_id: row.default_tax_rate_id, bank_number: row.bank_number, auto_created: false } : row)
        .eq("id", v.id)
        .eq("studio_id", studioId);
      if (error) return { ok: false, error: error.code === "23505" ? "duplicateCode" : error.message };
    } else {
      const { error } = await supabase.from("ledger_accounts").insert({ ...row, studio_id: studioId });
      if (error) return { ok: false, error: error.code === "23505" ? "duplicateCode" : error.message };
    }
    revalidateBooks();
    return { ok: true };
  });
}

export async function archiveAccountAction(id: string, archived: boolean): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, books }) => {
    const acct = books.accounts.find((x) => x.id === id);
    if (!acct) return { ok: false, error: "notFound" };
    if (acct.systemKey && archived) return { ok: false, error: "systemAccount" };
    const { error } = await supabase.from("ledger_accounts").update({ is_archived: archived }).eq("id", id).eq("studio_id", studioId);
    if (error) return { ok: false, error: error.message };
    revalidateBooks();
    return { ok: true };
  });
}

const TaxRateSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(80),
  rateBp: z.number().min(0).max(10_000),
  appliesTo: z.enum(["sales", "purchases", "both"]),
  reportCategory: z.enum(TAX_REPORT_CATEGORIES),
});

export async function createTaxRateAction(input: z.infer<typeof TaxRateSchema>): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, books }) => {
    const parsed = TaxRateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    const { error } = await supabase.from("ledger_tax_rates").insert({
      studio_id: studioId,
      code: v.code,
      name: v.name,
      rate_bp: v.rateBp,
      applies_to: v.appliesTo,
      report_category: v.reportCategory,
      components:
        v.rateBp > 0
          ? [{ name: books.jurisdiction.taxName, rateBp: v.rateBp, salesAccountKey: "tax_collected", purchaseAccountKey: "tax_paid" }]
          : [],
      sort_order: books.rates.length,
    });
    if (error) return { ok: false, error: error.code === "23505" ? "duplicateCode" : error.message };
    revalidateBooks();
    return { ok: true };
  });
}

export async function archiveTaxRateAction(id: string, archived: boolean): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, books }) => {
    if (!books.rates.some((r) => r.id === id)) return { ok: false, error: "notFound" };
    const { error } = await supabase.from("ledger_tax_rates").update({ is_archived: archived }).eq("id", id).eq("studio_id", studioId);
    if (error) return { ok: false, error: error.message };
    revalidateBooks();
    return { ok: true };
  });
}

// ─── Manual journals ─────────────────────────────────────────────────────────

const ManualLineSchema = z.object({
  accountId: z.string().uuid(),
  description: z.string().trim().max(300).nullable(),
  debitCents: cents,
  creditCents: cents,
  taxRateId: z.string().uuid().nullable(),
});

const ManualJournalSchema = z.object({
  date: isoDate,
  narration: z.string().trim().min(1).max(500),
  reference: z.string().trim().max(60).nullable(),
  opening: z.boolean(),
  lines: z.array(ManualLineSchema).min(2).max(200),
});

export async function postManualJournalAction(input: z.infer<typeof ManualJournalSchema>): Promise<BooksActionResult<{ id: string }>> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const parsed = ManualJournalSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    const lines: DraftLine[] = [];
    for (const l of v.lines) {
      const account = books.chart.byId.get(l.accountId);
      if (!account) return { ok: false, error: "invalid" };
      if (l.debitCents > 0 && l.creditCents > 0) return { ok: false, error: "debitAndCredit" };
      const rate = l.taxRateId ? books.chart.rate(l.taxRateId) : null;
      const side = l.debitCents > 0 ? "debit" : "credit";
      const amount = l.debitCents || l.creditCents;
      if (amount === 0) continue;
      // Amounts on a taxed manual line are tax-inclusive; the tax is split out
      // to its own account, the way Xero's manual journals behave.
      const built = taxedLines(books.chart, [{ account, amountCents: amount, rate, description: l.description }], side, true);
      lines.push(...built.lines);
    }
    const draft = manualJournal({
      date: v.date,
      narration: v.narration,
      reference: v.reference,
      sourceType: v.opening ? "opening_balance" : "manual",
      lines,
    });
    const id = await postJournal(supabase, studioId, draft);
    await logAuditEvent({ studioId, actorId: userId, action: "books.journal_posted", targetType: "ledger_journal", targetId: id, metadata: { date: v.date, lines: lines.length, opening: v.opening } });
    revalidateBooks();
    return { ok: true, data: { id } };
  });
}

const VOIDABLE = new Set(["manual", "opening_balance", "bank", "transfer", "tax_settlement"]);

export async function voidJournalAction(journalId: string, reason: string): Promise<BooksActionResult<{ how: "voided" | "reversed" }>> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const { data: j } = await supabase
      .from("ledger_journals")
      .select("id, date, journal_number, source_type, source_id, status, superseded_by")
      .eq("id", journalId)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!j || j.status !== "posted" || j.superseded_by) return { ok: false, error: "notFound" };
    if (!VOIDABLE.has(j.source_type as string)) return { ok: false, error: "voidAtSource" };
    const how = await undoJournal(supabase, { id: j.id as string, date: j.date as string, journalNumber: Number(j.journal_number) }, books.settings.lockDate, reason.trim() || "Voided", userId);
    if (j.source_type === "bank" || j.source_type === "transfer") {
      await supabase.from("ledger_bank_transactions").update({ status: "unreconciled", journal_id: null, matched_at: null, matched_by: null }).eq("id", j.source_id as string).eq("studio_id", studioId);
    }
    await logAuditEvent({ studioId, actorId: userId, action: "books.journal_voided", targetType: "ledger_journal", targetId: journalId, metadata: { how, reason: reason.slice(0, 200) } });
    revalidateBooks();
    return { ok: true, data: { how } };
  });
}

// ─── Contacts & bills ────────────────────────────────────────────────────────

const ContactSchema = z.object({
  name: z.string().trim().min(1).max(150),
  email: z.string().trim().email().max(200).nullable().or(z.literal("").transform(() => null)),
  taxNumber: z.string().trim().max(40).nullable(),
  defaultAccountId: z.string().uuid().nullable(),
});

export async function createContactAction(input: z.infer<typeof ContactSchema>): Promise<BooksActionResult<{ id: string }>> {
  return withBooks(async ({ supabase, studioId, books }) => {
    const parsed = ContactSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    if (v.defaultAccountId && !books.chart.byId.has(v.defaultAccountId)) return { ok: false, error: "invalid" };
    const { data, error } = await supabase
      .from("ledger_contacts")
      .insert({ studio_id: studioId, name: v.name, email: v.email, tax_number: v.taxNumber || null, default_account_id: v.defaultAccountId })
      .select("id")
      .single();
    if (error) return { ok: false, error: error.code === "23505" ? "duplicateContact" : error.message };
    revalidateBooks();
    return { ok: true, data: { id: data.id as string } };
  });
}

const BillLineSchema = z.object({
  description: z.string().trim().min(1).max(300),
  accountId: z.string().uuid(),
  taxRateId: z.string().uuid().nullable(),
  quantity: z.number().positive().max(100_000),
  unitCents: cents,
});

const BillSchema = z.object({
  id: z.string().uuid().nullable(),
  contactId: z.string().uuid(),
  reference: z.string().trim().max(60).nullable(),
  issueDate: isoDate,
  dueDate: isoDate.nullable(),
  amountsIncludeTax: z.boolean(),
  notes: z.string().trim().max(1000).nullable(),
  lines: z.array(BillLineSchema).min(1).max(100),
  approve: z.boolean(),
});

export async function saveBillAction(input: z.infer<typeof BillSchema>): Promise<BooksActionResult<{ id: string }>> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const parsed = BillSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    const { data: contact } = await supabase.from("ledger_contacts").select("id, name").eq("id", v.contactId).eq("studio_id", studioId).maybeSingle();
    if (!contact) return { ok: false, error: "invalid" };
    for (const l of v.lines) {
      if (!books.chart.byId.has(l.accountId)) return { ok: false, error: "invalid" };
      if (l.taxRateId && !books.rates.some((r) => r.id === l.taxRateId)) return { ok: false, error: "invalid" };
    }

    if (v.id) {
      const { data: prior } = await supabase.from("ledger_bills").select("status").eq("id", v.id).eq("studio_id", studioId).maybeSingle();
      if (!prior) return { ok: false, error: "notFound" };
      if (prior.status !== "draft") return { ok: false, error: "billLocked" };
    }

    const lineRows = v.lines.map((l, i) => ({ ...l, lineTotalCents: Math.round(l.quantity * l.unitCents), sort: i }));
    const reference = v.reference || `BILL-${todayIso().replace(/-/g, "")}`;
    // Totals come from the same maths the journal uses, so the bill and its
    // posting can never disagree.
    const { journal, totals } = billJournal(books.chart, {
      id: v.id ?? "00000000-0000-0000-0000-000000000000",
      reference,
      date: v.issueDate,
      contactName: contact.name as string,
      amountsIncludeTax: v.amountsIncludeTax,
      lines: lineRows.map((l) => ({ description: l.description, accountId: l.accountId, taxRateId: l.taxRateId, lineTotalCents: l.lineTotalCents })),
    });

    const billRow = {
      studio_id: studioId,
      contact_id: v.contactId,
      reference,
      issue_date: v.issueDate,
      due_date: v.dueDate,
      amounts_include_tax: v.amountsIncludeTax,
      notes: v.notes,
      subtotal_cents: totals.subtotalCents,
      tax_cents: totals.taxCents,
      total_cents: totals.totalCents,
      updated_at: new Date().toISOString(),
    };

    let billId = v.id;
    if (billId) {
      const { error } = await supabase.from("ledger_bills").update(billRow).eq("id", billId).eq("studio_id", studioId);
      if (error) return { ok: false, error: error.message };
      await supabase.from("ledger_bill_lines").delete().eq("bill_id", billId).eq("studio_id", studioId);
    } else {
      const { data, error } = await supabase.from("ledger_bills").insert({ ...billRow, created_by: userId }).select("id").single();
      if (error) return { ok: false, error: error.message };
      billId = data.id as string;
    }
    const { error: lineErr } = await supabase.from("ledger_bill_lines").insert(
      lineRows.map((l) => ({
        bill_id: billId,
        studio_id: studioId,
        description: l.description,
        account_id: l.accountId,
        tax_rate_id: l.taxRateId,
        quantity: l.quantity,
        unit_cents: l.unitCents,
        line_total_cents: l.lineTotalCents,
        sort_order: l.sort,
      })),
    );
    if (lineErr) return { ok: false, error: lineErr.message };

    if (v.approve) {
      const date = firstOpenDate(books.settings.lockDate, v.issueDate);
      const journalId = await postJournal(supabase, studioId, { ...journal, sourceId: billId, date });
      await supabase.from("ledger_bills").update({ status: "awaiting_payment", journal_id: journalId }).eq("id", billId).eq("studio_id", studioId);
      await logAuditEvent({ studioId, actorId: userId, action: "books.bill_approved", targetType: "ledger_bill", targetId: billId, metadata: { totalCents: totals.totalCents } });
    }
    revalidateBooks();
    return { ok: true, data: { id: billId } };
  });
}

const PaySchema = z.object({ billId: z.string().uuid(), date: isoDate, amountCents: cents.min(1), bankAccountId: z.string().uuid() });

export async function payBillAction(input: z.infer<typeof PaySchema>): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const parsed = PaySchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    const bank = books.chart.byId.get(v.bankAccountId);
    if (!bank || bank.subtype !== "bank") return { ok: false, error: "invalid" };
    const { data: bill } = await supabase
      .from("ledger_bills")
      .select("id, status, reference, total_cents, paid_cents, journal_id, contact:ledger_contacts ( name )")
      .eq("id", v.billId)
      .eq("studio_id", studioId)
      .maybeSingle();
    if (!bill || bill.status !== "awaiting_payment") return { ok: false, error: "notFound" };
    const outstanding = Number(bill.total_cents) - Number(bill.paid_cents);
    if (v.amountCents > outstanding) return { ok: false, error: "overpayment" };

    // Journal first, payment row second: payments can't be deleted (no grant),
    // so a payment must never exist without the entry that books it.
    const paymentId = crypto.randomUUID();
    const contactName = (bill.contact as { name?: string } | null)?.name ?? null;
    const draft = settlementJournal(books.chart, {
      sourceType: "bill_payment",
      id: paymentId,
      date: firstOpenDate(books.settings.lockDate, v.date),
      amountCents: v.amountCents,
      bankAccountId: v.bankAccountId,
      settlesJournalId: (bill.journal_id as string | null) ?? null,
      reference: bill.reference as string | null,
      contactName,
      narration: `Payment of bill ${bill.reference ?? ""}${contactName ? ` — ${contactName}` : ""}`,
    });
    const journalId = draft ? await postJournal(supabase, studioId, draft) : null;
    const { error } = await supabase.from("ledger_bill_payments").insert({
      id: paymentId,
      bill_id: v.billId,
      studio_id: studioId,
      date: v.date,
      amount_cents: v.amountCents,
      bank_account_id: v.bankAccountId,
      journal_id: journalId,
      created_by: userId,
    });
    if (error) return { ok: false, error: error.message };
    const paid = Number(bill.paid_cents) + v.amountCents;
    await supabase
      .from("ledger_bills")
      .update({ paid_cents: paid, status: paid >= Number(bill.total_cents) ? "paid" : "awaiting_payment", updated_at: new Date().toISOString() })
      .eq("id", v.billId)
      .eq("studio_id", studioId);
    await logAuditEvent({ studioId, actorId: userId, action: "books.bill_paid", targetType: "ledger_bill", targetId: v.billId, metadata: { amountCents: v.amountCents } });
    revalidateBooks();
    return { ok: true };
  });
}

export async function voidBillAction(billId: string, reason: string): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const { data: bill } = await supabase.from("ledger_bills").select("id, status, paid_cents, journal_id").eq("id", billId).eq("studio_id", studioId).maybeSingle();
    if (!bill) return { ok: false, error: "notFound" };
    if (bill.status === "draft") {
      const { error } = await supabase.from("ledger_bills").delete().eq("id", billId).eq("studio_id", studioId);
      if (error) return { ok: false, error: error.message };
      revalidateBooks();
      return { ok: true };
    }
    if (Number(bill.paid_cents) > 0) return { ok: false, error: "billHasPayments" };
    if (bill.journal_id) {
      const { data: j } = await supabase.from("ledger_journals").select("id, date, journal_number, status").eq("id", bill.journal_id as string).maybeSingle();
      if (j && j.status === "posted") await undoJournal(supabase, { id: j.id as string, date: j.date as string, journalNumber: Number(j.journal_number) }, books.settings.lockDate, reason || "Bill voided", userId);
    }
    await supabase.from("ledger_bills").update({ status: "void", updated_at: new Date().toISOString() }).eq("id", billId).eq("studio_id", studioId);
    await logAuditEvent({ studioId, actorId: userId, action: "books.bill_voided", targetType: "ledger_bill", targetId: billId, metadata: { reason: reason.slice(0, 200) } });
    revalidateBooks();
    return { ok: true };
  });
}

// ─── Bank ────────────────────────────────────────────────────────────────────

const ImportSchema = z.object({
  accountId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        date: isoDate,
        description: z.string().max(300),
        reference: z.string().max(120).nullable(),
        amountCents: z.number().int().refine((n) => n !== 0),
        externalHash: z.string().min(4).max(80),
      }),
    )
    .min(1)
    .max(5000),
});

export async function importBankLinesAction(input: z.infer<typeof ImportSchema>): Promise<BooksActionResult<{ imported: number; duplicates: number }>> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const parsed = ImportSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    const acct = books.chart.byId.get(v.accountId);
    if (!acct || acct.subtype !== "bank") return { ok: false, error: "invalid" };
    const batch = crypto.randomUUID();
    let imported = 0;
    for (let i = 0; i < v.lines.length; i += 500) {
      const chunk = v.lines.slice(i, i + 500).map((l) => ({
        studio_id: studioId,
        account_id: v.accountId,
        date: l.date,
        description: l.description,
        reference: l.reference,
        amount_cents: l.amountCents,
        external_hash: l.externalHash,
        import_batch_id: batch,
      }));
      const { data, error } = await supabase
        .from("ledger_bank_transactions")
        .upsert(chunk, { onConflict: "studio_id,account_id,external_hash", ignoreDuplicates: true })
        .select("id");
      if (error) return { ok: false, error: error.message };
      imported += data?.length ?? 0;
    }
    await logAuditEvent({ studioId, actorId: userId, action: "books.bank_imported", targetType: "ledger_account", targetId: v.accountId, metadata: { imported, rows: v.lines.length } });
    revalidateBooks();
    return { ok: true, data: { imported, duplicates: v.lines.length - imported } };
  });
}

async function loadTxn(supabase: SupabaseClient, studioId: string, txnId: string) {
  const { data } = await supabase
    .from("ledger_bank_transactions")
    .select("id, account_id, date, description, reference, amount_cents, status, journal_id")
    .eq("id", txnId)
    .eq("studio_id", studioId)
    .maybeSingle();
  return data;
}

export async function matchBankTxnAction(txnId: string, lineId: string): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, userId }) => {
    const txn = await loadTxn(supabase, studioId, txnId);
    if (!txn || txn.status !== "unreconciled") return { ok: false, error: "notFound" };
    const { data: line } = await supabase
      .from("ledger_journal_lines")
      .select("id, account_id, debit_cents, credit_cents, reconciled_bank_txn_id, journal:ledger_journals!inner ( id, status )")
      .eq("id", lineId)
      .eq("studio_id", studioId)
      .maybeSingle();
    const journal = line?.journal as { id?: string; status?: string } | undefined;
    if (!line || journal?.status !== "posted" || line.reconciled_bank_txn_id || line.account_id !== txn.account_id) return { ok: false, error: "notFound" };
    if (Number(line.debit_cents) - Number(line.credit_cents) !== Number(txn.amount_cents)) return { ok: false, error: "amountMismatch" };
    const { error } = await supabase.from("ledger_journal_lines").update({ reconciled_bank_txn_id: txnId }).eq("id", lineId).eq("studio_id", studioId);
    if (error) return { ok: false, error: error.message };
    await supabase
      .from("ledger_bank_transactions")
      .update({ status: "reconciled", journal_id: journal?.id ?? null, matched_at: new Date().toISOString(), matched_by: userId })
      .eq("id", txnId)
      .eq("studio_id", studioId);
    revalidateBooks();
    return { ok: true };
  });
}

const CodeSchema = z.object({
  txnId: z.string().uuid(),
  contactName: z.string().trim().max(150).nullable(),
  lines: z.array(z.object({ accountId: z.string().uuid(), taxRateId: z.string().uuid().nullable(), amountCents: cents.min(1), description: z.string().trim().max(300).nullable() })).min(1).max(20),
});

export async function codeBankTxnAction(input: z.infer<typeof CodeSchema>): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const parsed = CodeSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    const txn = await loadTxn(supabase, studioId, v.txnId);
    if (!txn || txn.status !== "unreconciled") return { ok: false, error: "notFound" };
    for (const l of v.lines) if (!books.chart.byId.has(l.accountId) || l.accountId === txn.account_id) return { ok: false, error: "invalid" };
    const draft = bankCodedJournal(
      books.chart,
      {
        id: txn.id as string,
        date: firstOpenDate(books.settings.lockDate, txn.date as string),
        amountCents: Number(txn.amount_cents),
        bankAccountId: txn.account_id as string,
        description: txn.description as string,
        reference: (txn.reference as string | null) ?? null,
        contactName: v.contactName,
      },
      v.lines,
    );
    const journalId = await postJournal(supabase, studioId, draft);
    // Mark the new journal's own bank line as the reconciled one.
    await supabase
      .from("ledger_journal_lines")
      .update({ reconciled_bank_txn_id: txn.id })
      .eq("journal_id", journalId)
      .eq("account_id", txn.account_id as string)
      .eq("studio_id", studioId);
    await supabase
      .from("ledger_bank_transactions")
      .update({ status: "reconciled", journal_id: journalId, matched_at: new Date().toISOString(), matched_by: userId })
      .eq("id", txn.id as string)
      .eq("studio_id", studioId);
    revalidateBooks();
    return { ok: true };
  });
}

export async function setBankTxnExcludedAction(txnId: string, excluded: boolean): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId }) => {
    const txn = await loadTxn(supabase, studioId, txnId);
    if (!txn || txn.status === "reconciled") return { ok: false, error: "notFound" };
    await supabase.from("ledger_bank_transactions").update({ status: excluded ? "excluded" : "unreconciled" }).eq("id", txnId).eq("studio_id", studioId);
    revalidateBooks();
    return { ok: true };
  });
}

export async function unreconcileBankTxnAction(txnId: string): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const txn = await loadTxn(supabase, studioId, txnId);
    if (!txn || txn.status !== "reconciled") return { ok: false, error: "notFound" };
    if (txn.journal_id) {
      const { data: j } = await supabase.from("ledger_journals").select("id, date, journal_number, source_type, source_id, status").eq("id", txn.journal_id as string).maybeSingle();
      if (j && j.status === "posted" && (j.source_type === "bank" || j.source_type === "transfer") && j.source_id === txnId) {
        // The journal only existed because of this statement line.
        await undoJournal(supabase, { id: j.id as string, date: j.date as string, journalNumber: Number(j.journal_number) }, books.settings.lockDate, "Statement line unreconciled", userId);
      }
    }
    await supabase.from("ledger_journal_lines").update({ reconciled_bank_txn_id: null }).eq("reconciled_bank_txn_id", txnId).eq("studio_id", studioId);
    await supabase.from("ledger_bank_transactions").update({ status: "unreconciled", journal_id: null, matched_at: null, matched_by: null }).eq("id", txnId).eq("studio_id", studioId);
    revalidateBooks();
    return { ok: true };
  });
}

// ─── Tax returns ─────────────────────────────────────────────────────────────

const FileSchema = z.object({
  periodStart: isoDate,
  periodEnd: isoDate,
  filingReference: z.string().trim().max(80).nullable(),
  manualValues: z.record(z.string(), z.number().int()).default({}),
});

export async function fileTaxReturnAction(input: z.infer<typeof FileSchema>): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const parsed = FileSchema.safeParse(input);
    if (!parsed.success || parsed.data.periodEnd < parsed.data.periodStart) return { ok: false, error: "invalid" };
    const v = parsed.data;
    if (!books.settings.taxRegistered) return { ok: false, error: "notRegistered" };
    if (books.settings.lockDate && v.periodEnd <= books.settings.lockDate) return { ok: false, error: "alreadyLocked" };
    if (v.periodEnd > todayIso()) return { ok: false, error: "periodNotEnded" };
    const { data: already } = await supabase
      .from("ledger_tax_returns")
      .select("id")
      .eq("studio_id", studioId)
      .eq("period_start", v.periodStart)
      .eq("period_end", v.periodEnd)
      .maybeSingle();
    if (already) return { ok: false, error: "alreadyFiled" };

    // Make sure everything up to the period end is posted before it's frozen.
    await syncStudioLedger(supabase, studioId, { userId, force: true });
    const fresh = (await loadBooksContext(supabase, studioId))!;
    const ret = await getTaxReturn(supabase, fresh, { start: v.periodStart, end: v.periodEnd }, v.manualValues);

    // EU-style charts keep output and input tax apart; on filing, both
    // balances move into the settlement account so it shows what's owed.
    let settlementJournalId: string | null = null;
    if (fresh.jurisdiction.separateTaxAccounts) {
      const taxAccounts = fresh.accounts.filter((a) => a.subtype === "tax" && a.systemKey && a.systemKey !== "tax_settlement");
      const settlement = fresh.chart.maybeAccount("tax_settlement");
      if (settlement && taxAccounts.length) {
        const movements = await fetchMovements(supabase, studioId, null, v.periodEnd);
        const lines: DraftLine[] = [];
        let net = 0;
        for (const a of taxAccounts) {
          const m = movements.find((x) => x.accountId === a.id);
          const bal = m ? m.creditCents - m.debitCents : 0; // credit-positive
          if (bal === 0) continue;
          lines.push(bal > 0 ? { accountId: a.id, debitCents: bal, creditCents: 0 } : { accountId: a.id, debitCents: 0, creditCents: -bal });
          net += bal;
        }
        if (lines.length) {
          if (net !== 0) lines.push(net > 0 ? { accountId: settlement.id, debitCents: 0, creditCents: net } : { accountId: settlement.id, debitCents: -net, creditCents: 0 });
          if (lines.length >= 2) {
            settlementJournalId = await postJournal(supabase, studioId, {
              date: v.periodEnd,
              narration: `${ret.computed.formName} ${v.periodStart} – ${v.periodEnd}`,
              reference: v.filingReference,
              sourceType: "tax_settlement",
              sourceId: null,
              taxTiming: "none",
              lines,
            });
          }
        }
      }
    }

    const { error } = await supabase.from("ledger_tax_returns").insert({
      studio_id: studioId,
      period_start: v.periodStart,
      period_end: v.periodEnd,
      form_code: ret.computed.formCode,
      figures: { boxes: ret.computed.boxes, breakdown: ret.breakdown },
      net_payable_cents: ret.computed.netPayableCents,
      sales_tax_basis: fresh.settings.salesTaxBasis,
      purchases_tax_basis: fresh.settings.purchasesTaxBasis,
      filing_reference: v.filingReference,
      settlement_journal_id: settlementJournalId,
      filed_by: userId,
    });
    if (error) return { ok: false, error: error.code === "23505" ? "alreadyFiled" : error.message };

    await supabase.from("ledger_settings").update({ lock_date: v.periodEnd }).eq("studio_id", studioId);
    await logAuditEvent({ studioId, actorId: userId, action: "books.tax_return_filed", targetType: "ledger_tax_return", targetId: `${v.periodStart}/${v.periodEnd}`, metadata: { netPayableCents: ret.computed.netPayableCents, form: ret.computed.formCode } });
    revalidateBooks();
    return { ok: true };
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────

const SettingsSchema = z.object({
  taxRegistered: z.boolean(),
  taxNumber: z.string().trim().max(40).nullable(),
  basisId: z.string().max(30),
  filingFrequency: z.enum(FILING_FREQUENCIES),
  taxPeriodAnchorMonth: z.number().int().min(1).max(12),
  fiscalYearStartMonth: z.number().int().min(1).max(12),
  fiscalYearStartDay: z.number().int().min(1).max(31),
  pricesIncludeTax: z.boolean(),
  autoPost: z.boolean(),
  lockDate: isoDate.nullable(),
});

export async function updateBooksSettingsAction(input: z.infer<typeof SettingsSchema>): Promise<BooksActionResult> {
  return withBooks(async ({ supabase, studioId, userId, books }) => {
    const parsed = SettingsSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "invalid" };
    const v = parsed.data;
    const j = books.jurisdiction;
    const basis = j.bases.find((b) => b.id === v.basisId);
    if (!basis) return { ok: false, error: "invalid" };
    if (v.taxRegistered && !j.filing.frequencies.includes(v.filingFrequency)) return { ok: false, error: "invalid" };
    if (v.taxRegistered && v.taxNumber && !j.taxNumber.validate(v.taxNumber)) return { ok: false, error: "taxNumber" };

    const { error } = await supabase
      .from("ledger_settings")
      .update({
        tax_registered: v.taxRegistered,
        tax_number: v.taxNumber || null,
        tax_scheme: basis.id,
        sales_tax_basis: basis.sales,
        purchases_tax_basis: basis.purchases,
        filing_frequency: v.filingFrequency,
        tax_period_anchor_month: v.taxPeriodAnchorMonth,
        fiscal_year_start_month: v.fiscalYearStartMonth,
        fiscal_year_start_day: v.fiscalYearStartDay,
        prices_include_tax: v.pricesIncludeTax,
        auto_post: v.autoPost,
        lock_date: v.lockDate,
      })
      .eq("studio_id", studioId);
    if (error) return { ok: false, error: error.message };
    await supabase
      .from("studios")
      .update({ gst_registered: v.taxRegistered, prices_include_tax: v.pricesIncludeTax, gst_number: v.taxNumber || null })
      .eq("id", studioId);
    await logAuditEvent({
      studioId,
      actorId: userId,
      action: "books.settings_updated",
      targetType: "ledger_settings",
      targetId: studioId,
      metadata: { lockDate: { from: books.settings.lockDate, to: v.lockDate }, basis: basis.id, frequency: v.filingFrequency },
    });
    revalidateBooks();
    return { ok: true };
  });
}
