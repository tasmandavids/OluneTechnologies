import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Badge, EmptyState, PageHeader } from "@/components/admin/books/ui";
import { BankImport } from "@/components/admin/books/BankImport";
import { BankReconcile, type ReconcileTxn } from "@/components/admin/books/BankReconcile";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { fetchAll, fetchMovements } from "@/lib/ledger/server/data";
import { addDays, todayIso } from "@/lib/ledger/periods";
import { codingHint, suggestMatches, type MatchCandidate } from "@/lib/ledger/reconcile";
import { normalBalance, toMovementMap } from "@/lib/ledger/reports";

export default async function BankPage({ searchParams }: { searchParams: Promise<{ account?: string; view?: string }> }) {
  const params = await searchParams;
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.bank");
  const { supabase, studioId } = session;

  const banks = ctx.accounts.filter((a) => a.subtype === "bank" && !a.isArchived);
  if (!banks.length) return <div className="mx-auto max-w-6xl p-6"><EmptyState title={t("noAccounts")} /></div>;
  const selected = banks.find((b) => b.id === params.account) ?? banks.find((b) => b.bankKind === "bank") ?? banks[0];
  const view = params.view === "reconciled" ? "reconciled" : "unreconciled";

  const [movements, counts, txns] = await Promise.all([
    fetchMovements(supabase, studioId, null, todayIso()),
    supabase.from("ledger_bank_transactions").select("account_id").eq("studio_id", studioId).eq("status", "unreconciled").limit(5000),
    supabase
      .from("ledger_bank_transactions")
      .select("id, date, description, reference, amount_cents, status, journal_id")
      .eq("studio_id", studioId)
      .eq("account_id", selected.id)
      .in("status", view === "reconciled" ? ["reconciled", "excluded"] : ["unreconciled"])
      .order("date", { ascending: view === "unreconciled" })
      .limit(view === "reconciled" ? 50 : 100),
  ]);
  const mv = toMovementMap(movements);
  const unreconciledBy = new Map<string, number>();
  for (const r of counts.data ?? []) unreconciledBy.set(r.account_id as string, (unreconciledBy.get(r.account_id as string) ?? 0) + 1);

  // Candidate ledger lines on this bank account that no statement line claims yet.
  let candidates: MatchCandidate[] = [];
  const rows = txns.data ?? [];
  if (view === "unreconciled" && rows.length) {
    const from = addDays(rows[0].date as string, -30);
    const to = addDays(rows[rows.length - 1].date as string, 30);
    const lines = await fetchAll<Record<string, unknown>>((a, b) =>
      supabase
        .from("ledger_journal_lines")
        .select("id, debit_cents, credit_cents, journal:ledger_journals!inner ( id, journal_number, date, narration, reference, status )")
        .eq("studio_id", studioId)
        .eq("account_id", selected.id)
        .is("reconciled_bank_txn_id", null)
        .eq("journal.status", "posted")
        .gte("journal.date", from)
        .lte("journal.date", to)
        .range(a, b),
    );
    candidates = lines.map((l) => {
      const j = l.journal as { id: string; journal_number: number; date: string; narration: string; reference: string | null };
      return { lineId: l.id as string, journalId: j.id, journalNumber: j.journal_number, date: j.date, amountCents: Number(l.debit_cents) - Number(l.credit_cents), narration: j.narration, reference: j.reference };
    });
  }

  const reconcileRows: ReconcileTxn[] = rows.map((r) => {
    const txn = { date: r.date as string, amountCents: Number(r.amount_cents), description: (r.description as string) ?? "", reference: (r.reference as string | null) ?? null };
    return {
      id: r.id as string,
      ...txn,
      status: r.status as ReconcileTxn["status"],
      journalId: (r.journal_id as string | null) ?? null,
      matches: view === "unreconciled" ? suggestMatches(txn, candidates).slice(0, 3) : [],
      hint: codingHint(txn).kind,
    };
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {banks.map((b) => (
          <Link key={b.id} href={`${BOOKS_PATH}/bank?account=${b.id}`}>
            <GlassPanel className={`!p-4 ${b.id === selected.id ? "ring-2 ring-(--brand)" : ""}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-ink">{b.name}</p>
                {(unreconciledBy.get(b.id) ?? 0) > 0 && <Badge tone="warn">{t("toReconcile", { count: unreconciledBy.get(b.id) ?? 0 })}</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">{t(`kinds.${b.bankKind ?? "bank"}`)}{b.bankNumber ? ` · ${b.bankNumber}` : ""}</p>
              <p className="mt-2 text-lg font-semibold text-ink">
                <Amount cents={normalBalance(b, mv.get(b.id))} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} />
              </p>
              <p className="text-xs text-muted">{t("ledgerBalance")}</p>
            </GlassPanel>
          </Link>
        ))}
      </div>

      <BankImport accountId={selected.id} accountName={selected.name} dateFallback={ctx.jurisdiction.code === "US" ? "mdy" : ctx.jurisdiction.code === "JP" || ctx.jurisdiction.code === "KR" ? "ymd" : "dmy"} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} />

      <div className="flex gap-1">
        {(["unreconciled", "reconciled"] as const).map((v) => (
          <Link
            key={v}
            href={`${BOOKS_PATH}/bank?account=${selected.id}&view=${v}`}
            className="rounded-[10px] px-3 py-1.5 text-xs font-semibold"
            style={{ color: v === view ? "var(--ink)" : "var(--muted)", background: v === view ? "var(--t3)" : "transparent", border: `1px solid ${v === view ? "var(--tb)" : "transparent"}` }}
          >
            {t(`views.${v}`)}
          </Link>
        ))}
      </div>

      <BankReconcile
        rows={reconcileRows}
        view={view}
        bankAccountId={selected.id}
        accounts={ctx.accounts.filter((a) => !a.isArchived && a.id !== selected.id)}
        rates={ctx.rates.filter((r) => !r.isArchived)}
        taxRegistered={ctx.settings.taxRegistered}
        stripeClearingId={ctx.chart.maybeAccount("stripe_clearing")?.id ?? null}
        bankFeesId={ctx.chart.maybeAccount("bank_fees")?.id ?? null}
        interestId={ctx.accounts.find((a) => a.subtype === "other_income")?.id ?? null}
        currency={ctx.settings.baseCurrency}
        locale={ctx.jurisdiction.locale}
      />
    </div>
  );
}
