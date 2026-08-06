// ============================================================================
//  Quoting and invoicing a dancer's enrolment, under whichever model the studio
//  charges on.
//
//  Two callers had grown near-identical copies of the same 60 lines — the
//  parent enrol flow and the admin's "bill this student" action — which meant
//  any change to how a line freezes its price had to be made twice or silently
//  diverge. One builder now, and it's the only place that knows how a
//  TuitionQuote becomes invoice rows.
//
//  Pricing itself is in lib/billing/tuition-quote.ts, which is pure. This file
//  is the part that has to talk to the database: read the studio's model, read
//  what the dancer is already enrolled in and already owes, then write.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadStudioTaxSettings } from "./catalog";
import { totalInvoice } from "./tax";
import { loadStudioTuitionContext, type StudioTuitionContext } from "./tuition-model";
import { currentTuitionPeriod, invoicedTuitionCents, TUITION_HOURS_ITEM_TYPE } from "./tuition-ledger";
import { quoteTuition, type QuoteClass, type TuitionQuote } from "./tuition-quote";
import { loadStudioClassPrices, type ClassPriceRow } from "@/lib/enrollment-class-price";
import { siblingDiscountInfo } from "@/lib/discounts";
import { studioLocalYmdOffset } from "@/lib/date/studio-date";
import { xeroSyncOutstandingInvoice } from "@/lib/xero/webhook-sync";

function toQuoteClass(row: ClassPriceRow): QuoteClass {
  return {
    classId: row.id,
    name: row.name,
    productId: row.productId,
    priceCents: row.priceCents,
    hours: row.hours,
    recurringGroupId: row.recurringGroupId,
  };
}

/**
 * What the dancer is already actively enrolled in, EXCLUDING this batch.
 *
 * The exclusion is load-bearing, not defensive. Step3Review's enrollAll()
 * inserts every selected class's enrollment row as active before billing runs,
 * so a plain "what are they in" read includes the classes being paid for right
 * now — which zeroes every day of a linked series in per-class mode, and makes
 * an hours top-up $0.
 */
async function loadExistingClasses(
  supabase: SupabaseClient,
  studioId: string,
  studentId: string,
  excludeClassIds: string[],
): Promise<QuoteClass[]> {
  const { data } = await supabase
    .from("enrollments")
    .select("class_id")
    .eq("student_id", studentId)
    .eq("status", "active");

  const excluded = new Set(excludeClassIds);
  const ids = (data ?? [])
    .map((r) => r.class_id as string)
    .filter((id) => id && !excluded.has(id));

  if (!ids.length) return [];

  const rows = await loadStudioClassPrices(supabase, studioId, ids);
  return [...rows.values()].map(toQuoteClass);
}

export type EnrollmentQuoteOptions = {
  /** Self-managed adults get no sibling discount — there's no sibling. */
  mode: "parent" | "self" | null;
  /** Who pays, for resolving the sibling discount. */
  payerId: string;
  /** Skip the sibling discount regardless (admin billing a self-payer). */
  applySiblingDiscount?: boolean;
  /** Reuse an already-loaded context rather than hitting the DB again. */
  context?: StudioTuitionContext;
};

export type EnrollmentQuote = {
  quote: TuitionQuote;
  /** Class rows for the classes being added, keyed by id, for line codes. */
  priced: Map<string, ClassPriceRow>;
};

/**
 * Price an enrolment. Server-authoritative throughout: every price, enrolment
 * and prior invoice is read here, never accepted from the caller.
 *
 * Returns null when a class id doesn't belong to this studio.
 */
export async function quoteEnrollment(
  supabase: SupabaseClient,
  studioId: string,
  studentId: string,
  classIds: string[],
  opts: EnrollmentQuoteOptions,
): Promise<EnrollmentQuote | null> {
  const priced = await loadStudioClassPrices(supabase, studioId, classIds);
  if (priced.size !== new Set(classIds).size) return null;

  const context = opts.context ?? (await loadStudioTuitionContext(supabase, studioId));
  const adding = classIds.map((id) => toQuoteClass(priced.get(id)!));
  const existing = await loadExistingClasses(supabase, studioId, studentId, classIds);

  // Only the hours model prices the dancer's whole week, so only it needs to
  // know what the week has already cost.
  let priorInvoicedCents = 0;
  if (context.model === "hours") {
    const period = await currentTuitionPeriod(supabase, studioId);
    priorInvoicedCents = await invoicedTuitionCents(supabase, studioId, studentId, period);
  }

  // Resolved here rather than inside quoteTuition so the pure layer stays free
  // of Supabase. The percentage is applied once to the whole quote.
  let siblingDiscountPct = 0;
  const wantsSibling = opts.applySiblingDiscount ?? opts.mode !== "self";
  if (wantsSibling) {
    const info = await siblingDiscountInfo(supabase, studioId, opts.payerId, studentId, 10_000);
    siblingDiscountPct = info.applies ? info.pct : 0;
  }

  const quote = quoteTuition({
    model: context.model,
    adding,
    existing,
    ladder: context.ladder,
    ladderProductId: context.ladderProduct?.id ?? null,
    ladderProductName: context.ladderProduct?.name,
    combos: context.combos,
    priorInvoicedCents,
    siblingDiscountPct,
  });

  return { quote, priced };
}

