// ============================================================================
//  Bank reconciliation suggestions.
//
//  A statement line reconciles one of two ways:
//    match   it's money the ledger already knows about (a family's card
//            payment that Stripe paid out, a bill payment) — pick the
//            existing unreconciled line on that bank account
//    create  it's new (rent, a supplier direct debit, bank interest) — code it
//            to an account and post a bank journal
//
//  Matching requires the exact amount and ranks by date distance and shared
//  words. Suggestions are only ever suggestions: nothing reconciles without a
//  click.
// ============================================================================

export type MatchCandidate = {
  lineId: string;
  journalId: string;
  journalNumber: number;
  date: string;
  /** Signed effect on the bank account: debit − credit. */
  amountCents: number;
  narration: string;
  reference: string | null;
};

export type ScoredMatch = MatchCandidate & { score: number; daysApart: number };

const words = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );

export function suggestMatches(
  txn: { date: string; amountCents: number; description: string; reference: string | null },
  candidates: MatchCandidate[],
  maxDays = 14,
): ScoredMatch[] {
  const txnWords = words(`${txn.description} ${txn.reference ?? ""}`);
  const txnMs = Date.parse(txn.date);
  return candidates
    .filter((c) => c.amountCents === txn.amountCents)
    .map((c) => {
      const daysApart = Math.abs(Math.round((Date.parse(c.date) - txnMs) / 86_400_000));
      const cWords = words(`${c.narration} ${c.reference ?? ""}`);
      let shared = 0;
      for (const w of cWords) if (txnWords.has(w)) shared++;
      const score = Math.max(0, 100 - daysApart * 5) + shared * 15;
      return { ...c, daysApart, score };
    })
    .filter((c) => c.daysApart <= maxDays)
    .sort((a, b) => b.score - a.score);
}

/** A coding hint for common statement lines, so the studio rarely starts from blank. */
export type CodingHint = { kind: "stripe_payout" | "bank_fee" | "interest" | null };

export function codingHint(txn: { amountCents: number; description: string }): CodingHint {
  const d = txn.description.toLowerCase();
  if (txn.amountCents > 0 && /stripe/.test(d)) return { kind: "stripe_payout" };
  if (txn.amountCents < 0 && /(fee|charge|commission|frais|gebühr|comisi)/.test(d)) return { kind: "bank_fee" };
  if (txn.amountCents > 0 && /(interest|intérêt|zinsen|interés|interesse)/.test(d)) return { kind: "interest" };
  return { kind: null };
}
