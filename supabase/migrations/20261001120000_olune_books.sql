-- ============================================================================
--  Olune Books — a built-in double-entry ledger.
--
--  For studios that don't want Xero, QuickBooks or MYOB. It is the fourth
--  option in the accounting exclusive group (studios.accounting_provider =
--  'olune'), not a layer on top of the others.
--
--  Jurisdiction knowledge (tax rates, return boxes, charts of accounts, filing
--  frequencies) lives in TypeScript under lib/ledger/jurisdictions. This schema
--  only stores what a studio was provisioned with, so a studio's books never
--  change underneath it when a jurisdiction pack is updated.
--
--  Integrity is enforced here rather than trusted to app code, because the
--  ledger is only worth having if its invariants hold whichever path writes
--  to it (server action, cron, a future import, a crafted PostgREST call):
--
--    • every journal balances      deferred constraint trigger, checked at commit
--    • posted lines are immutable  corrections are voids or reversals, never edits
--    • nothing lands on or before the lock date (set when a tax return is filed)
--    • every line's account and tax rate belong to the journal's studio
--    • journal numbers are gap-free and assigned per studio
--
--  Money is bigint cents throughout. Reports aggregate many years of lines,
--  and int4 tops out at ~$21m.
-- ============================================================================

-- ─── Studio pointer ──────────────────────────────────────────────────────────

alter table public.studios drop constraint if exists studios_accounting_provider_check;
alter table public.studios
  add constraint studios_accounting_provider_check
  check (accounting_provider is null or accounting_provider in ('xero', 'quickbooks', 'myob', 'olune'));

-- ─── Settings (one row per studio that has switched Books on) ───────────────

