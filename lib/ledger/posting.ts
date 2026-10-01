// ============================================================================
//  The posting engine: source documents in, balanced journals out.
//
//  Pure. Callers load the studio's chart and rates once, wrap them in a
//  ChartIndex, and hand in plain records — so every rule here is unit-tested
//  without a database, and the sync, the bills screen and bank reconciliation
//  all post through the same code.
//
//  Sign conventions
//    • A journal line is a debit XOR a credit, both non-negative.
//    • `tax_cents` on a line is the tax that went with that net amount, on the
//      same side. The tax itself is posted separately on is_tax_line rows, so
//      a report summing tax_cents never double counts.
//    • Direction (sales vs purchases) follows the line's ACCOUNT: revenue
//      accounts are sales, everything else is purchases. That's what lets a
//      supplier refund (money in, coded to an expense) reduce input tax rather
//      than look like a sale.
//
//  Rounding: inclusive amounts split as round(gross − gross / (1 + rate)),
//  matching lib/billing/tax.ts and therefore every invoice Olune has issued.
//  Multi-component rates give each component its proportional share and the
//  last one the remainder, so components always sum to the line's tax.
// ============================================================================

import type {
  DraftJournal,
  DraftLine,
  LedgerAccount,
  SystemKey,
  TaxComponent,
  TaxRate,
  TaxTiming,
} from "./types";
import { OLUNE_CODE_ALIASES, SYSTEM_KEY_FALLBACKS } from "./types";

export type TaxTreatment = "standard" | "zero_rated" | "exempt";

export class ChartIndex {
  readonly byId = new Map<string, LedgerAccount>();
  readonly byCode = new Map<string, LedgerAccount>();
  readonly byKey = new Map<string, LedgerAccount>();
  readonly ratesById = new Map<string, TaxRate>();
  readonly ratesByCode = new Map<string, TaxRate>();

  constructor(
    readonly accounts: LedgerAccount[],
    readonly rates: TaxRate[],
    readonly opts: {
      taxRegistered: boolean;
      defaultSalesCode: string | null;
      zeroSalesCode: string | null;
      exemptSalesCode: string | null;
    },
  ) {
    for (const a of accounts) {
      this.byId.set(a.id, a);
      this.byCode.set(a.code.toUpperCase(), a);
      if (a.systemKey) this.byKey.set(a.systemKey, a);
    }
    for (const r of rates) {
      this.ratesById.set(r.id, r);
      this.ratesByCode.set(r.code, r);
    }
  }

  /** The account playing `key`, following fallbacks (tax_paid → tax_collected…). */
  account(key: SystemKey): LedgerAccount {
    const direct = this.byKey.get(key);
    if (direct) return direct;
    for (const fb of SYSTEM_KEY_FALLBACKS[key] ?? []) {
      const a = this.byKey.get(fb);
      if (a) return a;
    }
    throw new Error(`The chart of accounts has no account for "${key}"`);
  }

  maybeAccount(key: SystemKey): LedgerAccount | null {
    try {
      return this.account(key);
    } catch {
      return null;
    }
  }

  accountForCode(code: string | null | undefined, fallback: SystemKey = "sales"): LedgerAccount {
    if (code) {
      const a = this.byCode.get(code.trim().toUpperCase());
      if (a) return a;
      const alias = OLUNE_CODE_ALIASES[code.trim()];
      if (alias) return this.account(alias);
    }
    return this.account(fallback);
  }

  /**
   * The ledger rate for an Olune line's (treatment, rate). A standard line
   * prefers a live sales rate with the same percentage (so a 7% product lands
   * on the 7% rate), then the jurisdiction default.
   */
  salesRateFor(treatment: TaxTreatment | null | undefined, rateBp: number | null | undefined): TaxRate | null {
    if (!this.opts.taxRegistered) return null;
    const t = treatment ?? "standard";
    if (t === "zero_rated") return this.rateByCode(this.opts.zeroSalesCode);
    if (t === "exempt") return this.rateByCode(this.opts.exemptSalesCode);
    if (rateBp != null) {
      const match = this.rates.find(
        (r) => !r.isArchived && r.appliesTo !== "purchases" && r.rateBp === rateBp && r.components.length > 0,
      );
      if (match) return match;
    }
    return this.rateByCode(this.opts.defaultSalesCode);
  }

