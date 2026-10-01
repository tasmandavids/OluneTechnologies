import Link from "next/link";
import type { ReactNode } from "react";
import { getTranslations } from "@/lib/i18n/server";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { Amount, Notice, PageHeader, rowStyle, secondaryButton, secondaryButtonStyle, tableClass, tdClass, thClass } from "@/components/admin/books/ui";
import { PrintButton } from "@/components/admin/books/PrintButton";
import { requireBooks, BOOKS_PATH } from "@/lib/ledger/server/guard";
import { syncStudioLedger } from "@/lib/ledger/server/sync";
import { getAgedPayables, getAgedReceivables, getBalanceSheet, getBankSummary, getGeneralLedger, getProfitAndLoss, getTrialBalance } from "@/lib/ledger/server/reports";
import { fiscalYear, monthOf, todayIso } from "@/lib/ledger/periods";
import type { StatementSection } from "@/lib/ledger/reports";
import type { AgedBuckets } from "@/lib/ledger/reports";

const REPORTS = ["pl", "bs", "tb", "gl", "bank", "ar", "ap"] as const;
type ReportId = (typeof REPORTS)[number];
const isDate = (v: string | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ report?: string; from?: string; to?: string; asAt?: string; account?: string }> }) {
  const params = await searchParams;
  const { session, ctx } = await requireBooks();
  const t = await getTranslations("books.reports");
  const { supabase, studioId } = session;
  const { settings, jurisdiction: j } = ctx;
  await syncStudioLedger(supabase, studioId, { userId: session.userId });

  const report: ReportId = REPORTS.includes(params.report as ReportId) ? (params.report as ReportId) : "pl";
  const today = todayIso();
  const fy = fiscalYear(today, settings.fiscalYearStartMonth, settings.fiscalYearStartDay);
  const from = isDate(params.from) ? params.from : report === "gl" || report === "bank" ? monthOf(today).start : fy.start;
  const to = isDate(params.to) ? params.to : today;
  const asAt = isDate(params.asAt) ? params.asAt : today;
  const accountId = params.account && ctx.chart.byId.has(params.account) ? params.account : (ctx.chart.maybeAccount("bank")?.id ?? ctx.accounts[0]?.id);

  const money = (c: number, strong = false) => <Amount cents={c} currency={settings.baseCurrency} locale={j.locale} strong={strong} />;
  const usesRange = report === "pl" || report === "gl" || report === "bank";
  const exportQs = new URLSearchParams({ report, from, to, asAt, ...(report === "gl" && accountId ? { account: accountId } : {}) }).toString();

  let body: ReactNode = null;

  if (report === "pl") {
    const { report: pl, comparePeriod } = await getProfitAndLoss(supabase, ctx, { start: from, end: to });
    const sectionRows = (s: StatementSection, title: string) => (
      <>
        <tr>
          <td colSpan={3} className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">{title}</td>
        </tr>
        {s.rows.map((r) => (
          <tr key={r.accountId} style={rowStyle}>
            <td className={tdClass}>
              <Link href={`${BOOKS_PATH}/reports?report=gl&account=${r.accountId}&from=${from}&to=${to}`} className="hover:underline">
                <span className="tabular-nums text-muted">{r.code}</span> {r.name}
              </Link>
            </td>
            <td className={`${tdClass} text-right`}>{money(r.amountCents)}</td>
            <td className={`${tdClass} text-right text-muted`}>{money(r.compareCents ?? 0)}</td>
          </tr>
        ))}
        <tr style={rowStyle}>
          <td className={`${tdClass} font-semibold`}>{t("totalOf", { section: title })}</td>
          <td className={`${tdClass} text-right`}>{money(s.totalCents, true)}</td>
          <td className={`${tdClass} text-right text-muted`}>{money(s.compareTotalCents ?? 0)}</td>
        </tr>
      </>
    );
    body = (
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass} />
            <th className={`${thClass} text-right`}>{from} – {to}</th>
            <th className={`${thClass} text-right`}>{comparePeriod ? `${comparePeriod.start} – ${comparePeriod.end}` : ""}</th>
          </tr>
        </thead>
        <tbody>
          {sectionRows(pl.income, t("income"))}
          {pl.costOfSales.rows.length > 0 && sectionRows(pl.costOfSales, t("costOfSales"))}
          <TotalRow label={t("grossProfit")} a={money(pl.grossProfitCents, true)} b={money(pl.compare?.grossProfitCents ?? 0)} />
          {pl.otherIncome.rows.length > 0 && sectionRows(pl.otherIncome, t("otherIncome"))}
          {sectionRows(pl.expenses, t("expenses"))}
          <TotalRow label={t("netProfit")} a={money(pl.netProfitCents, true)} b={money(pl.compare?.netProfitCents ?? 0)} />
        </tbody>
      </table>
    );
  }

  if (report === "bs") {
    const { report: bs } = await getBalanceSheet(supabase, ctx, asAt);
    const sec = (s: StatementSection, title: string) =>
      s.rows.length ? (
        <>
          <tr>
            <td colSpan={2} className="px-3 pb-1 pt-4 text-xs font-semibold uppercase tracking-wider text-muted">{title}</td>
          </tr>
          {s.rows.map((r) => (
            <tr key={r.accountId} style={rowStyle}>
              <td className={tdClass}>
                <Link href={`${BOOKS_PATH}/reports?report=gl&account=${r.accountId}&to=${asAt}`} className="hover:underline">
                  <span className="tabular-nums text-muted">{r.code}</span> {r.name}
                </Link>
              </td>
              <td className={`${tdClass} text-right`}>{money(r.amountCents)}</td>
            </tr>
          ))}
        </>
      ) : null;
    body = (
      <>
        {bs.outOfBalanceCents !== 0 && <div className="p-4"><Notice tone="bad">{t("outOfBalance", { amount: String(bs.outOfBalanceCents / 100) })}</Notice></div>}
        <table className={tableClass}>
          <tbody>
            {sec(bs.bank, t("bank"))}
            {sec(bs.currentAssets, t("currentAssets"))}
            {sec(bs.fixedAssets, t("fixedAssets"))}
            {sec(bs.nonCurrentAssets, t("nonCurrentAssets"))}
            <TotalRow label={t("totalAssets")} a={money(bs.totalAssetsCents, true)} />
            {sec(bs.currentLiabilities, t("currentLiabilities"))}
            {sec(bs.nonCurrentLiabilities, t("nonCurrentLiabilities"))}
            <TotalRow label={t("totalLiabilities")} a={money(bs.totalLiabilitiesCents, true)} />
            <TotalRow label={t("netAssets")} a={money(bs.netAssetsCents, true)} />
            {sec(bs.equity, t("equity"))}
            {bs.priorYearsEarningsCents !== 0 && (
              <tr style={rowStyle}>
                <td className={tdClass}>{t("priorEarnings")}</td>
                <td className={`${tdClass} text-right`}>{money(bs.priorYearsEarningsCents)}</td>
              </tr>
            )}
            <tr style={rowStyle}>
              <td className={tdClass}>{t("currentEarnings")}</td>
              <td className={`${tdClass} text-right`}>{money(bs.currentYearEarningsCents)}</td>
            </tr>
            <TotalRow label={t("totalEquity")} a={money(bs.totalEquityCents, true)} />
          </tbody>
        </table>
      </>
    );
  }

  if (report === "tb") {
    const { report: tb } = await getTrialBalance(supabase, ctx, asAt);
    body = (
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>{t("account")}</th>
            <th className={`${thClass} text-right`}>{t("debit")}</th>
            <th className={`${thClass} text-right`}>{t("credit")}</th>
          </tr>
        </thead>
        <tbody>
          {tb.rows.map((r) => (
            <tr key={r.accountId} style={rowStyle}>
              <td className={tdClass}>
                <span className="tabular-nums text-muted">{r.code}</span> {r.name}
              </td>
              <td className={`${tdClass} text-right`}>{r.debitCents ? money(r.debitCents) : ""}</td>
              <td className={`${tdClass} text-right`}>{r.creditCents ? money(r.creditCents) : ""}</td>
            </tr>
          ))}
          <tr style={rowStyle}>
            <td className={`${tdClass} font-semibold`}>{t("total")}</td>
            <td className={`${tdClass} text-right`}>{money(tb.totalDebitCents, true)}</td>
            <td className={`${tdClass} text-right`}>{money(tb.totalCreditCents, true)}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (report === "gl" && accountId) {
    const gl = await getGeneralLedger(supabase, ctx, accountId, { start: from, end: to });
    body = (
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>{t("date")}</th>
            <th className={thClass}>#</th>
            <th className={thClass}>{t("narration")}</th>
            <th className={`${thClass} text-right`}>{t("debit")}</th>
            <th className={`${thClass} text-right`}>{t("credit")}</th>
            <th className={`${thClass} text-right`}>{t("balance")}</th>
          </tr>
        </thead>
        <tbody>
          <tr style={rowStyle}>
            <td className={tdClass} colSpan={5}>{t("opening")}</td>
            <td className={`${tdClass} text-right`}>{money(gl.openingCents)}</td>
          </tr>
          {gl.lines.map((l) => (
            <tr key={l.lineId} style={rowStyle}>
              <td className={tdClass}>{l.date}</td>
              <td className={`${tdClass} text-muted`}>
                <Link href={`${BOOKS_PATH}/journals/${l.journalId}`}>{l.journalNumber}</Link>
              </td>
              <td className={`${tdClass} max-w-[380px] truncate`}>{l.description || l.narration}</td>
              <td className={`${tdClass} text-right`}>{l.debitCents ? money(l.debitCents) : ""}</td>
              <td className={`${tdClass} text-right`}>{l.creditCents ? money(l.creditCents) : ""}</td>
              <td className={`${tdClass} text-right`}>{money(l.balanceCents)}</td>
            </tr>
          ))}
          <tr style={rowStyle}>
            <td className={`${tdClass} font-semibold`} colSpan={5}>{t("closing")}</td>
            <td className={`${tdClass} text-right`}>{money(gl.closingCents, true)}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  if (report === "bank") {
    const { rows } = await getBankSummary(supabase, ctx, { start: from, end: to });
    body = (
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>{t("account")}</th>
            <th className={`${thClass} text-right`}>{t("openingBalance")}</th>
            <th className={`${thClass} text-right`}>{t("received")}</th>
            <th className={`${thClass} text-right`}>{t("spent")}</th>
            <th className={`${thClass} text-right`}>{t("closingBalance")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.accountId} style={rowStyle}>
              <td className={tdClass}>{r.name}</td>
              <td className={`${tdClass} text-right`}>{money(r.openingCents)}</td>
              <td className={`${tdClass} text-right`}>{money(r.receivedCents)}</td>
              <td className={`${tdClass} text-right`}>{money(r.spentCents)}</td>
              <td className={`${tdClass} text-right`}>{money(r.closingCents, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (report === "ar" || report === "ap") {
    const aged = report === "ar" ? await getAgedReceivables(supabase, studioId, asAt) : await getAgedPayables(supabase, studioId, asAt);
    const cols: (keyof AgedBuckets)[] = ["current", "d1to30", "d31to60", "d61to90", "d90plus", "total"];
    body = (
      <table className={tableClass}>
        <thead>
          <tr>
            <th className={thClass}>{report === "ar" ? t("customer") : t("supplier")}</th>
            {cols.map((c) => (
              <th key={c} className={`${thClass} text-right`}>{t(`aged.${c}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aged.contacts.map((c) => (
            <tr key={c.name} style={rowStyle}>
              <td className={tdClass}>{c.name}</td>
              {cols.map((k) => (
                <td key={k} className={`${tdClass} text-right`}>{c.buckets[k] ? money(c.buckets[k], k === "total") : ""}</td>
              ))}
            </tr>
          ))}
          <tr style={rowStyle}>
            <td className={`${tdClass} font-semibold`}>{t("total")}</td>
            {cols.map((k) => (
              <td key={k} className={`${tdClass} text-right`}>{money(aged.totals[k], true)}</td>
            ))}
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6 print:max-w-none print:p-0">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={
          <>
            <a href={`/api/books/export?${exportQs}`} className={secondaryButton} style={secondaryButtonStyle}>{t("exportCsv")}</a>
            <a href={`/api/books/export?report=journals&from=${from}&to=${to}`} className={secondaryButton} style={secondaryButtonStyle}>{t("exportJournals")}</a>
            {j.code === "FR" && <a href={`/api/books/export?report=fec&from=${fy.start}&to=${fy.end}`} className={secondaryButton} style={secondaryButtonStyle}>{t("exportFec")}</a>}
            <PrintButton />
          </>
        }
      />

      <div className="flex flex-wrap gap-1 print:hidden">
        {REPORTS.map((r) => (
          <Link
            key={r}
            href={`${BOOKS_PATH}/reports?report=${r}`}
            className="rounded-[10px] px-3 py-1.5 text-xs font-semibold"
            style={{ color: r === report ? "var(--ink)" : "var(--muted)", background: r === report ? "var(--t3)" : "transparent", border: `1px solid ${r === report ? "var(--tb)" : "transparent"}` }}
          >
            {t(`names.${r}`)}
          </Link>
        ))}
      </div>

      <form className="flex flex-wrap items-end gap-2 print:hidden" action={`${BOOKS_PATH}/reports`}>
        <input type="hidden" name="report" value={report} />
        {usesRange ? (
          <>
            <label className="text-xs text-muted">
              {t("from")}
              <input type="date" name="from" defaultValue={from} className="mt-1 block rounded-xl border px-3 py-2 text-sm text-ink" style={{ background: "var(--surface)", borderColor: "var(--hair)" }} />
            </label>
            <label className="text-xs text-muted">
              {t("to")}
              <input type="date" name="to" defaultValue={to} className="mt-1 block rounded-xl border px-3 py-2 text-sm text-ink" style={{ background: "var(--surface)", borderColor: "var(--hair)" }} />
            </label>
          </>
        ) : (
          <label className="text-xs text-muted">
            {t("asAt")}
            <input type="date" name="asAt" defaultValue={asAt} className="mt-1 block rounded-xl border px-3 py-2 text-sm text-ink" style={{ background: "var(--surface)", borderColor: "var(--hair)" }} />
          </label>
        )}
        {report === "gl" && (
          <label className="text-xs text-muted">
            {t("account")}
            <select name="account" defaultValue={accountId} className="mt-1 block max-w-[280px] rounded-xl border px-3 py-2 text-sm text-ink" style={{ background: "var(--surface)", borderColor: "var(--hair)" }}>
              {ctx.accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className={secondaryButton} style={secondaryButtonStyle}>{t("update")}</button>
      </form>

      <GlassPanel className="!p-0 overflow-hidden print:shadow-none">
        <div className="px-5 pt-4">
          <p className="text-sm font-semibold text-ink">{t(`names.${report}`)}</p>
          <p className="text-xs text-muted">{usesRange ? `${from} – ${to}` : t("asAtDate", { date: asAt })} · {settings.baseCurrency}</p>
        </div>
        <div className="overflow-x-auto">{body}</div>
      </GlassPanel>
    </div>
  );
}

function TotalRow({ label, a, b }: { label: string; a: ReactNode; b?: ReactNode }) {
  return (
    <tr style={{ borderTop: "2px solid var(--hair)" }}>
      <td className={`${tdClass} font-semibold`}>{label}</td>
      <td className={`${tdClass} text-right`}>{a}</td>
      {b !== undefined && <td className={`${tdClass} text-right text-muted`}>{b}</td>}
    </tr>
  );
}