create table if not exists public.ledger_settings (
  studio_id                uuid primary key references public.studios(id) on delete cascade,
  -- ISO 3166-1 alpha-2, or 'XX' for a custom jurisdiction.
  jurisdiction             text not null check (jurisdiction ~ '^[A-Z]{2}$'),
  -- State / province, where the jurisdiction has sub-national tax (US, CA).
  region                   text,
  base_currency            text not null check (base_currency ~ '^[A-Z]{3}$'),
  -- Custom ('XX') jurisdiction only: what the studio called its country and tax.
  custom_country_name      text,
  custom_tax_name          text,
  tax_registered           boolean not null default true,
  tax_number               text,
  -- Jurisdiction-specific scheme id, e.g. 'standard', 'cash_accounting'.
  tax_scheme               text,
  -- Separate bases for each direction so NZ's hybrid basis is expressible
  -- (sales on invoice, purchases on payments).
  sales_tax_basis          text not null default 'accrual' check (sales_tax_basis in ('accrual', 'cash')),
  purchases_tax_basis      text not null default 'accrual' check (purchases_tax_basis in ('accrual', 'cash')),
  filing_frequency         text not null
                             check (filing_frequency in ('monthly', 'bimonthly', 'quarterly', 'six_monthly', 'annual')),
  -- The month the first tax period of a cycle starts in, e.g. a UK VAT stagger
  -- or an NZ two-monthly cycle ending in odd months.
  tax_period_anchor_month  smallint not null default 1 check (tax_period_anchor_month between 1 and 12),
  fiscal_year_start_month  smallint not null check (fiscal_year_start_month between 1 and 12),
  fiscal_year_start_day    smallint not null default 1 check (fiscal_year_start_day between 1 and 31),
  -- Books start here. Source documents dated earlier are not auto-posted;
  -- their effect arrives through the opening balances journal.
  conversion_date          date not null,
  -- Nothing may be posted, voided or reversed on or before this date.
  lock_date                date,
  prices_include_tax       boolean not null default true,
  auto_post                boolean not null default true,
  next_journal_number      int not null default 1 check (next_journal_number > 0),
  pack_version             int not null default 1,
  last_synced_at           timestamptz,
  last_sync_error          text,
  created_by               uuid references public.profiles(id) on delete set null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- ─── Tax rates ───────────────────────────────────────────────────────────────

create table if not exists public.ledger_tax_rates (
  id               uuid primary key default gen_random_uuid(),
  studio_id        uuid not null references public.studios(id) on delete cascade,
  code             text not null,
  name             text not null,
  -- Sum of components, in basis points (1500 = 15%). Numeric rather than int
  -- because real rates need it: Québec's QST is 9.975% = 997.5bp.
  rate_bp          numeric(8,3) not null check (rate_bp between 0 and 10000),
  applies_to       text not null default 'both' check (applies_to in ('sales', 'purchases', 'both')),
  -- Drives which return box a line lands in. See lib/ledger/types.ts.
  report_category  text not null check (report_category in (
                     'standard', 'reduced', 'second_reduced', 'super_reduced', 'zero', 'exempt',
                     'export', 'capital', 'import', 'out_of_scope', 'reverse_charge')),
  -- [{ "name": "GST", "rateBp": 500, "salesAccountKey": "tax_collected",
  --    "purchaseAccountKey": "tax_paid" | null }]. A null purchaseAccountKey
  -- means the component is not recoverable (e.g. Canadian PST) and is added to
  -- the cost of the purchase instead.
  components       jsonb not null default '[]'::jsonb check (jsonb_typeof(components) = 'array'),
  is_system        boolean not null default false,
  is_archived      boolean not null default false,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  unique (studio_id, code)
);

create index if not exists ledger_tax_rates_studio_idx on public.ledger_tax_rates(studio_id, is_archived);

-- ─── Chart of accounts ───────────────────────────────────────────────────────

create table if not exists public.ledger_accounts (
  id                   uuid primary key default gen_random_uuid(),
  studio_id            uuid not null references public.studios(id) on delete cascade,
  code                 text not null check (length(code) between 1 and 20),
  name                 text not null check (length(name) between 1 and 150),
  type                 text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  subtype              text not null check (subtype in (
                         'bank', 'current_asset', 'receivable', 'inventory', 'fixed_asset', 'non_current_asset',
                         'current_liability', 'payable', 'tax', 'non_current_liability',
                         'equity', 'retained_earnings',
                         'revenue', 'other_income',
                         'direct_cost', 'expense', 'depreciation', 'other_expense')),
  -- Stable handle for accounts the posting engine needs (ar, ap, tax_collected,
  -- stripe_clearing, …). Renaming or renumbering an account never breaks it.
  system_key           text,
  description          text,
  default_tax_rate_id  uuid references public.ledger_tax_rates(id) on delete set null,
  -- Bank-like accounts only.
  bank_kind            text check (bank_kind is null or bank_kind in ('bank', 'clearing', 'cash', 'credit_card')),
  bank_number          text,
  is_archived          boolean not null default false,
  -- Created by the sync because an invoice line carried a code the chart
  -- didn't have. Surfaced on the dashboard so someone names it properly.
  auto_created         boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (studio_id, code),
  check (bank_kind is null or subtype = 'bank')
);

create unique index if not exists ledger_accounts_system_key
  on public.ledger_accounts(studio_id, system_key) where system_key is not null;
create index if not exists ledger_accounts_default_tax_idx on public.ledger_accounts(default_tax_rate_id);

-- ─── Contacts (suppliers for bills; customers stay in profiles) ─────────────

create table if not exists public.ledger_contacts (
  id                   uuid primary key default gen_random_uuid(),
  studio_id            uuid not null references public.studios(id) on delete cascade,
  name                 text not null check (length(name) between 1 and 150),
  email                text,
  tax_number           text,
  default_account_id   uuid references public.ledger_accounts(id) on delete set null,
  is_archived          boolean not null default false,
  created_at           timestamptz not null default now(),
  unique (studio_id, name)
);

create index if not exists ledger_contacts_default_account_idx on public.ledger_contacts(default_account_id);

-- ─── Journals ────────────────────────────────────────────────────────────────

create table if not exists public.ledger_journals (
  id                    uuid primary key default gen_random_uuid(),
  studio_id             uuid not null references public.studios(id) on delete cascade,
  journal_number        int not null,
  date                  date not null,
  narration             text not null check (length(narration) between 1 and 500),
  reference             text,
  source_type           text not null check (source_type in (
                          'manual', 'opening_balance', 'invoice', 'invoice_payment', 'invoice_manual_payment',
                          'refund', 'order', 'ticket', 'bill', 'bill_payment', 'bank', 'transfer',
                          'tax_settlement', 'reversal')),
  source_id             uuid,
  -- Fingerprint of the source document as posted. A changed fingerprint is how
  -- the sync notices an edited invoice and re-posts it.
  source_hash           text,
  -- When this journal's tax counts on a return:
  --   accrual     invoice/bill: on its date under accrual basis
  --   cash        point-of-sale, refunds, bank-coded spend/receive: always on its date
  --   settlement  a payment against an accrual journal: carries a share of
  --               that journal's tax onto a cash-basis return
  --   none        no tax effect
  tax_timing            text not null default 'none' check (tax_timing in ('accrual', 'cash', 'settlement', 'none')),
  -- Document total including tax, for accrual journals (the denominator when a
  -- payment settles part of it).
  gross_cents           bigint,
  settles_journal_id    uuid references public.ledger_journals(id),
  settles_amount_cents  bigint,
  status                text not null default 'posted' check (status in ('posted', 'voided')),
  reverses_journal_id   uuid references public.ledger_journals(id),
  -- Set when a later journal replaces this one's effect (a reversal in a locked
  -- period). Metadata only; the only column a locked journal may still change.
  superseded_by         uuid references public.ledger_journals(id) on delete set null,
  contact_name          text,
  voided_at             timestamptz,
  voided_by             uuid references public.profiles(id) on delete set null,
  void_reason           text,
  created_by            uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  unique (studio_id, journal_number),
  check (settles_journal_id is null or tax_timing = 'settlement'),
  check (status = 'posted' or voided_at is not null)
);

