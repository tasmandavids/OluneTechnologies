-- ============================================================================
--  0080_studio_billing_periods
--  Studios currently get invoiced monthly no matter how they actually bill
--  families (some invoice per-term, e.g. 4 terms/year). Adds a per-studio
--  billing_period switch and a studio_terms table so admins can define their
--  own term dates; the invoice cron reads these instead of assuming monthly.
-- ============================================================================

alter table public.studios
  add column if not exists billing_period text not null default 'monthly'
    check (billing_period in ('monthly', 'termly'));

create table if not exists public.studio_terms (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references public.studios(id) on delete cascade,
  name              text not null,
  start_date        date not null,
  end_date          date not null,
  invoice_lead_days int not null default 14 check (invoice_lead_days >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint studio_terms_dates_valid check (end_date > start_date)
);

create index if not exists studio_terms_studio_idx on public.studio_terms (studio_id, start_date);

alter table public.subscriptions
  add column if not exists last_invoiced_term_id uuid references public.studio_terms(id) on delete set null;

alter table public.studio_terms enable row level security;

grant select, insert, update, delete on public.studio_terms to authenticated;

drop policy if exists "studio_terms_admin_all" on public.studio_terms;
create policy "studio_terms_admin_all" on public.studio_terms
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

drop policy if exists "studio_terms_member_read" on public.studio_terms;
create policy "studio_terms_member_read" on public.studio_terms
  for select using (studio_id = private.current_studio());

drop trigger if exists studio_terms_touch_updated_at on public.studio_terms;
create trigger studio_terms_touch_updated_at
  before update on public.studio_terms
  for each row execute function private.touch_updated_at();