  rateByCode(code: string | null | undefined): TaxRate | null {
    if (!code) return null;
    return this.ratesByCode.get(code) ?? null;
  }

  rate(id: string | null | undefined): TaxRate | null {
    if (!id || !this.opts.taxRegistered) return null;
    return this.ratesById.get(id) ?? null;
  }
}

// ─── Tax maths ───────────────────────────────────────────────────────────────

export type ComponentShare = { component: TaxComponent; cents: number };

export type TaxedAmount = {
  netCents: number;
  taxCents: number;
  grossCents: number;
  components: ComponentShare[];
};

/** Split `amountCents` under `rate`. Negative amounts (credits, discounts) mirror positives. */
export function applyTax(amountCents: number, rate: TaxRate | null, inclusive: boolean): TaxedAmount {
  const amount = Math.round(amountCents);
  if (!rate || rate.rateBp <= 0 || rate.components.length === 0) {
    return { netCents: amount, taxCents: 0, grossCents: amount, components: [] };
  }
  const sign = amount < 0 ? -1 : 1;
  const abs = Math.abs(amount);
  const r = rate.rateBp / 10_000;
  const tax = inclusive ? Math.round(abs - abs / (1 + r)) : Math.round(abs * r);
  const net = inclusive ? abs - tax : abs;

  const components: ComponentShare[] = [];
  let allocated = 0;
  rate.components.forEach((c, i) => {
    const last = i === rate.components.length - 1;
    const cents = last ? tax - allocated : Math.round((tax * c.rateBp) / rate.rateBp);
    allocated += cents;
    components.push({ component: c, cents: sign * cents });
  });

  return { netCents: sign * net, taxCents: sign * tax, grossCents: sign * (net + tax), components };
}

// ─── Line builders ───────────────────────────────────────────────────────────

/** A line from a signed amount: positive credits, negative debits. Zero → nothing. */
function creditLine(accountId: string, signedCredit: number, extra: Partial<DraftLine> = {}): DraftLine | null {
  const amount = Math.round(signedCredit);
  if (amount === 0) return null;
  return {
    accountId,
    debitCents: amount < 0 ? -amount : 0,
    creditCents: amount > 0 ? amount : 0,
    ...extra,
  };
}

function debitLine(accountId: string, signedDebit: number, extra: Partial<DraftLine> = {}): DraftLine | null {
  return creditLine(accountId, -signedDebit, extra);
}

type TaxedLineInput = {
  account: LedgerAccount;
  /** Signed: positive is the account's "income" side for revenue, "spend" side otherwise. */
  amountCents: number;
  rate: TaxRate | null;
  description?: string | null;
  contactName?: string | null;
};

/**
 * Lines for a set of taxed amounts on one side of a journal.
 *
 * `side` is where the net amounts go: "credit" for sales and money in,
 * "debit" for purchases and money out. Tax postings follow the same side,
 * each component to its own account — or, for a purchase component that
 * isn't recoverable, folded into the net line (it's a cost, not a credit).
 *
 * Returns the lines and the total including tax, which is what the
 * balancing line (AR, AP, bank) carries.
 */
