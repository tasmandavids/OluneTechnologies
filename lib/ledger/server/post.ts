import "server-only";

// ============================================================================
//  Writing journals. One door, so every journal is validated the same way in
//  app code before the database validates it again.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { assertPostable } from "../posting";
import { firstOpenDate, todayIso } from "../periods";
import type { DraftJournal } from "../types";

export class LedgerPostError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

/** Unique violation on ledger_journals_source_key: someone else posted it first. */
export function isDuplicateSource(err: unknown): boolean {
  return err instanceof LedgerPostError && err.code === "23505";
}

export async function postJournal(supabase: SupabaseClient, studioId: string, draft: DraftJournal): Promise<string> {
  assertPostable(draft);
  const header = {
    date: draft.date,
    narration: draft.narration.slice(0, 500),
    reference: draft.reference ?? "",
    source_type: draft.sourceType,
    source_id: draft.sourceId ?? "",
    source_hash: draft.sourceHash ?? "",
    tax_timing: draft.taxTiming,
    gross_cents: draft.grossCents ?? "",
    settles_journal_id: draft.settlesJournalId ?? "",
    settles_amount_cents: draft.settlesAmountCents ?? "",
    contact_name: draft.contactName ?? "",
  };
  const lines = draft.lines.map((l) => ({
    account_id: l.accountId,
    description: l.description ?? "",
    debit_cents: Math.round(l.debitCents),
    credit_cents: Math.round(l.creditCents),
    tax_rate_id: l.taxRateId ?? "",
    tax_cents: Math.round(l.taxCents ?? 0),
    is_tax_line: !!l.isTaxLine,
    contact_name: l.contactName ?? "",
  }));
  const { data, error } = await supabase.rpc("ledger_post_journal", { p_studio_id: studioId, p_header: header, p_lines: lines });
  if (error) throw new LedgerPostError(error.message, error.code);
  return data as string;
}

/**
 * Undo a journal: void it if its date is still open, otherwise post a
 * reversal on the first open day. Returns how it was undone.
 */
export async function undoJournal(
  supabase: SupabaseClient,
  journal: { id: string; date: string; journalNumber?: number },
  lockDate: string | null,
  reason: string,
  userId: string | null,
): Promise<"voided" | "reversed"> {
  if (!lockDate || journal.date > lockDate) {
    const { error } = await supabase
      .from("ledger_journals")
      .update({ status: "voided", voided_at: new Date().toISOString(), voided_by: userId, void_reason: reason.slice(0, 300) })
      .eq("id", journal.id)
      .eq("status", "posted");
    if (error) throw new LedgerPostError(error.message, error.code);
    return "voided";
  }
  const date = firstOpenDate(lockDate, todayIso());
  const { error } = await supabase.rpc("ledger_reverse_journal", {
    p_journal_id: journal.id,
    p_date: date,
    p_narration: `Reversal${journal.journalNumber ? ` of #${journal.journalNumber}` : ""}: ${reason}`.slice(0, 500),
  });
  if (error) throw new LedgerPostError(error.message, error.code);
  return "reversed";
}
