-- ============================================================================
--  0097_verticals_core
--  Olune runs one codebase across several activity verticals (dance studios,
--  gymnastics clubs, sports clubs, …). This adds the vertical axis:
--
--    1. public.verticals            — registry, so the operator console can
--                                     dark-launch a vertical without a deploy
--    2. studios.vertical            — which one this tenant is
--    3. studios.disciplines         — generic replacement for dance_styles
--    4. studio_modules              — per-tenant module opt-in/out (delta only)
--    5. studio_vocabulary_overrides — per-tenant nouns ("athletes" not "players")
--    6. studio_taxonomy_terms       — per-tenant taxonomy beyond the pack list
--
--  The pack itself (taxonomy, levels, modules, nav, setup steps) lives in
--  lib/verticals/packs/*.ts — NOT here. The DB holds the registry and the
--  per-tenant delta; never both.
--
--  EVERY EXISTING STUDIO IS SEEDED AS 'dance' AND THE DANCE PACK DECLARES
--  EVERY MODULE REACHABLE TODAY. Day-one behaviour delta is zero; that is
--  enforced by the nav-parity snapshot in tests/entitlements.test.ts.
-- ============================================================================

-- ─── 1. Registry ─────────────────────────────────────────────────────────────

create table if not exists public.verticals (
  key        text primary key,
  label      text not null,
  status     text not null default 'beta' check (status in ('ga', 'beta', 'hidden')),
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);

-- Only dance has an authored pack in Phase 0; the rest are registered as
-- 'beta' so the onboarding picker (Phase 2) has rows to read when it lands.
insert into public.verticals (key, label, status, sort) values
  ('dance',        'Dance',         'ga',   10),
  ('gymnastics',   'Gymnastics',    'beta', 20),
  ('sports-club',  'Sports club',   'beta', 30),
  ('swim',         'Swim school',   'beta', 40),
  ('martial-arts', 'Martial arts',  'beta', 50),
  ('music',        'Music school',  'beta', 60),
  ('cheer',        'Cheer',         'beta', 70),
  ('tutoring',     'Tutoring',      'beta', 80)
on conflict (key) do update
  set label = excluded.label,
      sort  = excluded.sort;

-- ─── 2. studios.vertical ─────────────────────────────────────────────────────
--  Orthogonal to studios.kind. `kind` is business shape (studio vs sole-trader
--  instructor); `vertical` is domain. A freelance gymnastics coach is
--  kind='instructor', vertical='gymnastics'. Do not overload one with the other.
--
--  The default is deliberately NOT dropped: a row inserted without an explicit
--  vertical lands on dance, exactly matching today's behaviour.

alter table public.studios
  add column if not exists vertical text not null default 'dance'
    references public.verticals(key) on update cascade;

create index if not exists studios_vertical_idx on public.studios (vertical);

-- ─── 3. studios.disciplines ──────────────────────────────────────────────────
--  Generic replacement for studios.dance_styles. Two-release retirement: both
--  columns are kept in sync by a trigger for one release so the six existing
--  dance_styles readers keep working, then dance_styles is dropped in a later
--  migration once telemetry shows no reads.

alter table public.studios
  add column if not exists disciplines text[] default '{}';

update public.studios
   set disciplines = coalesce(dance_styles, '{}')
 where (disciplines is null or disciplines = '{}')
   and dance_styles is not null
   and dance_styles <> '{}';

-- Not SECURITY DEFINER: this only mutates NEW on its own row and needs no
-- elevated privilege. A definer-rights trigger here would be a needless
-- privilege surface.
create or replace function private.sync_studio_disciplines()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Whichever side the writer touched wins; the other mirrors it.
  if tg_op = 'INSERT' then
    if coalesce(array_length(new.disciplines, 1), 0) > 0 then
      new.dance_styles := new.disciplines;
    elsif coalesce(array_length(new.dance_styles, 1), 0) > 0 then
      new.disciplines := new.dance_styles;
    end if;
  elsif new.disciplines is distinct from old.disciplines then
    new.dance_styles := new.disciplines;
  elsif new.dance_styles is distinct from old.dance_styles then
    new.disciplines := new.dance_styles;
  end if;
  return new;
end $$;

drop trigger if exists studios_sync_disciplines on public.studios;
create trigger studios_sync_disciplines
  before insert or update on public.studios
  for each row execute function private.sync_studio_disciplines();

-- ─── 4. Per-tenant deltas ────────────────────────────────────────────────────
--  Absent row = pack default. These tables hold ONLY the difference from the
--  pack, so a studio that never customises anything has zero rows here.

create table if not exists public.studio_modules (
  studio_id  uuid not null references public.studios(id) on delete cascade,
  module_key text not null,
  enabled    boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (studio_id, module_key)
);

create table if not exists public.studio_vocabulary_overrides (
  studio_id  uuid not null references public.studios(id) on delete cascade,
  term_key   text not null,
  locale     text not null default 'en',
  singular   text not null,
  plural     text not null,
  updated_at timestamptz not null default now(),
  primary key (studio_id, term_key, locale)
);

create table if not exists public.studio_taxonomy_terms (
  id         uuid primary key default gen_random_uuid(),
  studio_id  uuid not null references public.studios(id) on delete cascade,
  kind       text not null check (kind in ('discipline', 'apparatus', 'level', 'age_group')),
  key        text not null,
  label      text not null,
  sort       int  not null default 0,
  created_at timestamptz not null default now(),
  unique (studio_id, kind, key)
);

create index if not exists studio_taxonomy_terms_studio_idx
  on public.studio_taxonomy_terms (studio_id, kind, sort);

-- ─── 5. RLS ──────────────────────────────────────────────────────────────────
--  Members read (vocabulary and taxonomy are needed at render time for every
--  role); admins write. Same shape as studio_terms (0080).

alter table public.studio_modules              enable row level security;
alter table public.studio_vocabulary_overrides enable row level security;
alter table public.studio_taxonomy_terms       enable row level security;

grant select, insert, update, delete on public.studio_modules              to authenticated;
grant select, insert, update, delete on public.studio_vocabulary_overrides to authenticated;
grant select, insert, update, delete on public.studio_taxonomy_terms       to authenticated;

-- The registry is public: the marketing site and onboarding picker read it
-- before the visitor has an account.
grant select on public.verticals to authenticated, anon;
alter table public.verticals enable row level security;
drop policy if exists "verticals_public_read" on public.verticals;
create policy "verticals_public_read" on public.verticals
  for select to authenticated, anon using (true);

do $$
declare t text;
begin
  foreach t in array array[
    'studio_modules', 'studio_vocabulary_overrides', 'studio_taxonomy_terms'
  ] loop
    execute format('drop policy if exists "%1$s_member_read" on public.%1$s', t);
    execute format($f$
      create policy "%1$s_member_read" on public.%1$s
        for select to authenticated
        using (studio_id = private.current_studio())
    $f$, t);

    execute format('drop policy if exists "%1$s_admin_all" on public.%1$s', t);
    execute format($f$
      create policy "%1$s_admin_all" on public.%1$s
        for all to authenticated
        using (
          studio_id = private.current_studio()
          and private.current_user_role() = 'admin'
        )
        with check (
          studio_id = private.current_studio()
          and private.current_user_role() = 'admin'
        )
    $f$, t);
  end loop;
end $$;

drop trigger if exists studio_modules_touch_updated_at on public.studio_modules;
create trigger studio_modules_touch_updated_at
  before update on public.studio_modules
  for each row execute function private.touch_updated_at();

drop trigger if exists studio_vocabulary_overrides_touch_updated_at on public.studio_vocabulary_overrides;
create trigger studio_vocabulary_overrides_touch_updated_at
  before update on public.studio_vocabulary_overrides
  for each row execute function private.touch_updated_at();

-- ─── 6. Workspace creation RPCs take a vertical ──────────────────────────────
--  NOTE: adding a defaulted third parameter creates an OVERLOAD, it does not
--  replace the 2-arg function. Leaving both in place makes a 2-arg call
--  ambiguous ("function is not unique"), so the old signatures are dropped
--  first. Callers passing only {p_name, p_slug} still work — p_vertical
--  defaults to 'dance'.

drop function if exists public.create_studio_for_user(text, text);
drop function if exists public.create_instructor_workspace_for_user(text, text);

create or replace function public.create_studio_for_user(
  p_name text,
  p_slug text,
  p_vertical text default 'dance'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_studio uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if (select studio_id from public.profiles where id = v_uid) is not null then
    raise exception 'user already belongs to a studio';
  end if;
  if not exists (select 1 from public.verticals where key = p_vertical and status <> 'hidden') then
    raise exception 'unknown vertical: %', p_vertical;
  end if;

  insert into public.studios (name, slug, status, kind, vertical)
    values (p_name, lower(p_slug), 'trial', 'studio', p_vertical)
    returning id into v_studio;

  insert into public.studio_branding (studio_id) values (v_studio);

  update public.profiles
  set studio_id = v_studio,
      role = 'admin',
      account_kind = 'studio_owner',
      active_studio_id = v_studio
  where id = v_uid;

  insert into public.studio_memberships (user_id, studio_id, role, is_primary, linked_via, status)
  values (v_uid, v_studio, 'admin', true, 'owner_created', 'active');

  return v_studio;
end $$;

create or replace function public.create_instructor_workspace_for_user(
  p_name text,
  p_slug text,
  p_vertical text default 'dance'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_studio uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if (select studio_id from public.profiles where id = v_uid) is not null then
    raise exception 'user already belongs to a studio';
  end if;
  if not exists (select 1 from public.verticals where key = p_vertical and status <> 'hidden') then
    raise exception 'unknown vertical: %', p_vertical;
  end if;

  insert into public.studios (name, slug, status, kind, vertical)
    values (p_name, lower(p_slug), 'trial', 'instructor', p_vertical)
    returning id into v_studio;

  insert into public.studio_branding (studio_id) values (v_studio);

  update public.profiles
  set studio_id = v_studio,
      role = 'teacher',
      account_kind = 'instructor',
      active_studio_id = v_studio
  where id = v_uid;

  insert into public.studio_memberships (user_id, studio_id, role, is_primary, linked_via, status)
  values (v_uid, v_studio, 'teacher', true, 'owner_created', 'active');

  return v_studio;
end $$;

grant execute on function public.create_studio_for_user(text, text, text) to authenticated;
grant execute on function public.create_instructor_workspace_for_user(text, text, text) to authenticated;