export function taxedLines(
  chart: ChartIndex,
  items: TaxedLineInput[],
  side: "credit" | "debit",
  inclusive: boolean,
): { lines: DraftLine[]; totalCents: number } {
  const lines: DraftLine[] = [];
  const taxByAccount = new Map<string, number>();
  let total = 0;

  for (const item of items) {
    const taxed = applyTax(item.amountCents, item.rate, inclusive);
    const isRevenue = item.account.type === "revenue";
    let net = taxed.netCents;
    let recoverableTax = 0;

    for (const share of taxed.components) {
      const key = isRevenue ? share.component.salesAccountKey : share.component.purchaseAccountKey;
      if (!key) {
        net += share.cents;
        continue;
      }
      recoverableTax += share.cents;
      const acct = chart.account(key);
      taxByAccount.set(acct.id, (taxByAccount.get(acct.id) ?? 0) + share.cents);
    }

    const make = side === "credit" ? creditLine : debitLine;
    const line = make(item.account.id, net, {
      description: item.description ?? null,
      taxRateId: item.rate?.id ?? null,
      taxCents: Math.abs(recoverableTax),
      contactName: item.contactName ?? null,
    });
    if (line) {
      // tax_cents is unsigned and rides on the line's side; a negative net with
      // positive tax can't happen (both share the amount's sign).
      lines.push(line);
    } else if (recoverableTax !== 0) {
      // 100% tax with zero net isn't a real case, but don't lose the tax.
      throw new Error("Taxed line with zero net amount");
    }
    total += net + recoverableTax;
  }

  for (const [accountId, cents] of taxByAccount) {
    const make = side === "credit" ? creditLine : debitLine;
    const line = make(accountId, cents, { isTaxLine: true });
    if (line) lines.push(line);
  }

  return { lines, totalCents: total };
}

// ─── Source document → journal ───────────────────────────────────────────────

export type SaleLineInput = {
  description: string;
  lineTotalCents: number;
  accountCode: string | null;
  taxTreatment: TaxTreatment | null;
  taxRateBp: number | null;
};

export type InvoiceInput = {
  id: string;
  reference: string;
  date: string;
  contactName: string | null;
  taxInclusive: boolean;
  amountCents: number;
  /** The invoice's stored tax, used only when it has no line items. */
  gstCents: number;
  lines: SaleLineInput[];
};

function saleItems(chart: ChartIndex, lines: SaleLineInput[], contactName: string | null): TaxedLineInput[] {
  return lines
    .filter((l) => Math.round(l.lineTotalCents) !== 0)
    .map((l) => ({
      account: chart.accountForCode(l.accountCode, "sales"),
      amountCents: l.lineTotalCents,
      rate: chart.salesRateFor(l.taxTreatment, l.taxRateBp),
      description: l.description,
      contactName,
    }));
}

/**
 * Add a rounding line so the balancing amount equals what the document says
 * it's for. Invoices carry a stored total the family was actually billed; the
 * ledger must agree with it to the cent even if our per-line split doesn't.
 */
function plugRounding(chart: ChartIndex, lines: DraftLine[], computed: number, expected: number, side: "credit" | "debit") {
  const diff = expected - computed;
  if (diff === 0) return;
  if (Math.abs(diff) > Math.max(5, Math.abs(expected) * 0.001)) {
    throw new Error(`Line items don't add up to the document total (off by ${diff} cents)`);
  }
  const acct = chart.account("rounding");
  const line = side === "credit" ? creditLine(acct.id, diff, { description: "Rounding" }) : debitLine(acct.id, diff, { description: "Rounding" });
  if (line) lines.push(line);
}

/** Invoice issued: Dr receivables / Cr revenue + tax. Accrual timing. */
export function invoiceJournal(chart: ChartIndex, inv: InvoiceInput): DraftJournal | null {
  if (Math.round(inv.amountCents) === 0) return null;

  let items = saleItems(chart, inv.lines, inv.contactName);
  let inclusive = inv.taxInclusive;

  if (items.length === 0) {
    // Legacy invoice with no line items: trust its stored GST split.
    const rate = inv.gstCents > 0 ? chart.salesRateFor("standard", null) : chart.opts.taxRegistered ? chart.salesRateFor("exempt", null) : null;
    items = [{ account: chart.account("sales"), amountCents: inv.amountCents, rate, description: inv.reference, contactName: inv.contactName }];
    inclusive = true;
  }

  const { lines, totalCents } = taxedLines(chart, items, "credit", inclusive);
  plugRounding(chart, lines, totalCents, inv.amountCents, "credit");
  const ar = debitLine(chart.account("ar").id, inv.amountCents, { contactName: inv.contactName, description: inv.reference });
  if (ar) lines.push(ar);

  return {
    date: inv.date,
    narration: `Invoice ${inv.reference}${inv.contactName ? ` — ${inv.contactName}` : ""}`,
    reference: inv.reference,
    sourceType: "invoice",
    sourceId: inv.id,
    taxTiming: "accrual",
    grossCents: inv.amountCents,
    contactName: inv.contactName,
    lines,
  };
}