type InvoiceLineRow = {
  item_type: string;
  reference_id: string | null;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_cents: number;
  line_total_cents: number;
  sort_order: number;
  account_code: string | null;
  item_code: string | null;
  tax_treatment: string;
  tax_rate_bp: number;
  unit_label: string | null;
};

/**
 * Turn a quote into invoice line rows, freezing each line's ledger codes and
 * tax treatment at issue time.
 *
 * That freeze is the 0082/0083 rule extended to price and tax: re-coding or
 * re-pricing a product later must never rewrite an invoice a family has
 * already been sent.
 *
 * The hours line carries quantity 1, not the hours. `unit_cents × quantity`
 * has to equal `line_total_cents`, and $230 over 3 hours doesn't divide into
 * whole cents — so the hours live in the label and description, and the money
 * lives in the money columns.
 */
export function quoteToInvoiceLines(
  quote: TuitionQuote,
  priced: Map<string, ClassPriceRow>,
  context: Pick<StudioTuitionContext, "ladderProduct">,
): InvoiceLineRow[] {
  const ladder = context.ladderProduct;

  return quote.lines
    // Zero-priced combo detail lines stay: they're what tells a family which
    // classes the combo covered. A zero class line means "included in a
    // programme they already pay for" and is equally worth showing.
    .map((line, idx): InvoiceLineRow => {
      const classRow = line.classId ? priced.get(line.classId) : undefined;

      if (line.kind === "hours") {
        return {
          item_type: TUITION_HOURS_ITEM_TYPE,
          reference_id: null,
          product_id: ladder?.id ?? null,
          description: line.description,
          quantity: 1,
          unit_cents: line.chargeCents,
          line_total_cents: line.chargeCents,
          sort_order: idx,
          account_code: ladder?.accountCode ?? null,
          item_code: ladder?.itemCode ?? null,
          tax_treatment: ladder?.taxTreatment ?? "standard",
          tax_rate_bp: ladder?.taxRateBp ?? 1500,
          unit_label: ladder?.unitLabel ?? "hrs/week",
        };
      }

      return {
        item_type: line.kind,
        reference_id: line.classId,
        product_id: line.productId,
        description: line.description,
        quantity: 1,
        unit_cents: line.chargeCents,
        line_total_cents: line.chargeCents,
        sort_order: idx,
        account_code: classRow?.accountCode ?? null,
        item_code: classRow?.itemCode ?? null,
        tax_treatment: classRow?.taxTreatment ?? "standard",
        tax_rate_bp: classRow?.taxRateBp ?? 1500,
        unit_label: null,
      };
    });
}

export type InsertTuitionInvoiceResult =
  | { ok: true; invoiceId: string }
  | { ok: false; error: string };

/**
 * Write a quote out as one invoice with one line per quote line.
 *
 * `sendNow` distinguishes true pay-later (draft, an admin reviews and sends it)
 * from pay-now and pay-monthly, where the family is already being charged as
 * part of enrolling and there's no meaningful draft moment. Either way it syncs
 * to Xero as a draft immediately; sending later flips that draft to Authorised
 * rather than creating a second copy.
 */
export async function insertTuitionInvoice(
  supabase: SupabaseClient,
  args: {
    studioId: string;
    payerId: string;
    studentId: string;
    quote: TuitionQuote;
    priced: Map<string, ClassPriceRow>;
    context: Pick<StudioTuitionContext, "ladderProduct">;
    sendNow: boolean;
    xeroDescription?: string;
    fallbackError: string;
  },
): Promise<InsertTuitionInvoiceResult> {
  const lines = quoteToInvoiceLines(args.quote, args.priced, args.context);
  const taxSettings = await loadStudioTaxSettings(supabase, args.studioId);
  const now = new Date().toISOString();

  const totals = totalInvoice(
    lines.map((l) => ({
      lineTotalCents: l.line_total_cents,
      taxTreatment: l.tax_treatment as "standard" | "zero_rated" | "exempt",
      taxRateBp: l.tax_rate_bp,
    })),
    { inclusive: taxSettings.pricesIncludeTax, registered: taxSettings.gstRegistered },
  );

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      studio_id: args.studioId,
      payer_id: args.payerId,
      student_id: args.studentId,
      amount_cents: totals.totalCents,
      subtotal_cents: totals.subtotalCents,
      gst_cents: totals.taxCents,
      tax_inclusive: taxSettings.pricesIncludeTax,
      status: args.sendNow ? "sent" : "draft",
      due_date: studioLocalYmdOffset(7),
      issued_at: args.sendNow ? now : null,
    })
    .select("id")
    .single();

  if (invErr || !invoice) return { ok: false, error: invErr?.message ?? args.fallbackError };

  const invoiceId = invoice.id as string;

  const { error: lineErr } = await supabase
    .from("invoice_line_items")
    .insert(lines.map((l) => ({ ...l, invoice_id: invoiceId })));

  if (lineErr) return { ok: false, error: lineErr.message };

  await xeroSyncOutstandingInvoice(supabase, invoiceId, {
    lineDescription: args.xeroDescription ?? "Enrollment",
  });

  return { ok: true, invoiceId };
}
