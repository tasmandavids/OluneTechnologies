// ============================================================================
//  Financial statements from account movements.
//
//  Pure: the server fetches per-account debit/credit totals with the
//  ledger_account_balances RPC (one aggregate query per range, never every
//  line), and these functions shape them into statements.
//
//  Year end is virtual, the way Xero does it: no closing journal is ever
//  posted. Revenue and expenses before the current financial year roll into
//  retained earnings when the balance sheet or trial balance is drawn, so a
//  late adjustment to last year just shows up in the right place.
// ============================================================================

import type { AccountMovement, AccountSubtype, LedgerAccount } from "./types";
import { isDebitNormal } from "./types";

type MovementMap = Map<string, { debit: number; credit: number }>;

export function toMovementMap(rows: AccountMovement[]): MovementMap {
  const m: MovementMap = new Map();
  for (const r of rows) m.set(r.accountId, { debit: r.debitCents, credit: r.creditCents });
  return m;
}

/** Balance on the account's normal side (positive = normal). */
export function normalBalance(account: Pick<LedgerAccount, "type">, mv: { debit: number; credit: number } | undefined): number {
  if (!mv) return 0;
  return isDebitNormal(account.type) ? mv.debit - mv.credit : mv.credit - mv.debit;
}

const isPl = (a: Pick<LedgerAccount, "type">) => a.type === "revenue" || a.type === "expense";

export type StatementRow = { accountId: string; code: string; name: string; amountCents: number; compareCents?: number };
export type StatementSection = { id: string; rows: StatementRow[]; totalCents: number; compareTotalCents?: number };

function section(
  id: string,
  accounts: LedgerAccount[],
  subtypes: AccountSubtype[],
  current: MovementMap,
  compare?: MovementMap,
  /** Flip sign (e.g. show expenses as positive). Default: normal balance. */
): StatementSection {
  const rows: StatementRow[] = [];
  for (const a of accounts) {
    if (!subtypes.includes(a.subtype)) continue;
    const amount = normalBalance(a, current.get(a.id));
    const cmp = compare ? normalBalance(a, compare.get(a.id)) : undefined;
    if (amount === 0 && !cmp) continue;
    rows.push({ accountId: a.id, code: a.code, name: a.name, amountCents: amount, compareCents: cmp });
  }
  rows.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
  return {
    id,
    rows,
    totalCents: rows.reduce((s, r) => s + r.amountCents, 0),
    compareTotalCents: compare ? rows.reduce((s, r) => s + (r.compareCents ?? 0), 0) : undefined,
  };
}

// ─── Profit & loss ───────────────────────────────────────────────────────────

export type ProfitAndLoss = {
  income: StatementSection;
  costOfSales: StatementSection;
  grossProfitCents: number;
  otherIncome: StatementSection;
  expenses: StatementSection;
  netProfitCents: number;
  compare?: { grossProfitCents: number; netProfitCents: number };
};

export function profitAndLoss(accounts: LedgerAccount[], period: AccountMovement[], comparePeriod?: AccountMovement[]): ProfitAndLoss {
  const cur = toMovementMap(period);
  const cmp = comparePeriod ? toMovementMap(comparePeriod) : undefined;
  const income = section("income", accounts, ["revenue"], cur, cmp);
  const costOfSales = section("costOfSales", accounts, ["direct_cost"], cur, cmp);
  const otherIncome = section("otherIncome", accounts, ["other_income"], cur, cmp);
  const expenses = section("expenses", accounts, ["expense", "depreciation", "other_expense"], cur, cmp);
  const gross = income.totalCents - costOfSales.totalCents;
  const net = gross + otherIncome.totalCents - expenses.totalCents;
  return {
    income,
    costOfSales,
    grossProfitCents: gross,
    otherIncome,
    expenses,
    netProfitCents: net,
    compare: cmp
      ? (() => {
          const g = (income.compareTotalCents ?? 0) - (costOfSales.compareTotalCents ?? 0);
          return { grossProfitCents: g, netProfitCents: g + (otherIncome.compareTotalCents ?? 0) - (expenses.compareTotalCents ?? 0) };
        })()
      : undefined,
  };
}