-- One live journal per source document — the sync's idempotency key.
create unique index if not exists ledger_journals_source_key
  on public.ledger_journals(studio_id, source_type, source_id)
  where source_id is not null and status = 'posted' and superseded_by is null;
create index if not exists ledger_journals_studio_date_idx on public.ledger_journals(studio_id, date desc, journal_number desc);
create index if not exists ledger_journals_settles_idx on public.ledger_journals(settles_journal_id);
create index if not exists ledger_journals_reverses_idx on public.ledger_journals(reverses_journal_id);
create index if not exists ledger_journals_superseded_idx on public.ledger_journals(superseded_by);
create index if not exists ledger_journals_created_by_idx on public.ledger_journals(created_by);
create index if not exists ledger_journals_voided_by_idx on public.ledger_journals(voided_by);

create table if not exists public.ledger_journal_lines (
  id                       uuid primary key default gen_random_uuid(),
  journal_id               uuid not null references public.ledger_journals(id) on delete cascade,
  studio_id                uuid not null references public.studios(id) on delete cascade,
  line_no                  smallint not null default 0,
  account_id               uuid not null references public.ledger_accounts(id),
  description              text,
  debit_cents              bigint not null default 0 check (debit_cents >= 0),
  credit_cents             bigint not null default 0 check (credit_cents >= 0),
  -- The tax rate this (net) line was taxed under, and the tax that went with
  -- it, on the same side as the line. Tax postings themselves have
  -- is_tax_line = true and no tax_rate_id, so nothing is counted twice.
  tax_rate_id              uuid references public.ledger_tax_rates(id),
  tax_cents                bigint not null default 0 check (tax_cents >= 0),
  is_tax_line              boolean not null default false,
  contact_name             text,
  reconciled_bank_txn_id   uuid,
  check ((debit_cents = 0) <> (credit_cents = 0)),
  check (not is_tax_line or tax_rate_id is null)
);

create index if not exists ledger_journal_lines_journal_idx on public.ledger_journal_lines(journal_id, line_no);
create index if not exists ledger_journal_lines_account_idx on public.ledger_journal_lines(studio_id, account_id);
create index if not exists ledger_journal_lines_account_fk_idx on public.ledger_journal_lines(account_id);
create index if not exists ledger_journal_lines_tax_idx on public.ledger_journal_lines(tax_rate_id) where tax_rate_id is not null;
create index if not exists ledger_journal_lines_recon_idx on public.ledger_journal_lines(reconciled_bank_txn_id);

-- ─── Bills (accounts payable) ────────────────────────────────────────────────

