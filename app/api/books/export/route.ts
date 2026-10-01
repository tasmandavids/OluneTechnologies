// ============================================================================
//  GET /api/books/export — Olune Books reports as CSV (and FEC for France).
//
//  Admin-only, same check as every Books action. Each export is audited as
//  data.exported: the journal export contains customer names.
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import { getAdminStudio } from "@/lib/portal/access";
import { logAuditEvent } from "@/lib/audit/log";
import { fetchAll, loadBooksContext } from "@/lib/ledger/server/data";
import { getAgedPayables, getAgedReceivables, getBalanceSheet, getBankSummary, getCashFlow, getGeneralLedger, getProfitAndLoss, getProfitTrend, getSupplierSpend, getTrialBalance } from "@/lib/ledger/server/reports";
import { FEC_JOURNALS, toCsv, toFec, type FecLine } from "@/lib/ledger/csv";
import { centsToDecimal } from "@/lib/ledger/money";
import { todayIso } from "@/lib/ledger/periods";
import type { CashFlow, StatementSection, TrendSection } from "@/lib/ledger/reports";

export const dynamic = "force-dynamic";

const CASH_FLOW_LABELS: Record<string, string> = {
  netProfit: "Net profit",
  depreciation: "Add back depreciation",
  depreciationOffset: "Less depreciation already in fixed assets",
};

