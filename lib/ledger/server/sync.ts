import "server-only";

// ============================================================================
//  Auto-posting: Olune's own money records → journals.
//
//  A catch-up, not an event handler. Each run reads the studio's invoices,
//  payments, shop orders and event tickets since the books started, compares
//  them with what's already posted (keyed by source_type + source_id, with a
//  fingerprint to notice edits), and posts, re-posts or voids the difference.
//
//  Why catch-up instead of hooking every write path: money reaches Olune
//  through the Stripe webhook, the refund action, manual "mark paid", term
//  payment plans, subscription invoices and class passes. Hooking each one is
//  how a path gets missed. Reading the records themselves can't miss one, is
//  idempotent (the unique source index makes a double run harmless), and heals
//  itself after any outage.
//
//  Runs: when a Books page loads (rate-limited), from the daily cron, and on
//  "Sync now".
//
//  Locked periods: a document dated on or before the lock date is posted on
//  the first open day instead, and an edit to a locked journal becomes a
//  reversal + re-post, never a change to a filed period.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { fingerprint, invoiceJournal, cashSaleJournal, settlementJournal, refundJournal } from "../posting";
import type { PostedLine, SaleLineInput, TaxTreatment } from "../posting";
import { firstOpenDate } from "../periods";
import { EVENT_TICKET_LEDGER_SELECT } from "../source-projections";
import { formatInvoiceNumber } from "@/lib/invoices/format-invoice-number";
import { OLUNE_CODE_ALIASES, type DraftJournal, type JournalSourceType } from "../types";
import { fetchAll, loadBooksContext, type BooksContext } from "./data";
import { isDuplicateSource, postJournal, undoJournal } from "./post";

type Row = Record<string, unknown>;

const SYNCED_SOURCES: JournalSourceType[] = ["invoice", "invoice_payment", "invoice_manual_payment", "refund", "order", "ticket"];

/** Hold manual-payment detection back this long, so a webhook that marks an
 *  invoice paid and then writes its payments row isn't caught in between. */
const MANUAL_PAYMENT_GRACE_MS = 15 * 60 * 1000;

type Existing = { id: string; date: string; hash: string | null; journalNumber: number; grossCents: number | null };

export type SyncReport = {
  posted: number;
  reposted: number;
  undone: number;
  skipped: number;
  errors: { source: string; id: string; message: string }[];
  createdAccounts: string[];
};

const dateOf = (v: unknown): string | null => (typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null);

export async function syncStudioLedger(
  supabase: SupabaseClient,
  studioId: string,
  opts: { userId?: string | null; force?: boolean; minIntervalMs?: number } = {},
): Promise<SyncReport | null> {
  const ctx = await loadBooksContext(supabase, studioId);
  if (!ctx || !ctx.settings.autoPost) return null;

  if (!opts.force && ctx.settings.lastSyncedAt) {
    const age = Date.now() - Date.parse(ctx.settings.lastSyncedAt);
    if (age < (opts.minIntervalMs ?? 120_000)) return null;
  }

  const report: SyncReport = { posted: 0, reposted: 0, undone: 0, skipped: 0, errors: [], createdAccounts: [] };
  try {
    await runSync(supabase, ctx, report, opts.userId ?? null);
    await supabase
      .from("ledger_settings")
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_error: report.errors.length ? `${report.errors.length} item(s) could not be posted: ${report.errors[0].message}`.slice(0, 500) : null,
      })
      .eq("studio_id", studioId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    await supabase.from("ledger_settings").update({ last_synced_at: new Date().toISOString(), last_sync_error: message.slice(0, 500) }).eq("studio_id", studioId);
    report.errors.push({ source: "sync", id: studioId, message });
  }
  return report;
}

