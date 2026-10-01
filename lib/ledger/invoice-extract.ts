// ============================================================================
//  Reading a supplier invoice into a draft bill.
//
//  Pure. The server sends the document to whichever model the studio has a
//  key for (lib/integrations/ai.ts), gets JSON back, and these functions turn
//  that JSON into something the bill editor can show:
//
//    normaliseExtraction  untrusted model output → a typed, sanity-checked shape
//    planDraftBill        that shape + the studio's chart → bill fields and lines
//
//  Nothing here approves anything. The result is always a DRAFT a person
//  reviews next to the original document, and every guess that didn't add up
//  comes back as a warning the review screen shows.
// ============================================================================

export type ExtractedLine = {
  description: string;
  quantity: number | null;
  unitAmount: number | null;
  amount: number | null;
  accountCode: string | null;
};

export type InvoiceExtraction = {
  isInvoice: boolean;
  supplierName: string | null;
  supplierEmail: string | null;
  supplierTaxNumber: string | null;
  invoiceNumber: string | null;
  issueDate: string | null;
  dueDate: string | null;
  currency: string | null;
  amountsIncludeTax: boolean | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  lines: ExtractedLine[];
};

const nullable = (type: string) => ({ type: [type, "null"] });

/** JSON Schema handed to the model as its output format. */
export const INVOICE_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "isInvoice",
    "supplierName",
    "supplierEmail",
    "supplierTaxNumber",
    "invoiceNumber",
    "issueDate",
    "dueDate",
    "currency",
    "amountsIncludeTax",
    "subtotal",
    "tax",
    "total",
    "lines",
  ],
  properties: {
    isInvoice: { type: "boolean" },
    supplierName: nullable("string"),
    supplierEmail: nullable("string"),
    supplierTaxNumber: nullable("string"),
    invoiceNumber: nullable("string"),
    issueDate: nullable("string"),
    dueDate: nullable("string"),
    currency: nullable("string"),
    amountsIncludeTax: nullable("boolean"),
    subtotal: nullable("number"),
    tax: nullable("number"),
    total: nullable("number"),
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["description", "quantity", "unitAmount", "amount", "accountCode"],
        properties: {
          description: { type: "string" },
          quantity: nullable("number"),
          unitAmount: nullable("number"),
          amount: nullable("number"),
          accountCode: nullable("string"),
        },
      },
    },
  },
} as const;

/** The instructions that go with the document. `accounts` lets the model suggest a code per line. */
export function extractionPrompt(opts: { studioName: string; baseCurrency: string; taxName: string; accounts: { code: string; name: string }[] }) {
  const chart = opts.accounts.map((a) => `${a.code} ${a.name}`).join("\n");
  return {
    system:
      `You read supplier invoices and receipts for ${opts.studioName}, a studio that keeps its books in ${opts.baseCurrency}. ` +
      `Copy what is printed on the document; never guess a value that isn't there — use null instead. ` +
      `Dates are YYYY-MM-DD. Amounts are plain numbers in the document's currency (no symbols, no thousands separators). ` +
      `"tax" is the ${opts.taxName} (or VAT/GST/sales tax) shown on the document. ` +
      `"amountsIncludeTax" is true when the line amounts already include that tax, false when tax is added on top, null if you can't tell. ` +
      `${opts.studioName} is the customer, not the supplier: the supplier is whoever issued the document and is being paid. ` +
      `If the document is not an invoice, bill or receipt, set isInvoice to false.`,
    user:
      `Extract this document. For each line, pick the best-fitting account code from this chart of accounts, or null if none fits:\n\n${chart}`,
  };
}

// ─── Untrusted → typed ───────────────────────────────────────────────────────

const str = (v: unknown, max = 200): string | null => {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};

const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return v.trim() && Number.isFinite(n) ? n : null;
  }
  return null;
};