export type CashSaleInput = {
  sourceType: "order" | "ticket";
  id: string;
  reference: string;
  date: string;
  contactName: string | null;
  taxInclusive: boolean;
  amountCents: number;
  lines: SaleLineInput[];
};

/** Point-of-sale (shop order, event ticket): Dr Stripe clearing / Cr revenue + tax. Cash timing. */
export function cashSaleJournal(chart: ChartIndex, sale: CashSaleInput): DraftJournal | null {
  if (Math.round(sale.amountCents) === 0) return null;
  let items = saleItems(chart, sale.lines, sale.contactName);
  if (items.length === 0) {
    items = [{ account: chart.account("sales"), amountCents: sale.amountCents, rate: chart.salesRateFor("standard", null), description: sale.reference, contactName: sale.contactName }];
  }
  const { lines, totalCents } = taxedLines(chart, items, "credit", sale.taxInclusive);
  plugRounding(chart, lines, totalCents, sale.amountCents, "credit");
  const bank = debitLine(chart.account("stripe_clearing").id, sale.amountCents, { contactName: sale.contactName });
  if (bank) lines.push(bank);
  return {
    date: sale.date,
    narration: `${sale.sourceType === "order" ? "Shop order" : "Event ticket"} ${sale.reference}${sale.contactName ? ` — ${sale.contactName}` : ""}`,
    reference: sale.reference,
    sourceType: sale.sourceType,
    sourceId: sale.id,
    taxTiming: "cash",
    grossCents: sale.amountCents,
    contactName: sale.contactName,
    lines,
  };
}

export type SettlementInput = {
  sourceType: "invoice_payment" | "invoice_manual_payment" | "bill_payment";
  id: string;
  date: string;
  amountCents: number;
  /** The bank-like account the money moved through. */
  bankAccountId: string;
  /** The accrual journal being paid, if it's in the ledger. */
  settlesJournalId: string | null;
  reference: string | null;
  contactName: string | null;
  narration: string;
};

/**
 * Money against an invoice (Dr bank / Cr AR) or a bill (Dr AP / Cr bank).
 * Settlement timing carries a share of the paid document's tax onto a
 * cash-basis return.
 */
export function settlementJournal(chart: ChartIndex, p: SettlementInput): DraftJournal | null {
  const amount = Math.round(p.amountCents);
  if (amount === 0) return null;
  const isBill = p.sourceType === "bill_payment";
  const control = chart.account(isBill ? "ap" : "ar");
  const lines = isBill
    ? [debitLine(control.id, amount, { contactName: p.contactName }), creditLine(p.bankAccountId, amount, { contactName: p.contactName })]
    : [debitLine(p.bankAccountId, amount, { contactName: p.contactName }), creditLine(control.id, amount, { contactName: p.contactName })];
  return {
    date: p.date,
    narration: p.narration,
    reference: p.reference,
    sourceType: p.sourceType,
    sourceId: p.id,
    taxTiming: p.settlesJournalId ? "settlement" : "none",
    settlesJournalId: p.settlesJournalId,
    settlesAmountCents: p.settlesJournalId ? amount : null,
    contactName: p.contactName,
    lines: lines.filter((l): l is DraftLine => !!l),
  };
}

export type PostedLine = {
  accountId: string;
  debitCents: number;
  creditCents: number;
  taxRateId: string | null;
  taxCents: number;
  isTaxLine: boolean;
  description: string | null;
};

export type RefundInput = {
  id: string;
  date: string;
  refundCents: number;
  /** The sale's own journal, when it's in the ledger. */
  original: { grossCents: number; lines: PostedLine[] } | null;
  reference: string | null;
  contactName: string | null;
  narration: string;
  taxInclusive: boolean;
};

