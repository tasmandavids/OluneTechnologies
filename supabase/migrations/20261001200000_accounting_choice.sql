-- ============================================================================
--  One accounting choice per studio: Xero or Olune Books.
--
--  studios.accounting_provider used to be a tie-breaker, read only when more
--  than one ledger happened to be connected; a studio with just Xero left it
--  null and the app inferred Xero from xero_connections. It is now the
--  studio's explicit decision, and the app reads it as the single source of
--  truth (lib/accounting/provider.ts):
--
--    'xero'  — Olune pushes invoices and payments to the studio's Xero org
--    'olune' — Olune Books keeps the ledger; Books auto-posting runs
--    null    — not chosen yet; Money → Accounting asks
--
--  QuickBooks and MYOB never got a sync and are no longer offered, so they
--  leave the allowed set. (Checked 2026-10-01: no studio had either pinned
--  or connected.)
-- ============================================================================

-- Record the choice studios already made implicitly by connecting Xero.
update public.studios s
   set accounting_provider = 'xero'
 where s.accounting_provider is null
   and exists (select 1 from public.xero_connections x where x.studio_id = s.id);

-- Books provisioning always pins 'olune'; cover any row that predates that.
update public.studios s
   set accounting_provider = 'olune'
 where s.accounting_provider is null
   and exists (select 1 from public.ledger_settings l where l.studio_id = s.id)
   and not exists (select 1 from public.xero_connections x where x.studio_id = s.id);

update public.studios
   set accounting_provider = null
 where accounting_provider in ('quickbooks', 'myob');

alter table public.studios drop constraint if exists studios_accounting_provider_check;
alter table public.studios
  add constraint studios_accounting_provider_check
  check (accounting_provider is null or accounting_provider in ('xero', 'olune'));

comment on column public.studios.accounting_provider is
  'The studio''s accounting choice: xero, olune (Olune Books) or null (not chosen). Set by Money → Accounting.';