create table if not exists public.ledger_bills (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references public.studios(id) on delete cascade,
  contact_id        uuid not null references public.ledger_contacts(id),
  reference         text,
  issue_date        date not null,
  due_date          date,
  status            text not null default 'draft' check (status in ('draft', 'awaiting_payment', 'paid', 'void')),
  amounts_include_tax boolean not null default true,
  subtotal_cents    bigint not null default 0,
  tax_cents         bigint not null default 0,
  total_cents       bigint not null default 0 check (total_cents >= 0),
  paid_cents        bigint not null default 0 check (paid_cents >= 0),
  notes             text,
  journal_id        uuid references public.ledger_journals(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ledger_bills_studio_idx on public.ledger_bills(studio_id, status, due_date);
create index if not exists ledger_bills_contact_idx on public.ledger_bills(contact_id);
create index if not exists ledger_bills_journal_idx on public.ledger_bills(journal_id);
create index if not exists ledger_bills_created_by_idx on public.ledger_bills(created_by);

create table if not exists public.ledger_bill_lines (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references public.ledger_bills(id) on delete cascade,
  studio_id         uuid not null references public.studios(id) on delete cascade,
  description       text not null,
  account_id        uuid not null references public.ledger_accounts(id),
  tax_rate_id       uuid references public.ledger_tax_rates(id),
  quantity          numeric(10,3) not null default 1 check (quantity > 0),
  unit_cents        bigint not null check (unit_cents >= 0),
  line_total_cents  bigint not null check (line_total_cents >= 0),
  sort_order        int not null default 0
);

create index if not exists ledger_bill_lines_bill_idx on public.ledger_bill_lines(bill_id, sort_order);
create index if not exists ledger_bill_lines_account_idx on public.ledger_bill_lines(account_id);
create index if not exists ledger_bill_lines_tax_idx on public.ledger_bill_lines(tax_rate_id);

create table if not exists public.ledger_bill_payments (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references public.ledger_bills(id),
  studio_id         uuid not null references public.studios(id) on delete cascade,
  date              date not null,
  amount_cents      bigint not null check (amount_cents > 0),
  bank_account_id   uuid not null references public.ledger_accounts(id),
  journal_id        uuid references public.ledger_journals(id) on delete set null,
  created_by        uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now()
);

create index if not exists ledger_bill_payments_bill_idx on public.ledger_bill_payments(bill_id);
create index if not exists ledger_bill_payments_bank_idx on public.ledger_bill_payments(bank_account_id);
create index if not exists ledger_bill_payments_journal_idx on public.ledger_bill_payments(journal_id);
create index if not exists ledger_bill_payments_created_by_idx on public.ledger_bill_payments(created_by);

-- ─── Bank statement lines ────────────────────────────────────────────────────

create table if not exists public.ledger_bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  studio_id        uuid not null references public.studios(id) on delete cascade,
  account_id       uuid not null references public.ledger_accounts(id) on delete cascade,
  date             date not null,
  description      text not null default '',
  reference        text,
  -- Signed: positive is money in.
  amount_cents     bigint not null check (amount_cents <> 0),
  -- Dedupe key from the statement row, so re-importing an overlapping CSV is safe.
  external_hash    text not null,
  import_batch_id  uuid,
  status           text not null default 'unreconciled' check (status in ('unreconciled', 'reconciled', 'excluded')),
  journal_id       uuid references public.ledger_journals(id) on delete set null,
  matched_at       timestamptz,
  matched_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  unique (studio_id, account_id, external_hash)
);

create index if not exists ledger_bank_txn_status_idx on public.ledger_bank_transactions(studio_id, account_id, status, date desc);
create index if not exists ledger_bank_txn_account_idx on public.ledger_bank_transactions(account_id);
create index if not exists ledger_bank_txn_journal_idx on public.ledger_bank_transactions(journal_id);
create index if not exists ledger_bank_txn_matched_by_idx on public.ledger_bank_transactions(matched_by);

alter table public.ledger_journal_lines
  drop constraint if exists ledger_journal_lines_recon_fk;
alter table public.ledger_journal_lines
  add constraint ledger_journal_lines_recon_fk
  foreign key (reconciled_bank_txn_id) references public.ledger_bank_transactions(id) on delete set null;

-- ─── Tax returns ─────────────────────────────────────────────────────────────

create table if not exists public.ledger_tax_returns (
  id                     uuid primary key default gen_random_uuid(),
  studio_id              uuid not null references public.studios(id) on delete cascade,
  period_start           date not null,
  period_end             date not null,
  form_code              text not null,
  status                 text not null default 'filed' check (status in ('filed')),
  -- Snapshot of the boxes exactly as filed. The ledger can't change under a
  -- filed return (the lock date moves to period_end), but the jurisdiction
  -- pack's box maths can, and the filed numbers must stay reproducible.
  figures                jsonb not null,
  net_payable_cents      bigint not null,
  sales_tax_basis        text not null,
  purchases_tax_basis    text not null,
  filing_reference       text,
  settlement_journal_id  uuid references public.ledger_journals(id) on delete set null,
  filed_at               timestamptz not null default now(),
  filed_by               uuid references public.profiles(id) on delete set null,
  unique (studio_id, period_start, period_end),
  check (period_end >= period_start)
);

create index if not exists ledger_tax_returns_settlement_idx on public.ledger_tax_returns(settlement_journal_id);
create index if not exists ledger_tax_returns_filed_by_idx on public.ledger_tax_returns(filed_by);

-- ─── Integrity triggers (private schema: never exposed over PostgREST) ──────

-- Assign the next per-studio journal number and refuse anything on or before
-- the lock date. Runs as owner so it can bump the counter in ledger_settings.
create or replace function private.ledger_before_journal_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_lock date;
  v_next int;
begin
  update public.ledger_settings
     set next_journal_number = next_journal_number + 1
   where studio_id = new.studio_id
  returning next_journal_number - 1, lock_date into v_next, v_lock;

  if v_next is null then
    raise exception 'Olune Books is not set up for this studio' using errcode = 'P0001';
  end if;
  if v_lock is not null and new.date <= v_lock then
    raise exception 'Period is locked up to %', v_lock using errcode = 'P0001';
  end if;

  new.journal_number := v_next;
  new.status := 'posted';
  new.voided_at := null;
  new.voided_by := null;
  new.superseded_by := null;
  return new;
end;
$$;

drop trigger if exists ledger_journals_before_insert on public.ledger_journals;
create trigger ledger_journals_before_insert
  before insert on public.ledger_journals
  for each row execute function private.ledger_before_journal_insert();

-- A posted journal may only be voided (if its date is unlocked) or marked
-- superseded. Everything else about it is permanent.
create or replace function private.ledger_before_journal_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_lock date;
begin
  if (to_jsonb(new) - array['status', 'voided_at', 'voided_by', 'void_reason', 'superseded_by'])
     is distinct from
     (to_jsonb(old) - array['status', 'voided_at', 'voided_by', 'void_reason', 'superseded_by']) then
    raise exception 'Posted journals cannot be edited; void or reverse instead' using errcode = 'P0001';
  end if;

  if old.status = 'voided' and new.status = 'posted' then
    raise exception 'A voided journal cannot be reinstated' using errcode = 'P0001';
  end if;

  if new.status is distinct from old.status then
    select lock_date into v_lock from public.ledger_settings where studio_id = old.studio_id;
    if v_lock is not null and old.date <= v_lock then
      raise exception 'Period is locked up to %; post a reversal instead', v_lock using errcode = 'P0001';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists ledger_journals_before_update on public.ledger_journals;
create trigger ledger_journals_before_update
  before update on public.ledger_journals
  for each row execute function private.ledger_before_journal_update();

-- Lines: tenant consistency on insert; immutability afterwards (only the
-- reconciliation marker may change).
create or replace function private.ledger_guard_journal_line()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_journal_studio uuid;
  v_journal_status text;
begin
  if tg_op = 'DELETE' then
    -- Cascades (a studio being deleted) arrive from an RI trigger, depth > 1.
    if pg_trigger_depth() <= 1 then
      raise exception 'Journal lines cannot be deleted' using errcode = 'P0001';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'reconciled_bank_txn_id') is distinct from (to_jsonb(old) - 'reconciled_bank_txn_id') then
      raise exception 'Journal lines cannot be edited' using errcode = 'P0001';
    end if;
    return new;
  end if;

  select studio_id, status into v_journal_studio, v_journal_status
    from public.ledger_journals where id = new.journal_id;

  if v_journal_studio is distinct from new.studio_id then
    raise exception 'Journal line studio mismatch' using errcode = '42501';
  end if;
  if v_journal_status <> 'posted' then
    raise exception 'Cannot add lines to a voided journal' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.ledger_accounts a where a.id = new.account_id and a.studio_id = new.studio_id) then
    raise exception 'Account does not belong to this studio' using errcode = '42501';
  end if;
  if new.tax_rate_id is not null
     and not exists (select 1 from public.ledger_tax_rates r where r.id = new.tax_rate_id and r.studio_id = new.studio_id) then
    raise exception 'Tax rate does not belong to this studio' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_journal_lines_guard on public.ledger_journal_lines;
