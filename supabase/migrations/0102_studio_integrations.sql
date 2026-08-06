-- ============================================================================
--  0102_studio_integrations.sql
--
--  One generic per-studio connection record, so new third-party systems can be
--  hooked up without a bespoke table each time. The four existing integrations
--  keep their purpose-built tables (xero_connections, stripe_connect_accounts,
--  email_accounts, social_connections) — those carry provider-specific columns
--  the sync jobs rely on. Everything NEW (QuickBooks, MYOB, API-key providers,
--  and whatever comes next) lands here.
--
--  credentials_encrypted holds an AES-256-GCM blob written by
--  lib/integrations/crypto.ts — same shape and key derivation as the email and
--  advertising credential blobs. It is never selected by the connections UI;
--  only server code that actually calls the provider decrypts it.
--
--  studios.accounting_provider pins which ledger is authoritative when a studio
--  has more than one accounting system connected (Xero today; QuickBooks/MYOB
--  once their sync lands). NULL = "whatever is connected".
-- ============================================================================

create table if not exists public.studio_integrations (
  id                    uuid primary key default gen_random_uuid(),
  studio_id             uuid not null references public.studios(id) on delete cascade,
  provider              text not null,
  status                text not null default 'connected'
                          check (status in ('connected', 'pending', 'error')),
  display_name          text,
  external_account_id   text,
  credentials_encrypted text,
  metadata              jsonb not null default '{}'::jsonb,
  scopes                text[],
  last_verified_at      timestamptz,
  last_error            text,
  connected_by          uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (studio_id, provider)
);

create index if not exists studio_integrations_studio_idx
  on public.studio_integrations(studio_id);

alter table public.studios
  add column if not exists accounting_provider text
    check (accounting_provider is null or accounting_provider in ('xero', 'quickbooks', 'myob'));

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.studio_integrations enable row level security;

-- Admin-only, both ways. Credentials live in this table, so office/teacher
-- roles get no read path at all — unlike dashboard_layouts (0101), which is
-- shared operational state.
drop policy if exists "studio_integrations_admin" on public.studio_integrations;
create policy "studio_integrations_admin" on public.studio_integrations
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

grant select, insert, update, delete on public.studio_integrations to authenticated;

-- App sets updated_at = now() explicitly on writes (website_configs convention).
