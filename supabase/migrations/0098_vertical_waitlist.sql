-- ============================================================================
--  0098_vertical_waitlist
--  Signup now opens with "What do you run?" across all eight verticals, but
--  only some have an authored pack. Picking an unbuilt one captures the
--  interest instead of dropping the visitor — and gives us real demand data
--  on which vertical to build next, before committing engineering to it.
--
--  NOTE ON NUMBERING: the multi-vertical plan pencilled 0098 in for venues.
--  This shipped first, so venues becomes 0099 and the rest shift by one.
--
--  This is a PLATFORM-level table, not a tenant one: there is no studio_id,
--  because the person filling it in has no studio and usually no account.
--  Do not confuse it with public.leads (0004), which is a family enquiring
--  at a specific studio.
-- ============================================================================

create table if not exists public.vertical_waitlist (
  id           uuid primary key default gen_random_uuid(),
  vertical     text not null references public.verticals(key) on update cascade,
  email        text not null,
  org_name     text,
  country      text,
  locale       text,
  -- 'onboarding' | 'marketing' | … — where the interest came from, so we can
  -- tell an intent-to-sign-up from a newsletter tick.
  source       text not null default 'onboarding',
  notified_at  timestamptz,
  created_at   timestamptz not null default now()
);

-- One row per person per vertical. Re-submitting is a no-op, not a duplicate.
create unique index if not exists vertical_waitlist_email_vertical_idx
  on public.vertical_waitlist (lower(email), vertical);

create index if not exists vertical_waitlist_vertical_idx
  on public.vertical_waitlist (vertical, created_at desc);

alter table public.vertical_waitlist enable row level security;

-- Anonymous INSERT is required: this is step 1 of signup, before the account
-- exists. Deliberately insert-only — anon has no select/update/delete grant,
-- so the list cannot be read back or enumerated by the public.
grant insert on public.vertical_waitlist to anon, authenticated;
grant select, update, delete on public.vertical_waitlist to authenticated;

drop policy if exists "vertical_waitlist_public_insert" on public.vertical_waitlist;
create policy "vertical_waitlist_public_insert" on public.vertical_waitlist
  for insert to anon, authenticated
  with check (
    email is not null
    and email <> ''
    and length(email) <= 320
    and length(coalesce(org_name, '')) <= 200
  );

-- Only platform operators ever read the list.
drop policy if exists "vertical_waitlist_operator_read" on public.vertical_waitlist;
create policy "vertical_waitlist_operator_read" on public.vertical_waitlist
  for select to authenticated
  using (private.is_platform_operator());

drop policy if exists "vertical_waitlist_operator_write" on public.vertical_waitlist;
create policy "vertical_waitlist_operator_write" on public.vertical_waitlist
  for update to authenticated
  using (private.is_platform_operator())
  with check (private.is_platform_operator());

drop policy if exists "vertical_waitlist_operator_delete" on public.vertical_waitlist;
create policy "vertical_waitlist_operator_delete" on public.vertical_waitlist
  for delete to authenticated
  using (private.is_platform_operator());