function isoDate(v: unknown): string | null {
  const s = str(v, 10);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

/** Parse whatever the model returned. Null when it isn't an object at all. */
export function normaliseExtraction(raw: unknown): InvoiceExtraction | null {
  let v = raw;
  if (typeof v === "string") {
    try {
      v = JSON.parse(v.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const lines = Array.isArray(o.lines) ? o.lines : [];
  // Read the whole value before checking it: truncating first would turn
  // "dollars" into "DOL" and pass it off as an ISO code.
  const currency = str(o.currency, 20)?.toUpperCase() ?? null;
  return {
    isInvoice: o.isInvoice !== false,
    supplierName: str(o.supplierName, 150),
    supplierEmail: str(o.supplierEmail, 200),
    supplierTaxNumber: str(o.supplierTaxNumber, 40),
    invoiceNumber: str(o.invoiceNumber, 60),
    issueDate: isoDate(o.issueDate),
    dueDate: isoDate(o.dueDate),
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    amountsIncludeTax: typeof o.amountsIncludeTax === "boolean" ? o.amountsIncludeTax : null,
    subtotal: num(o.subtotal),
    tax: num(o.tax),
    total: num(o.total),
    lines: lines
      .slice(0, 100)
      .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
      .map((l) => ({
        description: str(l.description, 300) ?? "",
        quantity: num(l.quantity),
        unitAmount: num(l.unitAmount),
        amount: num(l.amount),
        accountCode: str(l.accountCode, 20),
      }))
      .filter((l) => l.description || l.amount != null),
  };
}

// ─── Typed → draft bill ──────────────────────────────────────────────────────

export type DraftBillPlan = {
  reference: string | null;
  issueDate: string | null;
  dueDate: string | null;
  amountsIncludeTax: boolean;
  lines: { description: string; accountId: string; taxRateId: string | null; quantity: number; unitCents: number }[];
  /** Keys under books.inbox.warnings. */
  warnings: ("notInvoice" | "foreignCurrency" | "linesDontAddUp" | "noAmounts")[];
};

export type PlanContext = {
  accounts: { id: string; code: string }[];
  /** Used when neither the model nor the supplier picked an account. */
  fallbackAccountId: string;
  /** The supplier's default account, when the contact has one. */
  contactDefaultAccountId: string | null;
  taxRegistered: boolean;
  defaultPurchaseRateId: string | null;
  /** A 0% purchase rate, for documents that show no tax. */
  noTaxRateId: string | null;
  baseCurrency: string;
  pricesIncludeTax: boolean;
};

const cents = (n: number) => Math.round(n * 100);

export function planDraftBill(ex: InvoiceExtraction, ctx: PlanContext): DraftBillPlan {
  const warnings: DraftBillPlan["warnings"] = [];
  if (!ex.isInvoice) warnings.push("notInvoice");
  if (ex.currency && ex.currency !== ctx.baseCurrency) warnings.push("foreignCurrency");

  const lineSum = ex.lines.reduce((s, l) => s + (l.amount ?? (l.quantity ?? 1) * (l.unitAmount ?? 0)), 0);
  const near = (a: number | null, b: number) => a != null && Math.abs(cents(a) - cents(b)) <= 1;

  // Inclusive or exclusive: what the document says, else whichever total the
  // lines add up to, else the studio's own habit.
  let inclusive = ex.amountsIncludeTax ?? ctx.pricesIncludeTax;
  if (ex.amountsIncludeTax == null && ex.lines.length && ex.tax) {
    if (near(ex.total, lineSum)) inclusive = true;
    else if (near(ex.subtotal, lineSum)) inclusive = false;
  }

  const byCode = new Map(ctx.accounts.map((a) => [a.code.toUpperCase(), a.id]));
  const accountFor = (code: string | null) =>
    (code && byCode.get(code.toUpperCase())) || ctx.contactDefaultAccountId || ctx.fallbackAccountId;
  const showsNoTax = ex.tax === 0 || (ex.tax == null && ex.subtotal != null && ex.total != null && near(ex.subtotal, ex.total));
  const taxRateId = !ctx.taxRegistered ? null : showsNoTax ? (ctx.noTaxRateId ?? ctx.defaultPurchaseRateId) : ctx.defaultPurchaseRateId;

  let lines: DraftBillPlan["lines"] = ex.lines
    .map((l) => {
      const amount = l.amount ?? (l.unitAmount != null ? (l.quantity ?? 1) * l.unitAmount : null);
      if (amount == null || amount <= 0) return null;
      // Keep quantity × unit only when it reproduces the line amount exactly;
      // otherwise one line of the amount, so the bill never drifts by a cent.
      const qty = l.quantity && l.quantity > 0 ? l.quantity : 1;
      const unit = l.unitAmount != null && near(qty * l.unitAmount, amount) && Number.isInteger(qty) ? l.unitAmount : null;
      return {
        description: l.description || ex.supplierName || "Bill line",
        accountId: accountFor(l.accountCode),
        taxRateId,
        quantity: unit != null ? qty : 1,
        unitCents: cents(unit ?? amount),
      };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);

  // No usable lines: one line for the whole document.
  const headline = inclusive ? ex.total : (ex.subtotal ?? (ex.total != null && ex.tax != null ? ex.total - ex.tax : ex.total));
  if (!lines.length && headline != null && headline > 0) {
    lines = [
      {
        description: [ex.supplierName, ex.invoiceNumber].filter(Boolean).join(" ") || "Bill",
        accountId: accountFor(null),
        taxRateId,
        quantity: 1,
        unitCents: cents(headline),
      },
    ];
  }

  if (!lines.length) warnings.push("noAmounts");
  else if (headline != null && ex.lines.length) {
    const planned = lines.reduce((s, l) => s + Math.round(l.quantity * l.unitCents), 0);
    if (Math.abs(planned - cents(headline)) > 1) warnings.push("linesDontAddUp");
  }

  return {
    reference: ex.invoiceNumber,
    issueDate: ex.issueDate,
    dueDate: ex.dueDate,
    amountsIncludeTax: inclusive,
    lines,
    warnings,
  };
}

/** Case- and punctuation-insensitive supplier name, for matching an existing contact. */
export function supplierKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(limited|ltd|llc|inc|pty|plc|gmbh|co)\b\.?/g, "")
    .replace(/[^a-z0-9]+/g, "");
}
