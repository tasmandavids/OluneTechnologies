// ============================================================================
//  Olune Books dashboard — where the money stands, what needs doing.
// ============================================================================

import Link from "next/link";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Badge, Notice, PageHeader, StatCard, tableClass, tdClass, thClass, rowStyle } from "@/components/admin/books/ui";
import { SyncNowButton } from "@/components/admin/books/SyncNowButton";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { fetchMovements, loadBooksContext } from "@/lib/ledger/server/data";
import { getProfitAndLoss, getTaxReturn } from "@/lib/ledger/server/reports";
import { syncStudioLedger } from "@/lib/ledger/server/sync";
import { fiscalYear, taxPeriodContaining, taxPeriodsBetween, todayIso, dayBefore } from "@/lib/ledger/periods";
import { formatLedgerMoney } from "@/lib/ledger/money";
import { normalBalance, toMovementMap } from "@/lib/ledger/reports";

export default async function BooksDashboard() {
  const { session } = await requireBooks();
  const { supabase, studioId, userId } = session;

  // Catch up auto-posting before showing numbers (rate-limited inside).
  await syncStudioLedger(supabase, studioId, { userId });
  const ctx = (await loadBooksContext(supabase, studioId))!;
  const { settings, jurisdiction: j } = ctx;
  const t = await getTranslations("books.dashboard");
  const today = todayIso();
  const money = (c: number) => formatLedgerMoney(c, settings.baseCurrency, j.locale, { whole: true });

  const fy = fiscalYear(today, settings.fiscalYearStartMonth, settings.fiscalYearStartDay);
  const currentPeriod = taxPeriodContaining(today, settings.filingFrequency, settings.taxPeriodAnchorMonth);

  const [movements, pl, taxNow, unreconciled, journals, filed] = await Promise.all([
    fetchMovements(supabase, studioId, null, today),
    getProfitAndLoss(supabase, ctx, { start: fy.start < settings.conversionDate ? settings.conversionDate : fy.start, end: today }, false),
    settings.taxRegistered ? getTaxReturn(supabase, ctx, currentPeriod) : Promise.resolve(null),
    supabase.from("ledger_bank_transactions").select("id", { count: "exact", head: true }).eq("studio_id", studioId).eq("status", "unreconciled"),
    supabase
      .from("ledger_journals")
      .select("id, journal_number, date, narration, source_type, status, gross_cents")
      .eq("studio_id", studioId)
      .order("journal_number", { ascending: false })
      .limit(8),
    supabase.from("ledger_tax_returns").select("period_start, period_end").eq("studio_id", studioId),
  ]);

  const mv = toMovementMap(movements);
  const bal = (id: string | undefined) => {
    const a = ctx.accounts.find((x) => x.id === id);
    return a ? normalBalance(a, mv.get(a.id)) : 0;
  };
  const cash = ctx.accounts.filter((a) => a.subtype === "bank").reduce((s, a) => s + normalBalance(a, mv.get(a.id)), 0);
  const receivable = bal(ctx.chart.maybeAccount("ar")?.id);
  const payable = bal(ctx.chart.maybeAccount("ap")?.id);

  // Returns that have ended and aren't filed yet.
  const filedKeys = new Set((filed.data ?? []).map((r) => `${r.period_start}|${r.period_end}`));
  const outstanding = settings.taxRegistered
    ? taxPeriodsBetween(settings.conversionDate, dayBefore(currentPeriod.start), settings.filingFrequency, settings.taxPeriodAnchorMonth).filter(
        (p) => p.end < today && !filedKeys.has(`${p.start}|${p.end}`) && (!settings.lockDate || p.end > settings.lockDate),
      )
    : [];

  const autoCreated = ctx.accounts.filter((a) => a.autoCreated && !a.isArchived);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle", { country: `${j.flag} ${j.name}`, currency: settings.baseCurrency })}
        actions={<SyncNowButton lastSyncedAt={settings.lastSyncedAt} />}
      />

      {settings.lastSyncError && <Notice tone="bad">{t("syncError", { message: settings.lastSyncError })}</Notice>}
      {autoCreated.length > 0 && (
        <Notice tone="warn">
          {t("autoCreated", { count: autoCreated.length, codes: autoCreated.map((a) => a.code).join(", ") })}{" "}
          <Link href={`${BOOKS_PATH}/accounts`} className="font-semibold text-[--brand]">
            {t("reviewAccounts")}
          </Link>
        </Notice>
      )}
      {outstanding.length > 0 && (
        <Notice tone="warn">
          {t("returnsDue", { count: outstanding.length, form: j.returnForm.name })}{" "}
          <Link href={`${BOOKS_PATH}/tax?period=${outstanding[0].start}_${outstanding[0].end}`} className="font-semibold text-[--brand]">
            {t("prepareReturn")}
          </Link>
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("cash")} value={money(cash)} sub={t("cashSub")} href={`${BOOKS_PATH}/bank`} />
        <StatCard label={t("receivable")} value={money(receivable)} sub={t("receivableSub")} href={`${BOOKS_PATH}/reports?report=ar`} />
        <StatCard label={t("payable")} value={money(payable)} sub={t("payableSub")} href={`${BOOKS_PATH}/bills`} />
        <StatCard
          label={t("profit")}
          value={money(pl.report.netProfitCents)}
          sub={t("profitSub", { income: money(pl.report.income.totalCents + pl.report.otherIncome.totalCents) })}
          href={`${BOOKS_PATH}/reports?report=pl`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <GlassPanel className="!p-5 lg:col-span-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("taxTitle", { tax: j.taxName })}</p>
          {taxNow ? (
            <>
              <p className="mt-1 text-sm text-muted">{t("taxPeriod", { start: currentPeriod.start, end: currentPeriod.end })}</p>
              <p className="mt-2 tabular-nums text-ink" style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.6rem" }}>
                {money(taxNow.computed.netPayableCents)}
              </p>
              <p className="text-xs text-muted">{taxNow.computed.netPayableCents >= 0 ? t("taxOwing") : t("taxRefund")}</p>
              <p className="mt-2 text-xs text-muted">{t("taxDue", { date: taxNow.dueDate })}</p>
              <Link href={`${BOOKS_PATH}/tax`} className="mt-3 inline-block text-xs font-semibold text-[--brand]">
                {t("openTax")}
              </Link>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{t("notRegistered", { tax: j.taxName })}</p>
          )}
        </GlassPanel>

        <GlassPanel className="!p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("todo")}</p>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            <TodoItem href={`${BOOKS_PATH}/bank`} done={(unreconciled.count ?? 0) === 0} label={t("todoReconcile", { count: unreconciled.count ?? 0 })} />
            <TodoItem href={`${BOOKS_PATH}/bills/new`} done={false} label={t("todoBills")} />
            <TodoItem href={`${BOOKS_PATH}/journals/new?type=opening`} done={false} label={t("todoOpening", { date: settings.conversionDate })} />
            <TodoItem href={`${BOOKS_PATH}/reports?report=pl`} done={false} label={t("todoReports")} />
          </ul>
        </GlassPanel>
      </div>

      <GlassPanel className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("recent")}</p>
          <Link href={`${BOOKS_PATH}/journals`} className="text-xs font-semibold text-[--brand]">
            {t("allJournals")}
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>#</th>
                <th className={thClass}>{t("date")}</th>
                <th className={thClass}>{t("narration")}</th>
                <th className={`${thClass} text-right`}>{t("amount")}</th>
              </tr>
            </thead>
            <tbody>
              {(journals.data ?? []).map((jr) => (
                <tr key={jr.id as string} style={rowStyle}>
                  <td className={`${tdClass} text-muted`}>
                    <Link href={`${BOOKS_PATH}/journals/${jr.id}`}>{jr.journal_number as number}</Link>
                  </td>
                  <td className={tdClass}>{jr.date as string}</td>
                  <td className={`${tdClass} max-w-[420px] truncate`}>
                    <Link href={`${BOOKS_PATH}/journals/${jr.id}`} className="hover:underline">
                      {jr.narration as string}
                    </Link>{" "}
                    {jr.status === "voided" && <Badge tone="bad">{t("voided")}</Badge>}
                  </td>
                  <td className={`${tdClass} text-right`}>
                    {jr.gross_cents != null ? <Amount cents={Number(jr.gross_cents)} currency={settings.baseCurrency} locale={j.locale} /> : <span className="text-muted">—</span>}
                  </td>
                </tr>
              ))}
              {(journals.data ?? []).length === 0 && (
                <tr style={rowStyle}>
                  <td colSpan={4} className="px-3 py-6 text-center text-sm text-muted">
                    {t("noJournals")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassPanel>
    </div>
  );
}

function TodoItem({ href, done, label }: { href: string; done: boolean; label: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-2 hover:underline">
        <span aria-hidden className="inline-block h-4 w-4 rounded-full border text-center text-[10px] leading-[14px]" style={{ borderColor: "var(--hair)", background: done ? "var(--brand)" : "transparent", color: "var(--base)" }}>
          {done ? "✓" : ""}
        </span>
        <span className={done ? "text-muted line-through" : "text-ink"}>{label}</span>
      </Link>
    </li>
  );
}
