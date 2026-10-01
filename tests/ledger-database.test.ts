import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

// The Olune Books migration against real PostgreSQL (in-process), on top of
// the same tenant fixture the workspace-boundary test uses. This exercises the
// ledger's actual triggers, RPCs, grants and RLS — the invariants app code
// relies on but can't enforce by itself.
const db = new PGlite();
const A = "00000000-0000-0000-0000-0000000000a1";
const B = "00000000-0000-0000-0000-0000000000b1";
const adminA = "00000000-0000-0000-0000-0000000000a2";
const adminB = "00000000-0000-0000-0000-0000000000b2";

async function as(user: string) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
  await db.exec("set role authenticated");
}

const SETTINGS = {
  jurisdiction: "NZ", region: "", base_currency: "NZD", tax_registered: true, tax_number: "", tax_scheme: "payments",
  sales_tax_basis: "cash", purchases_tax_basis: "cash", filing_frequency: "bimonthly", tax_period_anchor_month: 2,
  fiscal_year_start_month: 4, fiscal_year_start_day: 1, conversion_date: "2026-04-01", prices_include_tax: true,
};
const RATES = [
  { code: "GST15", name: "15% GST on income", rate_bp: 1500, applies_to: "sales", report_category: "standard", components: [{ name: "GST", rateBp: 1500, salesAccountKey: "tax_collected", purchaseAccountKey: "tax_paid" }] },
  { code: "QST", name: "Fractional", rate_bp: 997.5, applies_to: "sales", report_category: "standard", components: [] },
];
const ACCOUNTS = [
  { code: "090", name: "Bank", type: "asset", subtype: "bank", system_key: "bank", bank_kind: "bank" },
  { code: "610", name: "Accounts receivable", type: "asset", subtype: "receivable", system_key: "ar" },
  { code: "200", name: "Sales", type: "revenue", subtype: "revenue", system_key: "sales", default_tax_code: "GST15" },
  { code: "820", name: "GST", type: "liability", subtype: "tax", system_key: "tax_collected" },
];

async function provision(studio: string) {
  await db.query("select public.ledger_provision($1, $2::jsonb, $3::jsonb, $4::jsonb)", [studio, JSON.stringify(SETTINGS), JSON.stringify(RATES), JSON.stringify(ACCOUNTS)]);
}
async function account(studio: string, code: string): Promise<string> {
  return (await db.query<{ id: string }>("select id from public.ledger_accounts where studio_id = $1 and code = $2", [studio, code])).rows[0].id;
}
async function rate(studio: string, code: string): Promise<string> {
  return (await db.query<{ id: string }>("select id from public.ledger_tax_rates where studio_id = $1 and code = $2", [studio, code])).rows[0].id;
}
async function post(studio: string, header: Record<string, unknown>, lines: Record<string, unknown>[]): Promise<string> {
  return (await db.query<{ id: string }>("select public.ledger_post_journal($1, $2::jsonb, $3::jsonb) as id", [studio, JSON.stringify(header), JSON.stringify(lines)])).rows[0].id;
}
/** Run deferred checks now (they'd otherwise wait for a COMMIT the test never issues). */
async function checkDeferred() {
  await db.exec("set constraints all immediate; set constraints all deferred;");
}
async function expectError(fn: () => Promise<unknown>, pattern: RegExp) {
  await db.exec("savepoint t");
  let message = "";
  try {
    await fn();
  } catch (e) {
    message = e instanceof Error ? e.message : String(e);
  }
  await db.exec("rollback to savepoint t");
  expect(message).toMatch(pattern);
}

beforeAll(async () => {
  await db.exec(readFileSync(new URL("./fixtures/tenant-context.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../supabase/migrations/20260930024829_onboarding_tenant_context.sql", import.meta.url), "utf8"));
  await db.exec("alter table public.studios add column if not exists accounting_provider text;");
  await db.exec(readFileSync(new URL("../supabase/migrations/20261001120000_olune_books.sql", import.meta.url), "utf8"));
}, 60_000);
afterAll(async () => {
  await db.close();
});
beforeEach(async () => {
  await db.exec(`begin;
    insert into studios(id,name,slug,status) values ('${A}','Studio A','studio-a','trial'),('${B}','Studio B','studio-b','trial');
    insert into profiles(id,studio_id,active_studio_id,role) values ('${adminA}','${A}','${A}','admin'),('${adminB}','${B}','${B}','admin');
    insert into studio_memberships(user_id,studio_id,role,status,is_primary) values
      ('${adminA}','${A}','admin','active',true),('${adminB}','${B}','admin','active',true);
  `);
  await as(adminA);
  await provision(A);
});
afterEach(async () => {
  await db.exec("rollback; reset role;");
});