const isDate = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function GET(req: NextRequest) {
  const access = await getAdminStudio();
  if (access.error || !access.studioId) return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  const { supabase, studioId } = access;
  // Paused books (studio moved to Xero) still export: that's how the history
  // gets to their accountant.
  const ctx = await loadBooksContext(supabase, studioId, { includePaused: true });
  if (!ctx) return NextResponse.json({ error: "books_not_set_up" }, { status: 404 });

  const q = req.nextUrl.searchParams;
  const report = q.get("report") ?? "pl";
  const today = todayIso();
  const from = isDate(q.get("from")) ? q.get("from")! : `${today.slice(0, 4)}-01-01`;
  const to = isDate(q.get("to")) ? q.get("to")! : today;
  const asAt = isDate(q.get("asAt")) ? q.get("asAt")! : today;
  const d = centsToDecimal;

  let rows: (string | number | null)[][] = [];
  let filename = `olune-books-${report}-${today}.csv`;
  let body: string | null = null;
  let contentType = "text/csv; charset=utf-8";

  const section = (s: StatementSection, title: string) => [
    [title, "", ""],
    ...s.rows.map((r) => [r.code, r.name, d(r.amountCents)]),
    ["", `Total ${title}`, d(s.totalCents)],
  ];

  const cashFlowRows = (cf: CashFlow) => {
    const label = (l: { accountId?: string; label: string }) => (l.accountId ? l.label : CASH_FLOW_LABELS[l.label] ?? l.label);
    return [
      ["Operating activities", ""],
      ...cf.operating.map((l) => [label(l), d(l.amountCents)]),
      ["Net cash from operating activities", d(cf.operatingTotalCents)],
      ["Investing activities", ""],
      ...cf.investing.map((l) => [label(l), d(l.amountCents)]),
      ["Net cash from investing activities", d(cf.investingTotalCents)],
      ["Financing activities", ""],
      ...cf.financing.map((l) => [label(l), d(l.amountCents)]),
      ["Net cash from financing activities", d(cf.financingTotalCents)],
      ["Net change in cash", d(cf.netChangeCents)],
      ["Cash at the start", d(cf.openingCashCents)],
      ["Cash at the end", d(cf.closingCashCents)],
    ];
  };

  switch (report) {
    case "trend": {
      const { months, report: tr } = await getProfitTrend(supabase, ctx, { start: from, end: to });
      const sec = (s: TrendSection, title: string) => [
        [title],
        ...s.rows.map((r) => [r.code, r.name, ...r.amounts.map(d), d(r.totalCents)]),
        ["", `Total ${title}`, ...s.totals.map(d), d(s.totalCents)],
      ];
      const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
      rows = [
        ["Code", "Account", ...months.map((m) => m.start.slice(0, 7)), "Total"],
        ...sec(tr.income, "Income"),
        ...sec(tr.costOfSales, "Cost of sales"),
        ["", "Gross profit", ...tr.grossProfit.map(d), d(sum(tr.grossProfit))],
        ...sec(tr.otherIncome, "Other income"),
        ...sec(tr.expenses, "Expenses"),
        ["", "Net profit", ...tr.netProfit.map(d), d(tr.netProfitTotalCents)],
      ];
      break;
    }
    case "cf": {
      const { report: cf } = await getCashFlow(supabase, ctx, { start: from, end: to });
      rows = [["Cash flow statement", `${from} to ${to}`, ctx.settings.baseCurrency], ...cashFlowRows(cf)];
      break;
    }
    case "suppliers": {
      const spend = await getSupplierSpend(supabase, studioId, { start: from, end: to });
      rows = [["Supplier", "Bills", "Tax", "Total", "Outstanding"], ...spend.suppliers.map((x) => [x.name, x.bills, d(x.taxCents), d(x.totalCents), d(x.outstandingCents)]), ["Total", spend.totals.bills, d(spend.totals.taxCents), d(spend.totals.totalCents), d(spend.totals.outstandingCents)]];
      break;
    }
    case "pack": {
      // Everything an accountant asks for at year end, in one file: the
      // statements to `to`, the trial balance, who owes what, and the general
      // ledger for every account that moved.
      const [{ report: pl }, { report: bs }, { report: tb }, { report: cf }, ar, ap] = await Promise.all([
        getProfitAndLoss(supabase, ctx, { start: from, end: to }, false),
        getBalanceSheet(supabase, ctx, to),
        getTrialBalance(supabase, ctx, to),
        getCashFlow(supabase, ctx, { start: from, end: to }),
        getAgedReceivables(supabase, studioId, to),
        getAgedPayables(supabase, studioId, to),
      ]);
      const name = ctx.jurisdiction.code === "XX" ? (ctx.settings.customCountryName ?? "") : ctx.jurisdiction.name;
      rows = [
        ["Olune Books — year-end pack", `${from} to ${to}`, ctx.settings.baseCurrency, name],
        ["Generated", today],
        [],
        ["PROFIT AND LOSS"],
        ...section(pl.income, "Income"), ...section(pl.costOfSales, "Cost of sales"), ["", "Gross profit", d(pl.grossProfitCents)], ...section(pl.otherIncome, "Other income"), ...section(pl.expenses, "Expenses"), ["", "Net profit", d(pl.netProfitCents)],
        [],
        ["BALANCE SHEET", `as at ${to}`],
        ...section(bs.bank, "Bank"), ...section(bs.currentAssets, "Current assets"), ...section(bs.fixedAssets, "Fixed assets"), ...section(bs.nonCurrentAssets, "Non-current assets"), ["", "Total assets", d(bs.totalAssetsCents)], ...section(bs.currentLiabilities, "Current liabilities"), ...section(bs.nonCurrentLiabilities, "Non-current liabilities"), ["", "Total liabilities", d(bs.totalLiabilitiesCents)], ...section(bs.equity, "Equity"), ["", "Prior years' earnings", d(bs.priorYearsEarningsCents)], ["", "Current year earnings", d(bs.currentYearEarningsCents)], ["", "Total equity", d(bs.totalEquityCents)],
        [],
        ["CASH FLOW"],
        ...cashFlowRows(cf),
        [],
        ["TRIAL BALANCE", `as at ${to}`],
        ["Code", "Account", "Debit", "Credit"], ...tb.rows.map((r) => [r.code, r.name, r.debitCents ? d(r.debitCents) : "", r.creditCents ? d(r.creditCents) : ""]), ["", "Total", d(tb.totalDebitCents), d(tb.totalCreditCents)],
        [],
        ["AGED RECEIVABLES", `as at ${to}`],
        ["Customer", "Current", "1-30", "31-60", "61-90", "90+", "Total"], ...ar.contacts.map((c) => [c.name, d(c.buckets.current), d(c.buckets.d1to30), d(c.buckets.d31to60), d(c.buckets.d61to90), d(c.buckets.d90plus), d(c.buckets.total)]),
        [],
        ["AGED PAYABLES", `as at ${to}`],
        ["Supplier", "Current", "1-30", "31-60", "61-90", "90+", "Total"], ...ap.contacts.map((c) => [c.name, d(c.buckets.current), d(c.buckets.d1to30), d(c.buckets.d31to60), d(c.buckets.d61to90), d(c.buckets.d90plus), d(c.buckets.total)]),
        [],
        ["GENERAL LEDGER", `${from} to ${to}`],
      ];
      // One account at a time keeps memory flat; stop before the response
      // outgrows a serverless body and point at the journal export instead.
      let glLines = 0;
      for (const a of ctx.accounts) {
        if (glLines > 30_000) {
          rows.push(["…", "General ledger truncated — use “Export journals” for the full detail"]);
          break;
        }
        const gl = await getGeneralLedger(supabase, ctx, a.id, { start: from, end: to });
        if (!gl.lines.length && !gl.openingCents) continue;
        glLines += gl.lines.length;
        rows.push([], [`${a.code} ${a.name}`], ["Date", "Journal", "Narration", "Debit", "Credit", "Balance"], ["", "", "Opening balance", "", "", d(gl.openingCents)]);
        for (const l of gl.lines) rows.push([l.date, l.journalNumber, l.description || l.narration, l.debitCents ? d(l.debitCents) : "", l.creditCents ? d(l.creditCents) : "", d(l.balanceCents)]);
        rows.push(["", "", "Closing balance", "", "", d(gl.closingCents)]);
      }
      filename = `olune-books-year-end-${from}-to-${to}.csv`;
      break;
    }
    case "pl": {
      const { report: pl } = await getProfitAndLoss(supabase, ctx, { start: from, end: to }, false);
      rows = [["Profit and loss", `${from} to ${to}`, ctx.settings.baseCurrency], ...section(pl.income, "Income"), ...section(pl.costOfSales, "Cost of sales"), ["", "Gross profit", d(pl.grossProfitCents)], ...section(pl.otherIncome, "Other income"), ...section(pl.expenses, "Expenses"), ["", "Net profit", d(pl.netProfitCents)]];
      break;
    }
    case "bs": {
      const { report: bs } = await getBalanceSheet(supabase, ctx, asAt);
      rows = [["Balance sheet", `as at ${asAt}`, ctx.settings.baseCurrency], ...section(bs.bank, "Bank"), ...section(bs.currentAssets, "Current assets"), ...section(bs.fixedAssets, "Fixed assets"), ...section(bs.nonCurrentAssets, "Non-current assets"), ["", "Total assets", d(bs.totalAssetsCents)], ...section(bs.currentLiabilities, "Current liabilities"), ...section(bs.nonCurrentLiabilities, "Non-current liabilities"), ["", "Total liabilities", d(bs.totalLiabilitiesCents)], ...section(bs.equity, "Equity"), ["", "Prior years' earnings", d(bs.priorYearsEarningsCents)], ["", "Current year earnings", d(bs.currentYearEarningsCents)], ["", "Total equity", d(bs.totalEquityCents)]];
      break;
    }
    case "tb": {
      const { report: tb } = await getTrialBalance(supabase, ctx, asAt);
      rows = [["Code", "Account", "Debit", "Credit"], ...tb.rows.map((r) => [r.code, r.name, r.debitCents ? d(r.debitCents) : "", r.creditCents ? d(r.creditCents) : ""]), ["", "Total", d(tb.totalDebitCents), d(tb.totalCreditCents)]];
      break;
    }
    case "gl": {
      const accountId = q.get("account");
      if (!accountId || !ctx.chart.byId.has(accountId)) return NextResponse.json({ error: "unknown_account" }, { status: 400 });
      const gl = await getGeneralLedger(supabase, ctx, accountId, { start: from, end: to });
      const a = ctx.chart.byId.get(accountId)!;
      rows = [[`${a.code} ${a.name}`, `${from} to ${to}`], ["Date", "Journal", "Narration", "Debit", "Credit", "Balance"], ["", "", "Opening balance", "", "", d(gl.openingCents)], ...gl.lines.map((l) => [l.date, l.journalNumber, l.description || l.narration, l.debitCents ? d(l.debitCents) : "", l.creditCents ? d(l.creditCents) : "", d(l.balanceCents)])];
      break;
    }
    case "bank": {
      const { rows: bank } = await getBankSummary(supabase, ctx, { start: from, end: to });
      rows = [["Account", "Opening", "Received", "Spent", "Closing"], ...bank.map((r) => [r.name, d(r.openingCents), d(r.receivedCents), d(r.spentCents), d(r.closingCents)])];
      break;
    }
    case "ar":
    case "ap": {
      const aged = report === "ar" ? await getAgedReceivables(supabase, studioId, asAt) : await getAgedPayables(supabase, studioId, asAt);
      rows = [[report === "ar" ? "Customer" : "Supplier", "Current", "1-30", "31-60", "61-90", "90+", "Total"], ...aged.contacts.map((c) => [c.name, d(c.buckets.current), d(c.buckets.d1to30), d(c.buckets.d31to60), d(c.buckets.d61to90), d(c.buckets.d90plus), d(c.buckets.total)])];
      break;
    }
    case "journals":
    case "fec": {
      const lines = await fetchAll<Record<string, unknown>>((a, b) =>
        supabase
          .from("ledger_journal_lines")
          .select("line_no, account_id, description, debit_cents, credit_cents, tax_rate_id, tax_cents, journal:ledger_journals!inner ( journal_number, date, narration, reference, source_type, status, created_at )")
          .eq("studio_id", studioId)
          .eq("journal.status", "posted")
          .gte("journal.date", from)
          .lte("journal.date", to)
          .range(a, b),
        200_000,
      );
      type J = { journal_number: number; date: string; narration: string; reference: string | null; source_type: string; created_at: string };
      const sorted = lines
        .map((l) => ({ l, j: l.journal as J }))
        .sort((x, y) => x.j.journal_number - y.j.journal_number || Number(x.l.line_no) - Number(y.l.line_no));
      if (report === "fec") {
        const fecLines: FecLine[] = sorted.map(({ l, j }) => {
          const acct = ctx.chart.byId.get(l.account_id as string);
          const [code, label] = FEC_JOURNALS[j.source_type] ?? ["OD", "Opérations diverses"];
          return {
            journalCode: code,
            journalLabel: label,
            entryNumber: j.journal_number,
            entryDate: j.date,
            accountCode: acct?.code ?? "",
            accountLabel: acct?.name ?? "",
            reference: j.reference ?? "",
            documentDate: j.date,
            label: (l.description as string | null) || j.narration,
            debitCents: Number(l.debit_cents),
            creditCents: Number(l.credit_cents),
            validationDate: j.created_at.slice(0, 10),
          };
        });
        body = toFec(fecLines);
        const siren = (ctx.settings.taxNumber ?? "").replace(/\D/g, "").slice(-9) || "000000000";
        filename = `${siren}FEC${to.replace(/-/g, "")}.txt`;
        contentType = "text/plain; charset=utf-8";
      } else {
        rows = [["Journal", "Date", "Source", "Reference", "Narration", "Account code", "Account", "Line description", "Debit", "Credit", "Tax rate", "Tax"]];
        for (const { l, j } of sorted) {
          const acct = ctx.chart.byId.get(l.account_id as string);
          const rate = l.tax_rate_id ? ctx.rates.find((r) => r.id === l.tax_rate_id) : null;
          rows.push([j.journal_number, j.date, j.source_type, j.reference, j.narration, acct?.code ?? "", acct?.name ?? "", (l.description as string | null) ?? "", Number(l.debit_cents) ? d(Number(l.debit_cents)) : "", Number(l.credit_cents) ? d(Number(l.credit_cents)) : "", rate?.code ?? "", Number(l.tax_cents) ? d(Number(l.tax_cents)) : ""]);
        }
      }
      break;
    }
    default:
      return NextResponse.json({ error: "unknown_report" }, { status: 400 });
  }

  await logAuditEvent({ studioId, actorId: access.userId, action: "data.exported", targetType: "ledger_report", targetId: report, metadata: { from, to, asAt } });

  return new NextResponse(body ?? toCsv(rows), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
