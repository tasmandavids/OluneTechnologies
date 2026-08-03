-- ============================================================================
--  ROLLBACK for 0097_verticals_core + 0098_vertical_waitlist
--
--  ⚠️  MANUAL USE ONLY. This lives outside supabase/migrations/ deliberately —
--      the CLI must never pick it up and run it forward.
--
--  Run top to bottom in the SQL editor (or via psql) to return the database to
--  its 0096 state. Written BEFORE the forward migration was applied, per the
--  multi-vertical plan's rule: have the reverse written before you run it.
--
--  DATA LOSS: dropping vertical_waitlist discards captured signups, and
--  dropping studios.disciplines discards any taxonomy written after the
--  cutover. dance_styles is NOT touched — the sync trigger kept it current,
--  so it remains the source of truth after rollback.
--
--  Safe to run more than once.
-- ============================================================================

begin;

-- ─── 0098 ────────────────────────────────────────────────────────────────────
drop table if exists public.vertical_waitlist;

-- ─── 0097: restore the original two-argument RPCs (verbatim from 0052) ───────
-- Drop the 3-arg overloads first, or a 2-arg call becomes ambiguous.
drop function if exists public.create_studio_for_user(text, text, text);
drop function if exists public.create_instructor_workspace_for_user(text, text, text);

create or replace function public.create_studio_for_user(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_studio uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if (select studio_id from public.profiles where id = v_uid) is not null then
    raise exception 'user already belongs to a studio';
  end if;

  insert into public.studios (name, slug, status, kind)
    values (p_name, lower(p_slug), 'trial', 'studio')
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

create or replace function public.create_instructor_workspace_for_user(p_name text, p_slug text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_studio uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if (select studio_id from public.profiles where id = v_uid) is not null then
    raise exception 'user already belongs to a studio';
  end if;

  insert into public.studios (name, slug, status, kind)
    values (p_name, lower(p_slug), 'trial', 'instructor')
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

grant execute on function public.create_studio_for_user(text, text) to authenticated;
grant execute on function public.create_instructor_workspace_for_user(text, text) to authenticated;

-- ─── 0097: trigger, per-tenant delta tables, columns, registry ───────────────
drop trigger if exists studios_sync_disciplines on public.studios;
drop function if exists private.sync_studio_disciplines();

drop table if exists public.studio_taxonomy_terms;
drop table if exists public.studio_vocabulary_overrides;
drop table if exists public.studio_modules;

-- Drop the FK-bearing column before the table it references.
alter table public.studios drop column if exists vertical;
alter table public.studios drop column if exists disciplines;

drop table if exists public.verticals;

commit;

-- ─── Verify ─────────────────────────────────────────────────────────────────
-- Expect: 0 rows for each of these.
--   select column_name from information_schema.columns
--    where table_name = 'studios' and column_name in ('vertical','disciplines');
--   select table_name from information_schema.tables
--    where table_name in ('verticals','studio_modules','studio_vocabulary_overrides',
--                         'studio_taxonomy_terms','vertical_waitlist');
-- Expect: exactly one row, with 2 arguments.
--   select pronargs from pg_proc where proname = 'create_studio_for_user';