const invoiceLines = (ar: string, sales: string, gst: string, gstRate: string) => [
  { account_id: ar, debit_cents: 11500 },
  { account_id: sales, credit_cents: 10000, tax_rate_id: gstRate, tax_cents: 1500 },
  { account_id: gst, credit_cents: 1500, is_tax_line: true },
];

describe("Olune Books ledger", () => {
  it("provisions settings, rates (incl. fractional bp) and chart, and pins the provider", async () => {
    const s = await db.query<{ jurisdiction: string }>("select jurisdiction from ledger_settings where studio_id = $1", [A]);
    expect(s.rows[0].jurisdiction).toBe("NZ");
    const q = await db.query<{ rate_bp: string }>("select rate_bp::text from ledger_tax_rates where studio_id = $1 and code = 'QST'", [A]);
    expect(Number(q.rows[0].rate_bp)).toBe(997.5);
    const sales = await db.query<{ default_tax_rate_id: string | null }>("select default_tax_rate_id from ledger_accounts where studio_id = $1 and code = '200'", [A]);
    expect(sales.rows[0].default_tax_rate_id).toBe(await rate(A, "GST15"));
    await db.exec("reset role");
    const p = await db.query<{ accounting_provider: string }>("select accounting_provider from studios where id = $1", [A]);
    expect(p.rows[0].accounting_provider).toBe("olune");
    await as(adminA);
    await expectError(() => provision(A), /already set up/);
  });

  it("posts a balanced journal and numbers journals sequentially per studio", async () => {
    const [ar, sales, gst, gstRate] = [await account(A, "610"), await account(A, "200"), await account(A, "820"), await rate(A, "GST15")];
    await post(A, { date: "2026-05-01", narration: "INV-1", source_type: "invoice", source_id: "11111111-1111-1111-1111-111111111111", tax_timing: "accrual", gross_cents: 11500 }, invoiceLines(ar, sales, gst, gstRate));
    await post(A, { date: "2026-05-02", narration: "Manual" }, [{ account_id: ar, debit_cents: 1 }, { account_id: sales, credit_cents: 1 }]);
    await checkDeferred();
    const n = await db.query<{ journal_number: number }>("select journal_number from ledger_journals where studio_id = $1 order by journal_number", [A]);
    expect(n.rows.map((r) => r.journal_number)).toEqual([1, 2]);
  });

  it("rejects an unbalanced journal when deferred checks run", async () => {
    const [ar, sales] = [await account(A, "610"), await account(A, "200")];
    await expectError(async () => {
      await post(A, { date: "2026-05-01", narration: "Bad" }, [{ account_id: ar, debit_cents: 100 }, { account_id: sales, credit_cents: 90 }]);
      await checkDeferred();
    }, /does not balance/);
  });

  it("enforces one live journal per source document", async () => {
    const [ar, sales] = [await account(A, "610"), await account(A, "200")];
    const header = { date: "2026-05-01", narration: "INV", source_type: "invoice", source_id: "22222222-2222-2222-2222-222222222222" };
    await post(A, header, [{ account_id: ar, debit_cents: 5 }, { account_id: sales, credit_cents: 5 }]);
    await expectError(() => post(A, header, [{ account_id: ar, debit_cents: 5 }, { account_id: sales, credit_cents: 5 }]), /duplicate key|ledger_journals_source_key/);
  });

  it("makes posted journals immutable except for voiding", async () => {
    const [ar, sales] = [await account(A, "610"), await account(A, "200")];
    const id = await post(A, { date: "2026-05-01", narration: "Original" }, [{ account_id: ar, debit_cents: 100 }, { account_id: sales, credit_cents: 100 }]);
    await checkDeferred();
    await expectError(() => db.query("update ledger_journals set narration = 'Edited' where id = $1", [id]), /cannot be edited/);
    await expectError(() => db.query("update ledger_journal_lines set debit_cents = 1 where journal_id = $1 and debit_cents > 0", [id]), /cannot be edited/);
    await expectError(() => db.query("delete from ledger_journal_lines where journal_id = $1", [id]), /permission denied|cannot be deleted/);
    await db.query("update ledger_journals set status = 'voided', voided_at = now(), void_reason = 'test' where id = $1", [id]);
    await expectError(() => db.query("update ledger_journals set status = 'posted' where id = $1", [id]), /reinstated/);
  });

  it("refuses postings and voids on or before the lock date; reversal goes to an open date", async () => {
    const [ar, sales] = [await account(A, "610"), await account(A, "200")];
    const id = await post(A, { date: "2026-05-01", narration: "May" }, [{ account_id: ar, debit_cents: 100 }, { account_id: sales, credit_cents: 100 }]);
    await checkDeferred();
    await db.query("update ledger_settings set lock_date = '2026-05-31' where studio_id = $1", [A]);
    await expectError(() => post(A, { date: "2026-05-15", narration: "Late" }, [{ account_id: ar, debit_cents: 1 }, { account_id: sales, credit_cents: 1 }]), /locked/);
    await expectError(() => db.query("update ledger_journals set status = 'voided', voided_at = now() where id = $1", [id]), /locked/);
    const rev = (await db.query<{ id: string }>("select public.ledger_reverse_journal($1, '2026-06-01', 'Fix') as id", [id])).rows[0].id;
    await checkDeferred();
    const lines = await db.query<{ debit_cents: string; credit_cents: string }>("select debit_cents::text, credit_cents::text from ledger_journal_lines where journal_id = $1 order by line_no", [rev]);
    expect(lines.rows).toEqual([{ debit_cents: "0", credit_cents: "100" }, { debit_cents: "100", credit_cents: "0" }]);
    const orig = await db.query<{ superseded_by: string }>("select superseded_by from ledger_journals where id = $1", [id]);
    expect(orig.rows[0].superseded_by).toBe(rev);
  });

  it("cash-basis tax summary counts only the paid share of an invoice", async () => {
    const [ar, sales, gst, bank, gstRate] = [await account(A, "610"), await account(A, "200"), await account(A, "820"), await account(A, "090"), await rate(A, "GST15")];
    const inv = await post(A, { date: "2026-05-01", narration: "INV", tax_timing: "accrual", gross_cents: 11500 }, invoiceLines(ar, sales, gst, gstRate));
    await post(A, { date: "2026-05-10", narration: "Half paid", tax_timing: "settlement", settles_journal_id: inv, settles_amount_cents: 5750 }, [{ account_id: bank, debit_cents: 5750 }, { account_id: ar, credit_cents: 5750 }]);
    await checkDeferred();
    const rows = await db.query<{ basis: string; direction: string; net_cents: string; tax_cents: string }>(
      "select basis, direction, net_cents::text, tax_cents::text from public.ledger_tax_summary($1, '2026-05-01', '2026-05-31') order by basis",
      [A],
    );
    expect(rows.rows).toEqual([
      { basis: "accrual", direction: "sales", net_cents: "10000", tax_cents: "1500" },
      { basis: "cash", direction: "sales", net_cents: "5000", tax_cents: "750" },
    ]);
  });

  it("isolates studios: no reads, no posting into another studio, no borrowing its accounts", async () => {
    const [ar, sales] = [await account(A, "610"), await account(A, "200")];
    await post(A, { date: "2026-05-01", narration: "A only" }, [{ account_id: ar, debit_cents: 1 }, { account_id: sales, credit_cents: 1 }]);
    await checkDeferred();

    await as(adminB);
    const seen = await db.query("select id from ledger_journals");
    expect(seen.rows).toHaveLength(0);
    await expectError(() => post(A, { date: "2026-05-01", narration: "Intrusion" }, [{ account_id: ar, debit_cents: 1 }, { account_id: sales, credit_cents: 1 }]), /row-level security|not set up|violates/);

    await provision(B);
    const bSales = await account(B, "200");
    // B's own journal pointing at A's receivables account.
    await expectError(() => post(B, { date: "2026-05-01", narration: "Borrow" }, [{ account_id: ar, debit_cents: 1 }, { account_id: bSales, credit_cents: 1 }]), /does not belong|violates|permission/);
  });

  it("is not callable by anon", async () => {
    await db.exec("reset role; set role anon");
    await expectError(() => db.query("select public.ledger_account_balances($1, null, '2026-12-31')", [A]), /permission denied/);
  });
});
