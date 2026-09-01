-- Fix the bulk of the multiple_permissive_policies warnings.
--
-- Almost every policy in this schema was created without a `TO` clause, so it
-- applies to PUBLIC — meaning Postgres attaches it to *every* role: anon,
-- authenticated, authenticator, dashboard_user, cli_login_postgres and
-- supabase_privileged_role. The linter then reports the same overlap once per
-- role, which is why a handful of real overlaps produced hundreds of warnings.
--
-- Every one of these policies is gated on auth.uid() / private.current_studio()
-- / private.current_user_role(), so none of them can match an anonymous
-- request today. Pinning them to `authenticated` is therefore behaviour
-- preserving for real traffic, and it drops the five non-authenticated roles
-- out of the lint entirely.
--
-- The genuinely public-facing policies are listed in the exclusion below and
-- keep their PUBLIC role set. Every other anon-facing policy in this schema
-- (classes_public_catalog, events_public_anon_read, leads_public_trial_insert,
-- products_public_catalog, vertical_waitlist_public_insert, verticals_public_read)
-- is already explicitly scoped to `anon` and is untouched here.
--
-- service_role and postgres both have BYPASSRLS, so server-side and admin
-- access is unaffected.

do $$
declare
  pol record;
  n integer := 0;
begin
  for pol in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and roles = '{public}'
      -- policies that must stay readable by anonymous visitors
      and (tablename, policyname) not in (
        ('profiles',        'profiles_instructor_public_read'),
        ('staff',           'staff_public_read'),
        ('studio_branding', 'public reads branding'),
        ('studios',         'public reads active studios'),
        ('website_configs', 'website_configs_public_read'),
        ('xp_levels',       'xp_levels_read')
      )
    order by tablename, policyname
  loop
    execute format(
      'alter policy %I on public.%I to authenticated',
      pol.policyname, pol.tablename
    );
    n := n + 1;
  end loop;

  raise notice 'scoped % policies to authenticated', n;
end
$$;