/** Net profit straight from movements (for retained-earnings roll-ups). */
export function netProfitOf(accounts: LedgerAccount[], movements: AccountMovement[]): number {
  const m = toMovementMap(movements);
  let total = 0;
  for (const a of accounts) {
    if (!isPl(a)) continue;
    const mv = m.get(a.id);
    if (!mv) continue;
    total += a.type === "revenue" ? mv.credit - mv.debit : -(mv.debit - mv.credit);
  }
  return total;
}

// ─── Balance sheet ───────────────────────────────────────────────────────────

export type BalanceSheet = {
  bank: StatementSection;
  currentAssets: StatementSection;
  fixedAssets: StatementSection;
  nonCurrentAssets: StatementSection;
  totalAssetsCents: number;
  currentLiabilities: StatementSection;
  nonCurrentLiabilities: StatementSection;
  totalLiabilitiesCents: number;
  equity: StatementSection;
  /** Prior years' profit not yet in a retained earnings account. */
  priorYearsEarningsCents: number;
  currentYearEarningsCents: number;
  totalEquityCents: number;
  netAssetsCents: number;
  /** Assets − liabilities − equity. Zero for a healthy ledger. */
  outOfBalanceCents: number;
};

/**
 * @param allTime      movements from the beginning to the report date
 * @param beforeFy     movements up to the day before the current financial year
 */
export function balanceSheet(accounts: LedgerAccount[], allTime: AccountMovement[], beforeFy: AccountMovement[]): BalanceSheet {
  const all = toMovementMap(allTime);
  const bank = section("bank", accounts, ["bank"], all);
  const currentAssets = section("currentAssets", accounts, ["receivable", "current_asset", "inventory"], all);
  const fixedAssets = section("fixedAssets", accounts, ["fixed_asset"], all);
  const nonCurrentAssets = section("nonCurrentAssets", accounts, ["non_current_asset"], all);
  const currentLiabilities = section("currentLiabilities", accounts, ["payable", "tax", "current_liability"], all);
  const nonCurrentLiabilities = section("nonCurrentLiabilities", accounts, ["non_current_liability"], all);
  const equity = section("equity", accounts, ["equity", "retained_earnings"], all);

  const allProfit = netProfitOf(accounts, allTime);
  const priorProfit = netProfitOf(accounts, beforeFy);
  const currentYear = allProfit - priorProfit;

  const totalAssets = bank.totalCents + currentAssets.totalCents + fixedAssets.totalCents + nonCurrentAssets.totalCents;
  const totalLiabilities = currentLiabilities.totalCents + nonCurrentLiabilities.totalCents;
  const totalEquity = equity.totalCents + priorProfit + currentYear;

  return {
    bank,
    currentAssets,
    fixedAssets,
    nonCurrentAssets,
    totalAssetsCents: totalAssets,
    currentLiabilities,
    nonCurrentLiabilities,
    totalLiabilitiesCents: totalLiabilities,
    equity,
    priorYearsEarningsCents: priorProfit,
    currentYearEarningsCents: currentYear,
    totalEquityCents: totalEquity,
    netAssetsCents: totalAssets - totalLiabilities,
    outOfBalanceCents: totalAssets - totalLiabilities - totalEquity,
  };
}

// ─── Trial balance ───────────────────────────────────────────────────────────

export type TrialBalanceRow = { accountId: string; code: string; name: string; type: LedgerAccount["type"]; debitCents: number; creditCents: number };
export type TrialBalance = { rows: TrialBalanceRow[]; totalDebitCents: number; totalCreditCents: number };

/**
 * Balance-sheet accounts at all-time balances, P&L accounts year-to-date, and
 * prior years' P&L folded into the retained earnings row — so the TB balances
 * and matches the balance sheet.
 */
export function trialBalance(accounts: LedgerAccount[], allTime: AccountMovement[], beforeFy: AccountMovement[]): TrialBalance {
  const all = toMovementMap(allTime);
  const prior = toMovementMap(beforeFy);
  const priorProfit = netProfitOf(accounts, beforeFy);
  const retained = accounts.find((a) => a.systemKey === "retained_earnings");
  const rows: TrialBalanceRow[] = [];

  for (const a of accounts) {
    const mv = all.get(a.id) ?? { debit: 0, credit: 0 };
    let net = mv.debit - mv.credit;
    if (isPl(a)) {
      const p = prior.get(a.id) ?? { debit: 0, credit: 0 };
      net -= p.debit - p.credit;
    }
    if (retained && a.id === retained.id) net -= priorProfit;
    if (net === 0) continue;
    rows.push({ accountId: a.id, code: a.code, name: a.name, type: a.type, debitCents: net > 0 ? net : 0, creditCents: net < 0 ? -net : 0 });
  }

  if (!retained && priorProfit !== 0) {
    rows.push({ accountId: "retained", code: "—", name: "Retained earnings", type: "equity", debitCents: priorProfit < 0 ? -priorProfit : 0, creditCents: priorProfit > 0 ? priorProfit : 0 });
  }

  rows.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
  return {
    rows,
    totalDebitCents: rows.reduce((s, r) => s + r.debitCents, 0),
    totalCreditCents: rows.reduce((s, r) => s + r.creditCents, 0),
  };
}