create trigger ledger_journal_lines_guard
  before insert or update or delete on public.ledger_journal_lines
  for each row execute function private.ledger_guard_journal_line();

-- Debits equal credits, per journal, checked when the transaction commits so a
-- journal and its lines can be written in separate statements of one RPC.
create or replace function private.ledger_assert_balanced()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_debits bigint;
  v_credits bigint;
  v_count int;
begin
  select coalesce(sum(debit_cents), 0), coalesce(sum(credit_cents), 0), count(*)
    into v_debits, v_credits, v_count
    from public.ledger_journal_lines where journal_id = new.journal_id;

  if v_debits <> v_credits then
    raise exception 'Journal does not balance (debits %, credits %)', v_debits, v_credits using errcode = 'P0001';
  end if;
  if v_count < 2 then
    raise exception 'A journal needs at least two lines' using errcode = 'P0001';
  end if;
  return null;
end;
$$;

drop trigger if exists ledger_journal_lines_balanced on public.ledger_journal_lines;
create constraint trigger ledger_journal_lines_balanced
  after insert on public.ledger_journal_lines
  deferrable initially deferred
  for each row execute function private.ledger_assert_balanced();

-- Tax rates and accounts that a posted line points at can be archived, never
-- re-typed: changing an account from revenue to expense would silently move
-- history between reports.
create or replace function private.ledger_guard_account_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.studio_id is distinct from old.studio_id then
    raise exception 'Accounts cannot move between studios' using errcode = '42501';
  end if;
  if new.type is distinct from old.type
     and exists (select 1 from public.ledger_journal_lines l where l.account_id = old.id) then
    raise exception 'This account has transactions; its type cannot change' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ledger_accounts_guard on public.ledger_accounts;
create trigger ledger_accounts_guard
  before update on public.ledger_accounts
  for each row execute function private.ledger_guard_account_update();