async function runSync(supabase: SupabaseClient, ctx: BooksContext, report: SyncReport, userId: string | null) {
  const { settings } = ctx;
  const studioId = settings.studioId;
  const since = settings.conversionDate;

  // ── Existing journals for synced sources ───────────────────────────────────
  const existingRows = await fetchAll<Row>((from, to) =>
    supabase
      .from("ledger_journals")
      .select("id, date, journal_number, source_type, source_id, source_hash, gross_cents")
      .eq("studio_id", studioId)
      .eq("status", "posted")
      .is("superseded_by", null)
      .in("source_type", SYNCED_SOURCES)
      .range(from, to),
  );
  const existing = new Map<string, Existing>();
  for (const r of existingRows) {
    existing.set(`${r.source_type}:${r.source_id}`, {
      id: r.id as string,
      date: r.date as string,
      hash: (r.source_hash as string | null) ?? null,
      journalNumber: Number(r.journal_number),
      grossCents: r.gross_cents == null ? null : Number(r.gross_cents),
    });
  }

  // ── Source documents ───────────────────────────────────────────────────────
  const [invoices, payments, orders, tickets] = await Promise.all([
    fetchAll<Row>((from, to) =>
      supabase
        .from("invoices")
        .select(
          "id, invoice_number, status, amount_cents, gst_cents, tax_inclusive, issued_at, created_at, paid_at, term_payment_plan_id, payer:profiles!payer_id ( full_name ), invoice_line_items ( description, line_total_cents, account_code, tax_treatment, tax_rate_bp, sort_order )",
        )
        .eq("studio_id", studioId)
        .in("status", ["sent", "overdue", "paid", "refunded", "void"])
        .gte("created_at", `${since}T00:00:00Z`)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row>((from, to) =>
      supabase
        .from("payments")
        .select("id, invoice_id, term_payment_plan_id, amount_cents, status, description, stripe_payment_intent_id, created_at, payer:profiles!payer_id ( full_name )")
        .eq("studio_id", studioId)
        .in("status", ["succeeded", "refunded"])
        .gte("created_at", `${since}T00:00:00Z`)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row>((from, to) =>
      supabase
        .from("orders")
        .select("id, status, total_cents, created_at, stripe_payment_intent_id, user:profiles!user_id ( full_name ), order_items ( qty, unit_price, products ( name, catalogue:billing_products ( account_code, tax_treatment, tax_rate_bp ) ) )")
        .eq("studio_id", studioId)
        .in("status", ["paid", "refunded"])
        .gte("created_at", `${since}T00:00:00Z`)
        .order("created_at")
        .range(from, to),
    ),
    fetchAll<Row>((from, to) =>
      supabase
        .from("event_tickets")
        .select(EVENT_TICKET_LEDGER_SELECT)
        .eq("events.studio_id", studioId)
        .in("status", ["paid", "refunded"])
        .gte("purchased_at", `${since}T00:00:00Z`)
        .order("purchased_at")
        .range(from, to),
    ),
  ]);

  // ── Make sure every revenue code in use exists on the chart ────────────────
  await ensureRevenueAccounts(supabase, ctx, invoices, orders, report);

  const name = (r: Row, key: string) => ((r[key] as { full_name?: string } | null)?.full_name ?? null) as string | null;

  // One upsert routine for every source: post if new, re-post if changed,
  // undo if it should no longer exist.
  const reconcile = async (key: string, draft: DraftJournal | null, label: string, sourceId: string) => {
    const prior = existing.get(key);
    try {
      if (!draft) {
        if (prior) {
          await undoJournal(supabase, prior, settings.lockDate, `${label} no longer applies`, userId);
          existing.delete(key);
          report.undone++;
        }
        return;
      }
      const hash = fingerprint({
        d: draft.date,
        s: draft.settlesJournalId ?? null,
        l: draft.lines.map((l) => [l.accountId, l.debitCents, l.creditCents, l.taxRateId ?? null, l.taxCents ?? 0]),
      });
      if (prior && prior.hash === hash) {
        report.skipped++;
        return;
      }
      const postDate = firstOpenDate(settings.lockDate, draft.date);
      const toPost: DraftJournal = {
        ...draft,
        date: postDate,
        sourceHash: hash,
        narration: postDate !== draft.date ? `${draft.narration} (dated ${draft.date}; period locked)` : draft.narration,
      };
      if (prior) {
        await undoJournal(supabase, prior, settings.lockDate, `${label} changed`, userId);
        existing.delete(key);
      }
      const id = await postJournal(supabase, studioId, toPost);
      existing.set(key, { id, date: postDate, hash, journalNumber: 0, grossCents: draft.grossCents ?? null });
      if (prior) report.reposted++;
      else report.posted++;
    } catch (err) {
      if (isDuplicateSource(err)) {
        report.skipped++;
        return;
      }
      report.errors.push({ source: label, id: sourceId, message: err instanceof Error ? err.message : String(err) });
    }
  };

  // ── Invoices ───────────────────────────────────────────────────────────────
  const invoiceById = new Map<string, Row>();
  for (const inv of invoices) {
    invoiceById.set(inv.id as string, inv);
    const date = dateOf(inv.issued_at) ?? dateOf(inv.created_at)!;
    if (date < since) continue;
    const lines = ((inv.invoice_line_items as Row[] | null) ?? [])
      .sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0))
      .map<SaleLineInput>((l) => ({
        description: (l.description as string) ?? "",
        lineTotalCents: Number(l.line_total_cents ?? 0),
        accountCode: (l.account_code as string | null) ?? null,
        taxTreatment: (l.tax_treatment as TaxTreatment | null) ?? null,
        taxRateBp: l.tax_rate_bp == null ? null : Number(l.tax_rate_bp),
      }));
    const reference = inv.invoice_number ? formatInvoiceNumber(Number(inv.invoice_number)) : `INV-${(inv.id as string).slice(0, 8)}`;
    const draft =
      inv.status === "void"
        ? null
        : invoiceJournal(ctx.chart, {
            id: inv.id as string,
            reference,
            date,
            contactName: name(inv, "payer"),
            taxInclusive: inv.tax_inclusive !== false,
            amountCents: Number(inv.amount_cents ?? 0),
            gstCents: Number(inv.gst_cents ?? 0),
            lines,
          });
    await reconcile(`invoice:${inv.id}`, draft, "Invoice", inv.id as string);
  }

  // Term-plan invoices, earliest first, for routing plan instalments.
  const planInvoices = new Map<string, string[]>();
  for (const inv of invoices) {
    const plan = inv.term_payment_plan_id as string | null;
    if (!plan || inv.status === "void") continue;
    const list = planInvoices.get(plan) ?? [];
    list.push(inv.id as string);
    planInvoices.set(plan, list);
  }

  // ── Card / Stripe payments and refunds ─────────────────────────────────────
  const paidDirect = new Map<string, number>();
  const intentToSale = new Map<string, string>();
  for (const o of orders) if (o.stripe_payment_intent_id) intentToSale.set(o.stripe_payment_intent_id as string, `order:${o.id}`);
  for (const t of tickets) if (t.stripe_payment_intent_id) intentToSale.set(t.stripe_payment_intent_id as string, `ticket:${t.id}`);

  // Cash sales first, so refunds can find them.
  for (const o of orders) {
    const date = dateOf(o.created_at)!;
    const items = ((o.order_items as Row[] | null) ?? []).map<SaleLineInput>((it) => {
      const product = it.products as { name?: string; catalogue?: { account_code?: string | null; tax_treatment?: string | null; tax_rate_bp?: number | null } | null } | null;
      return {
        description: product?.name ?? "Merchandise",
        lineTotalCents: Number(it.qty ?? 1) * Number(it.unit_price ?? 0),
        accountCode: product?.catalogue?.account_code ?? ctx.chart.maybeAccount("sales")?.code ?? null,
        taxTreatment: (product?.catalogue?.tax_treatment as TaxTreatment | null) ?? "standard",
        taxRateBp: product?.catalogue?.tax_rate_bp ?? null,
      };
    });
    // An order's total can include things its item rows don't (a discount,
    // shipping). When they disagree, book the order as one sale for its real
    // total rather than fail it.
    const total = Number(o.total_cents ?? 0);
    const itemsTotal = items.reduce((sum, it) => sum + it.lineTotalCents, 0);
    const draft = cashSaleJournal(ctx.chart, {
      sourceType: "order",
      id: o.id as string,
      reference: `ORD-${(o.id as string).slice(0, 8)}`,
      date,
      contactName: name(o, "user"),
      // Checkout never adds tax on top, so what the customer paid is the gross
      // whatever the studio's pricing posture is today (audit D-01).
      taxInclusive: true,
      amountCents: total,
      lines: Math.abs(itemsTotal - total) <= 1 ? items : [],
    });
    await reconcile(`order:${o.id}`, draft, "Shop order", o.id as string);
  }

  for (const t of tickets) {
    const event = t.events as { name?: string } | null;
    const date = dateOf(t.purchased_at)!;
    const draft = cashSaleJournal(ctx.chart, {
      sourceType: "ticket",
      id: t.id as string,
      reference: `TKT-${(t.id as string).slice(0, 8)}`,
      date,
      contactName: name(t, "user"),
      taxInclusive: true, // see the order above (audit D-01)
      amountCents: Number(t.total_cents ?? 0),
      lines: [
        {
          description: `${event?.name ?? "Event"} — ticket${Number(t.quantity) > 1 ? ` ×${t.quantity}` : ""}`,
          lineTotalCents: Number(t.total_cents ?? 0),
          accountCode: null,
          taxTreatment: "standard",
          taxRateBp: null,
        },
      ],
    });
    await reconcile(`ticket:${t.id}`, draft, "Event ticket", t.id as string);
  }

  const clearing = ctx.chart.account("stripe_clearing");

  for (const p of payments) {
    const amount = Number(p.amount_cents ?? 0);
    const date = dateOf(p.created_at)!;
    const invoiceId = (p.invoice_id as string | null) ?? null;
    const payer = name(p, "payer");

    if (p.status === "succeeded" && amount > 0) {
      let settles: string | null = null;
      let target: string | null = invoiceId;
      if (invoiceId) {
        paidDirect.set(invoiceId, (paidDirect.get(invoiceId) ?? 0) + amount);
      } else if (p.term_payment_plan_id) {
        target = planInvoices.get(p.term_payment_plan_id as string)?.[0] ?? null;
      }
      if (target) settles = existing.get(`invoice:${target}`)?.id ?? null;
      const inv = target ? invoiceById.get(target) : null;
      const draft = settlementJournal(ctx.chart, {
        sourceType: "invoice_payment",
        id: p.id as string,
        date,
        amountCents: amount,
        bankAccountId: clearing.id,
        settlesJournalId: settles,
        reference: inv?.invoice_number ? formatInvoiceNumber(Number(inv.invoice_number)) : null,
        contactName: payer,
        narration: `Card payment${inv?.invoice_number ? ` for ${formatInvoiceNumber(Number(inv.invoice_number))}` : ""}${payer ? ` — ${payer}` : ""}`,
      });
      await reconcile(`invoice_payment:${p.id}`, draft, "Payment", p.id as string);
      continue;
    }

    if (p.status === "refunded" && amount < 0) {
      let originalKey: string | null = invoiceId ? `invoice:${invoiceId}` : null;
      if (!originalKey && p.stripe_payment_intent_id) originalKey = intentToSale.get(p.stripe_payment_intent_id as string) ?? null;
      const original = originalKey ? existing.get(originalKey) : undefined;
      const originalLines = original ? await loadLines(supabase, original.id) : null;
      const draft = refundJournal(ctx.chart, {
        id: p.id as string,
        date,
        refundCents: -amount,
        original: original && originalLines ? { grossCents: original.grossCents ?? 0, lines: originalLines } : null,
        reference: (p.description as string | null) ?? null,
        contactName: payer,
        narration: `${(p.description as string | null) ?? "Refund"}${payer ? ` — ${payer}` : ""}`,
        taxInclusive: settings.pricesIncludeTax,
      });
      await reconcile(`refund:${p.id}`, draft, "Refund", p.id as string);
    }
  }

  // ── Invoices marked paid without a card payment (cash, bank transfer) ──────
  const undeposited = ctx.chart.account("undeposited");
  for (const inv of invoices) {
    const id = inv.id as string;
    const status = inv.status as string;
    if (inv.term_payment_plan_id) continue;
    const paidAt = (inv.paid_at as string | null) ?? null;
    const amount = Number(inv.amount_cents ?? 0);
    const remaining = amount - (paidDirect.get(id) ?? 0);
    const isPaid = (status === "paid" || status === "refunded") && !!paidAt;
    const settledLongEnough = paidAt ? Date.now() - Date.parse(paidAt) > MANUAL_PAYMENT_GRACE_MS : false;
    const wanted = isPaid && remaining > 0;
    if (wanted && !settledLongEnough) continue; // too fresh to call
    const draft = wanted
      ? settlementJournal(ctx.chart, {
          sourceType: "invoice_manual_payment",
          id,
          date: dateOf(paidAt)!,
          amountCents: remaining,
          bankAccountId: undeposited.id,
          settlesJournalId: existing.get(`invoice:${id}`)?.id ?? null,
          reference: inv.invoice_number ? formatInvoiceNumber(Number(inv.invoice_number)) : null,
          contactName: name(inv, "payer"),
          narration: `Payment received${inv.invoice_number ? ` for ${formatInvoiceNumber(Number(inv.invoice_number))}` : ""} (marked paid)`,
        })
      : null;
    await reconcile(`invoice_manual_payment:${id}`, draft, "Manual payment", id);
  }
}