// ─── Bank summary ────────────────────────────────────────────────────────────

export type BankSummaryRow = { accountId: string; code: string; name: string; openingCents: number; receivedCents: number; spentCents: number; closingCents: number };

export function bankSummary(accounts: LedgerAccount[], beforeFrom: AccountMovement[], period: AccountMovement[]): BankSummaryRow[] {
  const before = toMovementMap(beforeFrom);
  const cur = toMovementMap(period);
  return accounts
    .filter((a) => a.subtype === "bank")
    .map((a) => {
      const b = before.get(a.id) ?? { debit: 0, credit: 0 };
      const c = cur.get(a.id) ?? { debit: 0, credit: 0 };
      const opening = b.debit - b.credit;
      return {
        accountId: a.id,
        code: a.code,
        name: a.name,
        openingCents: opening,
        receivedCents: c.debit,
        spentCents: c.credit,
        closingCents: opening + c.debit - c.credit,
      };
    })
    .filter((r) => r.openingCents || r.receivedCents || r.spentCents)
    .sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
}

// ─── Ageing ──────────────────────────────────────────────────────────────────

export type AgedBuckets = { current: number; d1to30: number; d31to60: number; d61to90: number; d90plus: number; total: number };

export function ageItems(items: { dueDate: string | null; outstandingCents: number }[], asAt: string): AgedBuckets {
  const out: AgedBuckets = { current: 0, d1to30: 0, d31to60: 0, d61to90: 0, d90plus: 0, total: 0 };
  const asAtMs = Date.parse(asAt);
  for (const it of items) {
    if (it.outstandingCents === 0) continue;
    const days = it.dueDate ? Math.floor((asAtMs - Date.parse(it.dueDate)) / 86_400_000) : 0;
    const key: keyof AgedBuckets = days <= 0 ? "current" : days <= 30 ? "d1to30" : days <= 60 ? "d31to60" : days <= 90 ? "d61to90" : "d90plus";
    out[key] += it.outstandingCents;
    out.total += it.outstandingCents;
  }
  return out;
}

// ─── Profit & loss by month ──────────────────────────────────────────────────

export type TrendRow = { accountId: string; code: string; name: string; amounts: number[]; totalCents: number };
export type TrendSection = { id: string; rows: TrendRow[]; totals: number[]; totalCents: number };
export type ProfitTrend = {
  income: TrendSection;
  costOfSales: TrendSection;
  otherIncome: TrendSection;
  expenses: TrendSection;
  grossProfit: number[];
  netProfit: number[];
  netProfitTotalCents: number;
};

/** One P&L per period, side by side — `periods[i]` is the movements of column i. */
export function profitTrend(accounts: LedgerAccount[], periods: AccountMovement[][]): ProfitTrend {
  const maps = periods.map(toMovementMap);
  const cols = maps.length;
  const trend = (id: string, subtypes: AccountSubtype[]): TrendSection => {
    const rows: TrendRow[] = [];
    for (const a of accounts) {
      if (!subtypes.includes(a.subtype)) continue;
      const amounts = maps.map((m) => normalBalance(a, m.get(a.id)));
      if (amounts.every((x) => x === 0)) continue;
      rows.push({ accountId: a.id, code: a.code, name: a.name, amounts, totalCents: amounts.reduce((s, x) => s + x, 0) });
    }
    rows.sort((x, y) => x.code.localeCompare(y.code, undefined, { numeric: true }));
    const totals = Array.from({ length: cols }, (_, i) => rows.reduce((s, r) => s + r.amounts[i], 0));
    return { id, rows, totals, totalCents: totals.reduce((s, x) => s + x, 0) };
  };
  const income = trend("income", ["revenue"]);
  const costOfSales = trend("costOfSales", ["direct_cost"]);
  const otherIncome = trend("otherIncome", ["other_income"]);
  const expenses = trend("expenses", ["expense", "depreciation", "other_expense"]);
  const grossProfit = income.totals.map((x, i) => x - costOfSales.totals[i]);
  const netProfit = grossProfit.map((x, i) => x + otherIncome.totals[i] - expenses.totals[i]);
  return { income, costOfSales, otherIncome, expenses, grossProfit, netProfit, netProfitTotalCents: netProfit.reduce((s, x) => s + x, 0) };
}

