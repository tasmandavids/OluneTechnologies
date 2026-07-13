-- ============================================================================
--  0090_stripe_connect.sql
--  Stripe Connect (Express) per-studio accounts, so each studio's payments
--  settle directly to their own Stripe balance/bank instead of pooling in
--  the shared platform account. Mirrors xero_connections' shape (0036).
--
--  Also fixes the profiles.stripe_customer_id gap: that column is one value
--  per user, but a Stripe Customer can't be shared across Stripe accounts,
--  and a profile can belong to multiple studios (studio_memberships, 0064).
--  profile_stripe_customers gives each (profile, studio) its own Customer id
--  once that studio has a chargeable connected account; studios without one
--  keep using profiles.stripe_customer_id unchanged (backward compatible).
-- ============================================================================

create table if not exists public.stripe_connect_accounts (
  id                      uuid primary key default gen_random_uuid(),
  studio_id               uuid not null references public.studios(id) on delete cascade,
  stripe_account_id       text not null unique,
  charges_enabled         boolean not null default false,
  payouts_enabled         boolean not null default false,
  details_submitted       boolean not null default false,
  disabled_reason         text,
  connected_by            uuid references public.profiles(id) on delete set null,
  onboarding_started_at   timestamptz,
  onboarding_completed_at timestamptz,
  last_synced_at          timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (studio_id)
);

create index if not exists stripe_connect_accounts_studio_idx on public.stripe_connect_accounts(studio_id);

create table if not exists public.profile_stripe_customers (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references public.profiles(id) on delete cascade,
  studio_id          uuid not null references public.studios(id) on delete cascade,
  stripe_account_id  text not null,
  stripe_customer_id text not null,
  created_at         timestamptz not null default now(),
  unique (profile_id, studio_id)
);

create index if not exists profile_stripe_customers_studio_idx on public.profile_stripe_customers(studio_id, stripe_customer_id);

-- Distinguish platform vs connected-account events once Connect webhooks land
-- on the same ledger (Stripe event ids are globally unique either way).
alter table public.stripe_events add column if not exists account text;

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.stripe_connect_accounts enable row level security;
alter table public.profile_stripe_customers enable row level security;

drop policy if exists "stripe_connect_accounts_admin" on public.stripe_connect_accounts;
create policy "stripe_connect_accounts_admin" on public.stripe_connect_accounts
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

drop policy if exists "profile_stripe_customers_admin" on public.profile_stripe_customers;
create policy "profile_stripe_customers_admin" on public.profile_stripe_customers
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

drop policy if exists "profile_stripe_customers_self_read" on public.profile_stripe_customers;
create policy "profile_stripe_customers_self_read" on public.profile_stripe_customers
  for select using (profile_id = auth.uid());

-- Service role (webhooks, onboarding callback) bypasses RLS via the service key.
grant select, insert, update, delete on public.stripe_connect_accounts to authenticated;
grant select, insert, update on public.profile_stripe_customers to authenticated;