create or replace function private.ledger_guard_tax_rate_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.studio_id is distinct from old.studio_id then
    raise exception 'Tax rates cannot move between studios' using errcode = '42501';
  end if;
  if (new.rate_bp is distinct from old.rate_bp
      or new.components is distinct from old.components
      or new.report_category is distinct from old.report_category)
     and exists (select 1 from public.ledger_journal_lines l where l.tax_rate_id = old.id) then
    raise exception 'This tax rate has been used; archive it and create a new one' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_tax_rates_guard on public.ledger_tax_rates;
create trigger ledger_tax_rates_guard
  before update on public.ledger_tax_rates
  for each row execute function private.ledger_guard_tax_rate_update();

-- Lock date only moves forward from a filed return, and never past today
-- without someone meaning it — but it may be cleared or moved back by an admin
-- (an amended return), which is why it isn't append-only.
create or replace function private.ledger_touch_settings()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.updated_at := now();
  if new.next_journal_number < old.next_journal_number then
    raise exception 'Journal numbering cannot go backwards' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_settings_touch on public.ledger_settings;
create trigger ledger_settings_touch
  before update on public.ledger_settings
  for each row execute function private.ledger_touch_settings();

-- ─── RPCs ────────────────────────────────────────────────────────────────────
--  SECURITY INVOKER: the caller's RLS applies to every row these write, so
--  they need no authorisation logic of their own and stay off the
--  verify-function-grants allowlist.

-- Post one balanced journal atomically. p_lines: [{ account_id, description,
-- debit_cents, credit_cents, tax_rate_id, tax_cents, is_tax_line, contact_name }]
create or replace function public.ledger_post_journal(p_studio_id uuid, p_header jsonb, p_lines jsonb)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_line jsonb;
  v_no int := 0;
begin
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal needs at least two lines' using errcode = 'P0001';
  end if;

  insert into public.ledger_journals (
    studio_id, journal_number, date, narration, reference, source_type, source_id, source_hash,
    tax_timing, gross_cents, settles_journal_id, settles_amount_cents, reverses_journal_id,
    contact_name, created_by
  ) values (
    p_studio_id, 0, (p_header->>'date')::date, p_header->>'narration', nullif(p_header->>'reference', ''),
    coalesce(p_header->>'source_type', 'manual'), nullif(p_header->>'source_id', '')::uuid,
    nullif(p_header->>'source_hash', ''), coalesce(p_header->>'tax_timing', 'none'),
    nullif(p_header->>'gross_cents', '')::bigint, nullif(p_header->>'settles_journal_id', '')::uuid,
    nullif(p_header->>'settles_amount_cents', '')::bigint, nullif(p_header->>'reverses_journal_id', '')::uuid,
    nullif(p_header->>'contact_name', ''), (select auth.uid())
  ) returning id into v_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_no := v_no + 1;
    insert into public.ledger_journal_lines (
      journal_id, studio_id, line_no, account_id, description, debit_cents, credit_cents,
      tax_rate_id, tax_cents, is_tax_line, contact_name
    ) values (
      v_id, p_studio_id, v_no, (v_line->>'account_id')::uuid, nullif(v_line->>'description', ''),
      coalesce((v_line->>'debit_cents')::bigint, 0), coalesce((v_line->>'credit_cents')::bigint, 0),
      nullif(v_line->>'tax_rate_id', '')::uuid, coalesce((v_line->>'tax_cents')::bigint, 0),
      coalesce((v_line->>'is_tax_line')::boolean, false), nullif(v_line->>'contact_name', '')
    );
  end loop;

  return v_id;
end;
$$;