async function loadLines(supabase: SupabaseClient, journalId: string): Promise<PostedLine[]> {
  const { data, error } = await supabase
    .from("ledger_journal_lines")
    .select("account_id, debit_cents, credit_cents, tax_rate_id, tax_cents, is_tax_line, description")
    .eq("journal_id", journalId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((l) => ({
    accountId: l.account_id as string,
    debitCents: Number(l.debit_cents),
    creditCents: Number(l.credit_cents),
    taxRateId: (l.tax_rate_id as string | null) ?? null,
    taxCents: Number(l.tax_cents),
    isTaxLine: !!l.is_tax_line,
    description: (l.description as string | null) ?? null,
  }));
}

/**
 * Invoice lines carry the account_code that was set on the class or product.
 * If the chart doesn't have that code (it was set up for Xero, say), create a
 * revenue account for it rather than silently lumping it into the default —
 * the dashboard flags auto-created accounts for the studio to name.
 */
async function ensureRevenueAccounts(supabase: SupabaseClient, ctx: BooksContext, invoices: Row[], orders: Row[], report: SyncReport) {
  const codes = new Set<string>();
  for (const inv of invoices) {
    for (const l of (inv.invoice_line_items as Row[] | null) ?? []) {
      const code = (l.account_code as string | null)?.trim();
      if (code) codes.add(code);
    }
  }
  for (const o of orders) {
    for (const it of (o.order_items as Row[] | null) ?? []) {
      const code = ((it.products as { catalogue?: { account_code?: string | null } | null } | null)?.catalogue?.account_code ?? "").trim();
      if (code) codes.add(code);
    }
  }
  const missing = [...codes].filter((c) => !ctx.chart.byCode.has(c.toUpperCase()) && !(c in OLUNE_CODE_ALIASES)).slice(0, 50);
  if (!missing.length) return;

  const salesRate = ctx.chart.salesRateFor("standard", null);
  const { data, error } = await supabase
    .from("ledger_accounts")
    .insert(
      missing.map((code) => ({
        studio_id: ctx.settings.studioId,
        code: code.slice(0, 20),
        name: `Revenue (code ${code})`.slice(0, 150),
        type: "revenue",
        subtype: "revenue",
        default_tax_rate_id: salesRate?.id ?? null,
        auto_created: true,
      })),
    )
    .select("id, code, name, type, subtype, system_key, description, default_tax_rate_id, bank_kind, bank_number, is_archived, auto_created");
  if (error) {
    report.errors.push({ source: "chart", id: missing.join(","), message: error.message });
    return;
  }
  for (const r of data ?? []) {
    const account = {
      id: r.id as string,
      code: r.code as string,
      name: r.name as string,
      type: "revenue" as const,
      subtype: "revenue" as const,
      systemKey: null,
      description: null,
      defaultTaxRateId: (r.default_tax_rate_id as string | null) ?? null,
      bankKind: null,
      bankNumber: null,
      isArchived: false,
      autoCreated: true,
    };
    ctx.accounts.push(account);
    ctx.chart.byId.set(account.id, account);
    ctx.chart.byCode.set(account.code.toUpperCase(), account);
    report.createdAccounts.push(account.code);
  }
}