/**
 * A refund is a credit note settled in cash: it reverses the refunded share of
 * the original sale's revenue and tax, and pays out of Stripe clearing.
 * Without the original (a sale from before the books started) it reverses
 * revenue at the default sales rate.
 */
export function refundJournal(chart: ChartIndex, r: RefundInput): DraftJournal | null {
  const refund = Math.abs(Math.round(r.refundCents));
  if (refund === 0) return null;
  const lines: DraftLine[] = [];
  const clearing = chart.account("stripe_clearing");
  const ar = chart.maybeAccount("ar");

  if (r.original && r.original.grossCents !== 0) {
    const fraction = Math.min(refund / Math.abs(r.original.grossCents), 1);
    let reversed = 0;
    for (const l of r.original.lines) {
      // Reverse everything except the side that balanced the sale (AR / bank).
      if (l.accountId === clearing.id || (ar && l.accountId === ar.id) || chart.byId.get(l.accountId)?.subtype === "bank") continue;
      const credit = Math.round(l.creditCents * fraction);
      const debit = Math.round(l.debitCents * fraction);
      const line = credit > 0
        ? debitLine(l.accountId, credit, { taxRateId: l.taxRateId, taxCents: Math.round(l.taxCents * fraction), isTaxLine: l.isTaxLine, description: l.description })
        : creditLine(l.accountId, debit, { taxRateId: l.taxRateId, taxCents: Math.round(l.taxCents * fraction), isTaxLine: l.isTaxLine, description: l.description });
      if (line) {
        lines.push(line);
        reversed += credit - debit;
      }
    }
    plugRounding(chart, lines, -reversed, -refund, "credit");
  } else {
    const { lines: l, totalCents } = taxedLines(
      chart,
      [{ account: chart.account("sales"), amountCents: refund, rate: chart.salesRateFor("standard", null), description: r.narration, contactName: r.contactName }],
      "debit",
      r.taxInclusive,
    );
    lines.push(...l);
    plugRounding(chart, lines, -totalCents, -refund, "credit");
  }

  const out = creditLine(clearing.id, refund, { contactName: r.contactName });
  if (out) lines.push(out);

  return {
    date: r.date,
    narration: r.narration,
    reference: r.reference,
    sourceType: "refund",
    sourceId: r.id,
    taxTiming: "cash",
    grossCents: refund,
    contactName: r.contactName,
    lines,
  };
}

export type BillLineInput = {
  description: string;
  accountId: string;
  taxRateId: string | null;
  lineTotalCents: number;
};

export type BillInput = {
  id: string;
  reference: string;
  date: string;
  contactName: string;
  amountsIncludeTax: boolean;
  lines: BillLineInput[];
};

/** Bill approved: Dr expenses + recoverable tax / Cr payables. Accrual timing. */
export function billJournal(chart: ChartIndex, bill: BillInput): { journal: DraftJournal; totals: { subtotalCents: number; taxCents: number; totalCents: number } } {
  const items: TaxedLineInput[] = bill.lines
    .filter((l) => Math.round(l.lineTotalCents) !== 0)
    .map((l) => {
      const account = chart.byId.get(l.accountId);
      if (!account) throw new Error("Unknown account on bill line");
      return { account, amountCents: l.lineTotalCents, rate: chart.rate(l.taxRateId), description: l.description, contactName: bill.contactName };
    });
  if (items.length === 0) throw new Error("A bill needs at least one line with an amount");

  const { lines, totalCents } = taxedLines(chart, items, "debit", bill.amountsIncludeTax);
  const taxCents = lines.filter((l) => l.isTaxLine).reduce((s, l) => s + l.debitCents - l.creditCents, 0);
  const ap = creditLine(chart.account("ap").id, totalCents, { contactName: bill.contactName, description: bill.reference });
  if (ap) lines.push(ap);

  return {
    journal: {
      date: bill.date,
      narration: `Bill ${bill.reference} — ${bill.contactName}`,
      reference: bill.reference,
      sourceType: "bill",
      sourceId: bill.id,
      taxTiming: "accrual",
      grossCents: totalCents,
      contactName: bill.contactName,
      lines,
    },
    totals: { subtotalCents: totalCents - taxCents, taxCents, totalCents },
  };
}

