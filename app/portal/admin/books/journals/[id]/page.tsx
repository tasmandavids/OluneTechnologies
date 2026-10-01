import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Badge, PageHeader, rowStyle, tableClass, tdClass, thClass } from "@/components/admin/books/ui";
import { VoidJournalButton } from "@/components/admin/books/VoidJournalButton";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import type { JournalSourceType } from "@/lib/ledger/types";

const VOIDABLE = new Set(["manual", "opening_balance", "bank", "transfer", "tax_settlement"]);

export default async function JournalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.journals");
  const ts = await getTranslations("books.sources");

  const { data: j } = await session.supabase
    .from("ledger_journals")
    .select("id, journal_number, date, narration, reference, source_type, source_id, tax_timing, status, superseded_by, reverses_journal_id, contact_name, void_reason, voided_at, created_at, ledger_journal_lines ( id, line_no, account_id, description, debit_cents, credit_cents, tax_rate_id, tax_cents, is_tax_line, reconciled_bank_txn_id )")
    .eq("id", id)
    .eq("studio_id", session.studioId)
    .maybeSingle();
  if (!j) notFound();

  type L = { id: string; line_no: number; account_id: string; description: string | null; debit_cents: number; credit_cents: number; tax_rate_id: string | null; tax_cents: number; is_tax_line: boolean; reconciled_bank_txn_id: string | null };
  const lines = ((j.ledger_journal_lines as L[]) ?? []).sort((a, b) => a.line_no - b.line_no);
  const totalDebit = lines.reduce((s, l) => s + Number(l.debit_cents), 0);
  const totalCredit = lines.reduce((s, l) => s + Number(l.credit_cents), 0);
  const money = (c: number) => <Amount cents={c} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} blankZero />;
  const sourceType = j.source_type as JournalSourceType;
  const sourceLink =
    sourceType === "invoice" ? `/portal/admin/money?tab=invoices&invoice=${j.source_id}` : sourceType === "bill" ? `${BOOKS_PATH}/bills/${j.source_id}` : sourceType === "reversal" ? `${BOOKS_PATH}/journals/${j.source_id}` : null;

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <PageHeader
        title={t("detailTitle", { number: j.journal_number as number })}
        subtitle={
          <>
            {j.date as string} · {ts(sourceType)}
            {j.reference ? ` · ${j.reference}` : ""}
          </>
        }
        actions={j.status === "posted" && !j.superseded_by && VOIDABLE.has(sourceType) ? <VoidJournalButton journalId={j.id as string} /> : null}
      />

      <div className="flex flex-wrap gap-2">
        {j.status === "voided" && <Badge tone="bad">{t("voidedOn", { date: String(j.voided_at).slice(0, 10), reason: (j.void_reason as string) ?? "" })}</Badge>}
        {j.superseded_by && (
          <Link href={`${BOOKS_PATH}/journals/${j.superseded_by}`}>
            <Badge tone="warn">{t("reversedBy")}</Badge>
          </Link>
        )}
        <Badge>{t(`timing.${j.tax_timing as string}`)}</Badge>
        {sourceLink && (
          <Link href={sourceLink} className="text-xs font-semibold text-[--brand]">
            {t("openSource")}
          </Link>
        )}
      </div>

      <GlassPanel className="!p-5">
        <p className="text-sm text-ink">{j.narration as string}</p>
        {j.contact_name ? <p className="mt-1 text-xs text-muted">{j.contact_name as string}</p> : null}
        {!VOIDABLE.has(sourceType) && j.status === "posted" && <p className="mt-2 text-xs text-muted">{t("autoNote")}</p>}
      </GlassPanel>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>{t("account")}</th>
                <th className={thClass}>{t("description")}</th>
                <th className={thClass}>{t("taxRate")}</th>
                <th className={`${thClass} text-right`}>{t("debit")}</th>
                <th className={`${thClass} text-right`}>{t("credit")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const a = ctx.chart.byId.get(l.account_id);
                const r = l.tax_rate_id ? ctx.rates.find((x) => x.id === l.tax_rate_id) : null;
                return (
                  <tr key={l.id} style={rowStyle}>
                    <td className={tdClass}>
                      <span className="tabular-nums text-muted">{a?.code}</span> {a?.name}
                      {l.reconciled_bank_txn_id && <span className="ml-2"><Badge tone="good">{t("reconciled")}</Badge></span>}
                    </td>
                    <td className={`${tdClass} max-w-[300px] truncate text-muted`}>{l.is_tax_line ? t("taxLine") : l.description ?? ""}</td>
                    <td className={`${tdClass} text-muted`}>{r ? `${r.name}${Number(l.tax_cents) ? ` · ` : ""}` : ""}{r && Number(l.tax_cents) ? <Amount cents={Number(l.tax_cents)} currency={ctx.settings.baseCurrency} locale={ctx.jurisdiction.locale} /> : null}</td>
                    <td className={`${tdClass} text-right`}>{money(Number(l.debit_cents))}</td>
                    <td className={`${tdClass} text-right`}>{money(Number(l.credit_cents))}</td>
                  </tr>
                );
              })}
              <tr style={rowStyle}>
                <td className={`${tdClass} font-semibold`} colSpan={3}>
                  {t("total")}
                </td>
                <td className={`${tdClass} text-right font-semibold`}>{money(totalDebit)}</td>
                <td className={`${tdClass} text-right font-semibold`}>{money(totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
}
