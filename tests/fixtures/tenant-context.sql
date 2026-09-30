-- Focused PostgreSQL fixture: auth identity and the actual policy predicates.
-- Deliberately contains no production data, credentials, or network calls.
create role authenticated;
create role anon;
create role service_role;
create role supabase_auth_admin;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create type public.user_role as enum ('admin','office','teacher','parent','student');
create table public.verticals (key text primary key, status text);
insert into public.verticals values ('dance','active');
create table public.studios (
  id uuid primary key default gen_random_uuid(), name text, slug text unique,
  status text default 'trial', kind text, vertical text,
  registration_enabled boolean default true,
  registration_roles text[] default array['parent','student','teacher']
);
create table public.studio_branding (studio_id uuid references public.studios(id));
create table public.profiles (
  id uuid primary key, studio_id uuid references public.studios(id),
  active_studio_id uuid references public.studios(id), role public.user_role default 'parent',
  account_kind text, self_managed boolean default false, birthday date
);
create table public.studio_memberships (
  id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id),
  studio_id uuid references public.studios(id), role public.user_role,
  is_primary boolean, linked_via text, status text, unique(user_id,studio_id)
);
create unique index on public.studio_memberships(user_id) where is_primary;
create table public.classes (id uuid primary key default gen_random_uuid(), studio_id uuid references public.studios(id), name text);
-- Migration 0048 already moved the production trigger into the private schema.
-- Keep that dependency in the fixture so CREATE OR REPLACE is tested against
-- the same trigger wiring that exists in a fully migrated environment.
create function private.guard_profile_privileges()
returns trigger language plpgsql as $$
begin
  return new;
end
$$;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function private.guard_profile_privileges();
grant usage on schema public,auth,private to authenticated,anon;
grant select,insert,update,delete on all tables in schema public to authenticated;
alter table public.profiles enable row level security;
alter table public.studio_memberships enable row level security;
alter table public.classes enable row level security;
create policy profiles_read_own on public.profiles for select to authenticated using (id=auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());
create policy memberships_read_own on public.studio_memberships for select to authenticated using (user_id=auth.uid());