revoke all on function public.ledger_post_journal(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.ledger_post_journal(uuid, jsonb, jsonb) to authenticated, service_role;

-- Reverse a posted journal on p_date (the first open day, when the original is
-- locked). The original is marked superseded so its source can be re-posted.
create or replace function public.ledger_reverse_journal(p_journal_id uuid, p_date date, p_narration text)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_orig public.ledger_journals%rowtype;
  v_id uuid;
begin
  select * into v_orig from public.ledger_journals where id = p_journal_id;
  if not found or v_orig.status <> 'posted' or v_orig.superseded_by is not null then
    raise exception 'Journal is not reversible' using errcode = 'P0001';
  end if;

  insert into public.ledger_journals (
    studio_id, journal_number, date, narration, reference, source_type, source_id,
    tax_timing, gross_cents, settles_journal_id, settles_amount_cents, reverses_journal_id,
    contact_name, created_by
  ) values (
    v_orig.studio_id, 0, p_date, left(coalesce(p_narration, 'Reversal of #' || v_orig.journal_number), 500),
    v_orig.reference, 'reversal', v_orig.id,
    -- Same timing as the original, on the reversal's own date: reversing an
    -- invoice must not touch a cash-basis return the invoice never reached.
    v_orig.tax_timing, v_orig.gross_cents, v_orig.settles_journal_id, -v_orig.settles_amount_cents,
    v_orig.id, v_orig.contact_name, (select auth.uid())
  ) returning id into v_id;

  insert into public.ledger_journal_lines (
    journal_id, studio_id, line_no, account_id, description, debit_cents, credit_cents,
    tax_rate_id, tax_cents, is_tax_line, contact_name
  )
  select v_id, l.studio_id, l.line_no, l.account_id, l.description, l.credit_cents, l.debit_cents,
         l.tax_rate_id, l.tax_cents, l.is_tax_line, l.contact_name
    from public.ledger_journal_lines l where l.journal_id = v_orig.id;

  update public.ledger_journals set superseded_by = v_id where id = v_orig.id;
  return v_id;
end;
$$;

revoke all on function public.ledger_reverse_journal(uuid, date, text) from public, anon;
grant execute on function public.ledger_reverse_journal(uuid, date, text) to authenticated, service_role;

-- Provision a studio's books in one transaction: settings, tax rates, chart.
-- p_tax_rates: [{ code, name, rate_bp, applies_to, report_category, components, sort_order }]
-- p_accounts:  [{ code, name, type, subtype, system_key, description, default_tax_code, bank_kind }]
create or replace function public.ledger_provision(p_studio_id uuid, p_settings jsonb, p_tax_rates jsonb, p_accounts jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.ledger_settings where studio_id = p_studio_id) then
    raise exception 'Olune Books is already set up for this studio' using errcode = 'P0001';
  end if;

  insert into public.ledger_settings (
    studio_id, jurisdiction, region, base_currency, custom_country_name, custom_tax_name,
    tax_registered, tax_number, tax_scheme,
    sales_tax_basis, purchases_tax_basis, filing_frequency, tax_period_anchor_month,
    fiscal_year_start_month, fiscal_year_start_day, conversion_date, prices_include_tax,
    auto_post, pack_version, created_by
  ) values (
    p_studio_id, p_settings->>'jurisdiction', nullif(p_settings->>'region', ''), p_settings->>'base_currency',
    nullif(p_settings->>'custom_country_name', ''), nullif(p_settings->>'custom_tax_name', ''),
    (p_settings->>'tax_registered')::boolean, nullif(p_settings->>'tax_number', ''), nullif(p_settings->>'tax_scheme', ''),
    p_settings->>'sales_tax_basis', p_settings->>'purchases_tax_basis', p_settings->>'filing_frequency',
    (p_settings->>'tax_period_anchor_month')::smallint, (p_settings->>'fiscal_year_start_month')::smallint,
    (p_settings->>'fiscal_year_start_day')::smallint, (p_settings->>'conversion_date')::date,
    (p_settings->>'prices_include_tax')::boolean, coalesce((p_settings->>'auto_post')::boolean, true),
    coalesce((p_settings->>'pack_version')::int, 1), (select auth.uid())
  );

  insert into public.ledger_tax_rates (studio_id, code, name, rate_bp, applies_to, report_category, components, is_system, sort_order)
  select p_studio_id, r->>'code', r->>'name', (r->>'rate_bp')::numeric, coalesce(r->>'applies_to', 'both'),
         r->>'report_category', coalesce(r->'components', '[]'::jsonb), true, coalesce((r->>'sort_order')::int, 0)
    from jsonb_array_elements(p_tax_rates) r;

  insert into public.ledger_accounts (studio_id, code, name, type, subtype, system_key, description, default_tax_rate_id, bank_kind)
  select p_studio_id, a->>'code', a->>'name', a->>'type', a->>'subtype', nullif(a->>'system_key', ''),
         nullif(a->>'description', ''),
         (select t.id from public.ledger_tax_rates t where t.studio_id = p_studio_id and t.code = a->>'default_tax_code'),
         nullif(a->>'bank_kind', '')
    from jsonb_array_elements(p_accounts) a;

  update public.studios set accounting_provider = 'olune' where id = p_studio_id;
end;
$$;

revoke all on function public.ledger_provision(uuid, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.ledger_provision(uuid, jsonb, jsonb, jsonb) to authenticated, service_role;

-- Per-account movement in [p_from, p_to]. Null p_from means "since the start".
create or replace function public.ledger_account_balances(p_studio_id uuid, p_from date, p_to date)
returns table (account_id uuid, debit_cents bigint, credit_cents bigint)
language sql stable security invoker set search_path = '' as $$
  select l.account_id, sum(l.debit_cents)::bigint, sum(l.credit_cents)::bigint
    from public.ledger_journal_lines l
    join public.ledger_journals j on j.id = l.journal_id
   where l.studio_id = p_studio_id
     and j.status = 'posted'
     and (p_from is null or j.date >= p_from)
     and j.date <= p_to
   group by l.account_id
$$;

revoke all on function public.ledger_account_balances(uuid, date, date) from public, anon;
grant execute on function public.ledger_account_balances(uuid, date, date) to authenticated, service_role;

-- Tax by rate and direction for [p_from, p_to], on both bases at once; the
-- caller picks per direction from the studio's settings.
--
--   direction  sales when the line's account is revenue/other income,
--              purchases otherwise (an expense, a cost, an asset bought).
--   net/tax    positive in the direction's normal sense: credits for sales,
--              debits for purchases — so a credit note comes out negative.
--   basis      'accrual' rows count accrual + cash journals dated in the period;
--              'cash' rows count cash journals plus each settlement's share of
--              the accrual journal it pays.
create or replace function public.ledger_tax_summary(p_studio_id uuid, p_from date, p_to date)
returns table (basis text, direction text, tax_rate_id uuid, net_cents bigint, tax_cents bigint)
language sql stable security invoker set search_path = '' as $$
  with taxed as (
    select l.journal_id, l.tax_rate_id,
           case when a.type = 'revenue' then 'sales' else 'purchases' end as direction,
           (case when a.type = 'revenue' then l.credit_cents - l.debit_cents else l.debit_cents - l.credit_cents end)::numeric as net,
           (case when (a.type = 'revenue') = (l.credit_cents > 0) then l.tax_cents else -l.tax_cents end)::numeric as tax
      from public.ledger_journal_lines l
      join public.ledger_accounts a on a.id = l.account_id
     where l.studio_id = p_studio_id and l.tax_rate_id is not null
  ),
  direct as (
    select j.tax_timing, t.direction, t.tax_rate_id, t.net, t.tax
      from taxed t join public.ledger_journals j on j.id = t.journal_id
     where j.status = 'posted' and j.date between p_from and p_to and j.tax_timing in ('accrual', 'cash')
  ),
  settled as (
    select t.direction, t.tax_rate_id,
           t.net * s.settles_amount_cents / nullif(a.gross_cents, 0) as net,
           t.tax * s.settles_amount_cents / nullif(a.gross_cents, 0) as tax
      from public.ledger_journals s
      join public.ledger_journals a on a.id = s.settles_journal_id
      join taxed t on t.journal_id = a.id
     where s.studio_id = p_studio_id and s.status = 'posted' and s.tax_timing = 'settlement'
       and s.date between p_from and p_to
       -- Settlements of a voided journal still count: cash received against
       -- an invoice that was later voided was a taxable receipt when it came in.
       and a.studio_id = p_studio_id
  )
  select 'accrual', direction, tax_rate_id, round(sum(net))::bigint, round(sum(tax))::bigint
    from direct group by direction, tax_rate_id
  union all
  select 'cash', direction, tax_rate_id, round(sum(net))::bigint, round(sum(tax))::bigint
    from (
      select direction, tax_rate_id, net, tax from direct where tax_timing = 'cash'
      union all
      select direction, tax_rate_id, net, tax from settled
    ) c
   group by direction, tax_rate_id
$$;

revoke all on function public.ledger_tax_summary(uuid, date, date) from public, anon;
grant execute on function public.ledger_tax_summary(uuid, date, date) to authenticated, service_role;

-- ─── RLS: studio admins only ─────────────────────────────────────────────────

do $$
declare
  t text;
begin
  foreach t in array array[
    'ledger_settings', 'ledger_tax_rates', 'ledger_accounts', 'ledger_contacts', 'ledger_journals',
    'ledger_journal_lines', 'ledger_bills', 'ledger_bill_lines', 'ledger_bill_payments',
    'ledger_bank_transactions', 'ledger_tax_returns'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin', t);
    execute format($p$
      create policy %I on public.%I for all to authenticated
        using (studio_id = (select private.current_studio()) and (select private.current_user_role()) = 'admin')
        with check (studio_id = (select private.current_studio()) and (select private.current_user_role()) = 'admin')
    $p$, t || '_admin', t);
    execute format('revoke all on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- Least privilege on top of RLS. Journals and their lines have no DELETE:
-- the ledger is append-only, and the triggers above would refuse it anyway.
grant select, insert, update on public.ledger_settings to authenticated;
grant select, insert, update on public.ledger_tax_rates to authenticated;
grant select, insert, update on public.ledger_accounts to authenticated;
grant select, insert, update, delete on public.ledger_contacts to authenticated;
grant select, insert, update on public.ledger_journals to authenticated;
grant select, insert, update on public.ledger_journal_lines to authenticated;
grant select, insert, update, delete on public.ledger_bills to authenticated;
grant select, insert, update, delete on public.ledger_bill_lines to authenticated;
grant select, insert on public.ledger_bill_payments to authenticated;
grant select, insert, update on public.ledger_bank_transactions to authenticated;
grant select, insert on public.ledger_tax_returns to authenticated;