export type BankCodingLine = {
  accountId: string;
  taxRateId: string | null;
  /** Unsigned share of the statement amount (tax-inclusive). */
  amountCents: number;
  description?: string | null;
};

/**
 * A statement line coded directly to accounts (spend / receive money, or a
 * transfer when the counter-account is another bank). Cash timing.
 */
export function bankCodedJournal(
  chart: ChartIndex,
  t: { id: string; date: string; amountCents: number; bankAccountId: string; description: string; reference: string | null; contactName: string | null },
  coding: BankCodingLine[],
): DraftJournal {
  const moneyIn = t.amountCents > 0;
  const total = Math.abs(t.amountCents);
  const coded = coding.reduce((s, c) => s + Math.round(c.amountCents), 0);
  if (coded !== total) throw new Error(`Coded amounts (${coded}) must equal the statement line (${total})`);

  const items: TaxedLineInput[] = coding.map((c) => {
    const account = chart.byId.get(c.accountId);
    if (!account) throw new Error("Unknown account");
    return { account, amountCents: c.amountCents, rate: chart.rate(c.taxRateId), description: c.description ?? t.description, contactName: t.contactName };
  });

  const { lines, totalCents } = taxedLines(chart, items, moneyIn ? "credit" : "debit", true);
  plugRounding(chart, lines, totalCents, total, moneyIn ? "credit" : "debit");
  const bank = moneyIn ? debitLine(t.bankAccountId, total) : creditLine(t.bankAccountId, total);
  if (bank) lines.push(bank);

  const isTransfer = items.every((i) => i.account.subtype === "bank");
  const anyTax = lines.some((l) => (l.taxCents ?? 0) > 0 || l.taxRateId);
  return {
    date: t.date,
    narration: t.description || (moneyIn ? "Money received" : "Money spent"),
    reference: t.reference,
    sourceType: isTransfer ? "transfer" : "bank",
    sourceId: t.id,
    taxTiming: anyTax ? "cash" : "none",
    contactName: t.contactName,
    lines,
  };
}

/** Manual journal from the UI. Lines may carry a tax rate on net amounts entered by the user. */
export function manualJournal(input: {
  date: string;
  narration: string;
  reference?: string | null;
  sourceType?: "manual" | "opening_balance";
  lines: DraftLine[];
}): DraftJournal {
  const lines = input.lines.filter((l) => l.debitCents > 0 || l.creditCents > 0);
  const anyTax = lines.some((l) => l.taxRateId);
  return {
    date: input.date,
    narration: input.narration,
    reference: input.reference ?? null,
    sourceType: input.sourceType ?? "manual",
    sourceId: null,
    taxTiming: anyTax ? "cash" : "none",
    lines,
  };
}

/** Balance check the UI runs before calling the database (which checks again). */
export function journalImbalance(lines: Pick<DraftLine, "debitCents" | "creditCents">[]): number {
  return lines.reduce((s, l) => s + Math.round(l.debitCents) - Math.round(l.creditCents), 0);
}

export function assertPostable(j: DraftJournal): void {
  if (j.lines.length < 2) throw new Error("A journal needs at least two lines");
  for (const l of j.lines) {
    if (l.debitCents < 0 || l.creditCents < 0) throw new Error("Negative amount on a journal line");
    if ((l.debitCents === 0) === (l.creditCents === 0)) throw new Error("Each line is either a debit or a credit");
  }
  const diff = journalImbalance(j.lines);
  if (diff !== 0) throw new Error(`Journal doesn't balance (off by ${diff} cents)`);
}

/** Stable fingerprint of a source document, for change detection. FNV-1a, 32-bit, hex. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

export function fingerprint(value: unknown): string {
  const text = stableStringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** Whether a journal's timing means it counts on a return at all. */
export function hasTaxEffect(timing: TaxTiming): boolean {
  return timing !== "none";
}
