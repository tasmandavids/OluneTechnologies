// ============================================================================
//  What a dancer has already been invoiced for tuition this period.
//
//  Only the hours model needs this, and it's what makes the mid-term add work:
//  the ladder prices a dancer's WHOLE week, so a dancer moving from 2 hrs
//  ($170) to 3 hrs ($230) owes the $60 difference, not $230 again.
//
//  Deliberately derived from the invoices rather than kept in its own ledger
//  table. There is no transaction wrapper in this codebase — the enrolment
//  invoice write is three sequential inserts — so a separate ledger could be
//  written without its invoice, or an invoice without its ledger row, and the
//  next add would price off a number that disagrees with what the family
//  actually received. Reading the invoices back IS the state:
//
//    • a voided invoice stops counting, so the band is correctly owed again
//    • an unpaid one still counts, because it's still owed
//    • a retried submit finds the first invoice and charges nothing
//
//  and "why was I charged $60?" is answered by two rows the parent can already
//  see in their own billing history.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { studioLocalYmd } from "@/lib/date/studio-date";

/** invoice_line_items.item_type for the single hours-ladder tuition line. */
export const TUITION_HOURS_ITEM_TYPE = "tuition_hours";

export type TuitionPeriod = {
  /** Inclusive ISO date. */
  from: string;
  /** Exclusive ISO date. */
  to: string;
  label: string;
};

function addMonth(ymd: string): string {
  const [y, m] = ymd.split("-").map(Number);
  const nextMonth = m === 12 ? 1 : m + 1;
  const nextYear = m === 12 ? y + 1 : y;
  return `${nextYear}-${String(nextMonth).padStart(2, "0")}-01`;
}

/**
 * The window a dancer's ladder tuition is measured over.
 *
 * A termly studio's period is the term containing today; a monthly studio's is
 * the calendar month. Both fall back to the calendar month, so a termly studio
 * that hasn't set up terms yet still bills coherently rather than treating
 * every enrolment as a fresh period.
 */
export async function currentTuitionPeriod(
  supabase: SupabaseClient,
  studioId: string,
): Promise<TuitionPeriod> {
  const { data: studio } = await supabase
    .from("studios")
    .select("billing_period, timezone")
    .eq("id", studioId)
    .maybeSingle();

  const today = studioLocalYmd((studio as { timezone?: string | null } | null)?.timezone ?? null);

  if ((studio as { billing_period?: string } | null)?.billing_period === "termly") {
    const { data: term } = await supabase
      .from("studio_terms")
      .select("name, start_date, end_date")
      .eq("studio_id", studioId)
      .lte("start_date", today)
      .gte("end_date", today)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (term) {
      return {
        from: term.start_date as string,
        // end_date is inclusive on studio_terms; the query below is exclusive.
        to: addDay(term.end_date as string),
        label: (term.name as string) ?? "This term",
      };
    }
  }

  const monthStart = `${today.slice(0, 7)}-01`;
  return { from: monthStart, to: addMonth(monthStart), label: "This month" };
}

function addDay(ymd: string): string {
  const date = new Date(`${ymd}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Hours-ladder tuition already invoiced for this dancer in this period.
 *
 * Voided invoices are excluded; everything else counts, paid or not. Readable
 * under a parent session via invoice_line_items_payer_read (0038/0047), so the
 * quote doesn't need elevated access.
 */
export async function invoicedTuitionCents(
  supabase: SupabaseClient,
  studioId: string,
  studentId: string,
  period: TuitionPeriod,
): Promise<number> {
  const { data } = await supabase
    .from("invoice_line_items")
    .select("line_total_cents, invoices!inner(id, student_id, studio_id, status, created_at)")
    .eq("item_type", TUITION_HOURS_ITEM_TYPE)
    .eq("invoices.student_id", studentId)
    .eq("invoices.studio_id", studioId)
    .neq("invoices.status", "void")
    .gte("invoices.created_at", `${period.from}T00:00:00Z`)
    .lt("invoices.created_at", `${period.to}T00:00:00Z`);

  return (data ?? []).reduce((sum, row) => sum + Number(row.line_total_cents ?? 0), 0);
}