// ─── Cash flow statement (indirect method) ───────────────────────────────────

export type CashFlowLine = { key: string; accountId?: string; label: string; amountCents: number };
export type CashFlow = {
  netProfitCents: number;
  operating: CashFlowLine[];
  operatingTotalCents: number;
  investing: CashFlowLine[];
  investingTotalCents: number;
  financing: CashFlowLine[];
  financingTotalCents: number;
  netChangeCents: number;
  openingCashCents: number;
  closingCashCents: number;
  /** Net change − actual change in bank balances. Zero for a ledger that balances. */
  unexplainedCents: number;
};

/**
 * Where the cash came from and went, from the period's movements alone.
 *
 * A balance-sheet account's change over the period IS its movement in the
 * period, so no opening/closing balances are needed for the body — only for
 * the cash lines at the bottom. Signs are cash-positive: an increase in an
 * asset (receivables, equipment) used cash; an increase in a liability or in
 * equity (a loan, the owner putting money in) provided it.
 *
 * Depreciation is added back under operating; equipment bought shows under
 * investing at cost (its net movement plus that period's depreciation), so the
 * two halves meet without a separate fixed-asset register.
 */
export function cashFlow(accounts: LedgerAccount[], period: AccountMovement[], beforePeriod: AccountMovement[]): CashFlow {
  const mv = toMovementMap(period);
  const before = toMovementMap(beforePeriod);
  const netProfit = netProfitOf(accounts, period);
  // Debit movement = cash used for an asset; credit movement = cash provided.
  const cashEffect = (a: LedgerAccount) => {
    const m = mv.get(a.id);
    return m ? m.credit - m.debit : 0;
  };

  let depreciation = 0;
  for (const a of accounts) if (a.subtype === "depreciation") depreciation += normalBalance(a, mv.get(a.id));

  const lines = (subtypes: AccountSubtype[]) =>
    accounts
      .filter((a) => subtypes.includes(a.subtype))
      .map((a) => ({ key: a.subtype, accountId: a.id, label: `${a.code} ${a.name}`, amountCents: cashEffect(a) }))
      .filter((l) => l.amountCents !== 0)
      .sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }));

  const operating: CashFlowLine[] = [
    { key: "netProfit", label: "netProfit", amountCents: netProfit },
    ...(depreciation ? [{ key: "depreciation", label: "depreciation", amountCents: depreciation }] : []),
    ...lines(["receivable", "current_asset", "inventory", "payable", "tax", "current_liability"]),
  ];
  // Fixed assets at cost: their net movement already nets off depreciation.
  const investing: CashFlowLine[] = lines(["fixed_asset", "non_current_asset"]);
  if (depreciation) investing.push({ key: "depreciationOffset", label: "depreciationOffset", amountCents: -depreciation });
  const financing: CashFlowLine[] = lines(["non_current_liability", "equity", "retained_earnings"]);

  const sum = (ls: CashFlowLine[]) => ls.reduce((s, l) => s + l.amountCents, 0);
  const operatingTotal = sum(operating);
  const investingTotal = sum(investing);
  const financingTotal = sum(financing);
  const netChange = operatingTotal + investingTotal + financingTotal;

  const banks = accounts.filter((a) => a.subtype === "bank");
  const opening = banks.reduce((s, a) => s + normalBalance(a, before.get(a.id)), 0);
  const change = banks.reduce((s, a) => s + normalBalance(a, mv.get(a.id)), 0);

  return {
    netProfitCents: netProfit,
    operating,
    operatingTotalCents: operatingTotal,
    investing,
    investingTotalCents: investingTotal,
    financing,
    financingTotalCents: financingTotal,
    netChangeCents: netChange,
    openingCashCents: opening,
    closingCashCents: opening + change,
    unexplainedCents: netChange - change,
  };
}
