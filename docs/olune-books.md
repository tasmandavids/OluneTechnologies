# Olune Books — the built-in ledger

Olune Books is the fourth accounting option beside Xero, QuickBooks and MYOB,
for studios that don't want external accounting software. A studio picks its
country and gets a working double-entry ledger set up for that country's tax
system: currency, tax rates, chart of accounts, filing frequency, accounting
basis and the official tax return form.

Routes: `/portal/admin/books/*` (admin only). Setup: `/portal/admin/books/setup`,
also reachable from Settings → Connections ("Set up Olune Books").

## What it does

| Area | What's there |
| --- | --- |
| Setup | Country (15 packs + custom), region (US states, CA provinces), tax registration and number check-digit validation, basis, filing frequency and period alignment, financial year, start date. One atomic `ledger_provision` RPC. |
| Auto-posting | Invoices, card payments, invoices marked paid, refunds, shop orders, event tickets. Edited invoices are re-posted; voided ones voided (or reversed when the period is locked). |
| Journals | Posted journals are immutable: void if the period is open, reversal if locked. Manual and opening-balance journals with tax-inclusive taxed lines. |
| Bills | Suppliers, draft → approve (posts Dr expense + input tax / Cr AP), payments (settlement journals), void. |
| Bank | CSV import (delimiter, column and date-order detection, multi-language headers), dedupe on re-import, match to existing ledger lines or code to accounts (spend / receive / transfer), exclude, unreconcile. |
| Tax returns | Periods from the start date, the jurisdiction's official boxes computed from the ledger on the studio's basis (incl. NZ hybrid), manual boxes, "mark filed" snapshots the figures, posts the EU-style settlement journal and moves the lock date. |
| Reports | P&L (with comparison period), balance sheet (virtual year-end), trial balance, account transactions, bank summary, aged receivables/payables, CSV export, journal export, FEC export for France, print. |

## Jurisdiction packs

`lib/ledger/jurisdictions/*.ts` — NZ, AU, GB, IE, US (+51 states/DC), CA (+13
provinces/territories), SG, ZA, DE, FR, IT, ES, NL, JP, KR, and a custom pack.

A pack is data applied **once** at setup and copied into the studio's own rows
(`ledger_tax_rates`, `ledger_accounts`). Changing a pack never rewrites an
existing studio's books. Rates and thresholds are "as at" `reviewedAt`; the UI
says so. Boxes we can't derive from the ledger (imports, intra-EU, adjustments)
are listed with `manual: true` rather than filled with invented numbers.

Return forms mapped: NZ GST101A, AU BAS, UK VAT100, IE VAT3, CA GST34 (+PST/QST),
SG GST F5, ZA VAT201, DE UStVA, FR CA3, IT LIPE, ES Modelo 303, NL btw-aangifte,
JP 消費税申告書 (national/local split), KR 부가가치세 신고서, US state sales tax.

Charts: Xero-style numbering for English packs (so a product's "200" lands on
Sales), national charts for FR (PCG), DE (SKR03) and ES (PGC), local-language
names for IT, NL, JP, KR.

**Adding a country:** add `lib/ledger/jurisdictions/<cc>.ts`, register it in
`index.ts`, add names to `lib/ledger/chart.ts` if it needs a new chart language.
`tests/ledger-jurisdictions.test.ts` sweeps every pack for dangling tax codes,
missing system accounts and broken return forms.

## Data model (migration `20261001120000_olune_books.sql`)

`ledger_settings`, `ledger_tax_rates`, `ledger_accounts`, `ledger_contacts`,
`ledger_journals`, `ledger_journal_lines`, `ledger_bills`, `ledger_bill_lines`,
`ledger_bill_payments`, `ledger_bank_transactions`, `ledger_tax_returns`.
All admin-only RLS via `private.current_studio()` / `private.current_user_role()`.

Invariants enforced in the database (private-schema triggers), whatever path writes:

- every journal balances (deferred constraint trigger, checked at commit)
- posted lines are immutable; a journal can only be voided or marked superseded
- nothing is posted, voided or edited on or before `lock_date`
- every line's account and tax rate belong to the journal's studio
- journal numbers are assigned per studio, gap-free
- one live journal per source document (`ledger_journals_source_key`) — the sync's idempotency key
- used tax rates and accounts can't be re-typed

RPCs (all SECURITY INVOKER, so RLS applies and they stay off the
`verify-function-grants` allowlist): `ledger_provision`, `ledger_post_journal`,
`ledger_reverse_journal`, `ledger_account_balances`, `ledger_tax_summary`.

## Tax timing (how cash vs invoice basis works)

Each journal has `tax_timing`:

- `accrual` — invoices and bills: count on their date under invoice basis
- `cash` — point-of-sale, refunds, bank-coded lines, manual taxed lines: count on their date under either basis
- `settlement` — a payment against an accrual journal: carries `settles_amount / gross` of that journal's tax onto a cash-basis return
- `none` — no tax effect

`ledger_tax_summary` returns both bases at once; settings pick one per
direction, which is how NZ's hybrid basis works.

## Auto-posting (`lib/ledger/server/sync.ts`)

A catch-up, not an event hook: it reads the studio's invoices, payments,
orders and tickets since `conversion_date` and posts the difference. Runs on
Books page loads (rate-limited to every 2 minutes), on "Sync now", and daily via
`/api/cron/ledger-sync` (12:30 UTC). Idempotent; heals after outages.

Notes:
- Invoice lines carrying an account code that isn't on the chart get an
  auto-created revenue account, flagged on the dashboard for naming. Olune's
  built-in codes ("200", class passes "200-01") are aliased onto the right
  accounts in any chart.
- An invoice marked paid with no card payment becomes a payment into
  "undeposited funds" after a 15-minute grace period (so a webhook mid-flight
  isn't mistaken for a cash payment).
- Stripe fees aren't in Olune's data. Card money accumulates in Stripe
  clearing; reconciling the bank's Stripe payout line moves it to the bank, and
  any difference is coded to bank fees.

## Known limits (be honest with studios about these)

- Olune still charges in NZD app-wide (`lib/currency.ts`). A studio in another
  country gets books in its own currency, but Stripe charge currency is a
  separate piece of work.
- Returns are prepared, not filed. No HMRC MTD, ELSTER, SdI, VERI*FACTU or
  e-invoicing integration yet; UI notes say so per country.
- No multi-currency transactions, no fixed-asset register (depreciation is a
  manual journal), no payroll, no bank feeds (CSV import only).
- Opening receivables are a single balance, not per-customer.
