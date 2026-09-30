-- Current rows, rather than stale token claims, determine both halves of the
-- workspace permission pair. Private SECURITY DEFINER lookups avoid recursive
-- membership/profile RLS; they only return the authenticated user's context.
create or replace function private.user_studio_context()
returns table (studio_id uuid, user_role public.user_role)
language sql stable security definer set search_path = '' as $$
  select coalesce(p.active_studio_id, p.studio_id),
    case when coalesce(p.active_studio_id, p.studio_id) = p.studio_id
      then p.role else m.role end
  from public.profiles p
  join public.studios s on s.id = coalesce(p.active_studio_id, p.studio_id)
  left join public.studio_memberships m
    on m.user_id = p.id and m.studio_id = s.id
  where p.id = (select auth.uid()) and s.status <> 'suspended'
    and (m.status = 'active' or (m.id is null and s.id = p.studio_id))
$$;
revoke all on function private.user_studio_context() from public, anon;
grant execute on function private.user_studio_context() to authenticated, service_role;

create or replace function private.current_studio()
returns uuid language sql stable security invoker set search_path = '' as $$
  select studio_id from private.user_studio_context()
$$;
create or replace function private.current_user_role()
returns public.user_role language sql stable security invoker set search_path = '' as $$
  select user_role from private.user_studio_context()
$$;

-- The hook is routing metadata only; RLS still rechecks current rows.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims jsonb := (event -> 'claims') - 'studio_id' - 'user_role' - 'account_kind';
  v_studio uuid;
  v_role public.user_role;
  v_kind text;
begin
  select s.id, case when s.id = p.studio_id then p.role else m.role end, p.account_kind
    into v_studio, v_role, v_kind
  from public.profiles p
  join public.studios s on s.id = coalesce(p.active_studio_id, p.studio_id)
  left join public.studio_memberships m on m.user_id = p.id and m.studio_id = s.id
  where p.id = (event ->> 'user_id')::uuid and s.status <> 'suspended'
    and (m.status = 'active' or (m.id is null and s.id = p.studio_id));
  if v_studio is not null then v_claims := jsonb_set(v_claims, '{studio_id}', to_jsonb(v_studio)); end if;
  if v_role is not null then v_claims := jsonb_set(v_claims, '{user_role}', to_jsonb(v_role::text)); end if;
  if v_kind is not null then v_claims := jsonb_set(v_claims, '{account_kind}', to_jsonb(v_kind)); end if;
  return jsonb_set(event, '{claims}', v_claims);
end;
$$;
revoke all on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- Own-profile UPDATE must not allow arbitrary workspace selection, including
-- for an admin at a different studio. Trusted provisioning RPCs run as owner.
create or replace function private.guard_profile_privileges()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if (new.role is distinct from old.role or new.studio_id is distinct from old.studio_id)
       and (private.current_user_role() is distinct from 'admin'
         or old.studio_id is distinct from private.current_studio()
         or new.studio_id is distinct from old.studio_id) then
      raise exception 'Not authorized to change profile privileges' using errcode = '42501';
    end if;
    if new.active_studio_id is distinct from old.active_studio_id
       and new.active_studio_id is not null
       and new.active_studio_id is distinct from new.studio_id
       and not exists (select 1 from public.studio_memberships m
         where m.user_id = new.id and m.studio_id = new.active_studio_id and m.status = 'active') then
      raise exception 'Active studio membership required' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Serialize registration for an account and enforce safeguards for direct RPCs.
create or replace function public.register_studio_member(
  p_studio_slug text,
  p_role public.user_role,
  p_self_managed boolean default false,
  p_birthday date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_studio public.studios%rowtype;
  v_uid uuid := auth.uid();
  v_home_studio uuid;
  v_account_kind text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  if p_role is null or p_role not in ('teacher', 'parent', 'student') then
    raise exception 'invalid role for self-registration';
  end if;

  if p_self_managed and p_role <> 'student' then
    raise exception 'self_managed only applies to student role';
  end if;

  if p_self_managed and (p_birthday is null or p_birthday > (current_date - interval '18 years')::date) then
    raise exception 'You must be 18 or older to register as an adult student';
  end if;

  select * into v_studio
  from public.studios
  where slug = lower(p_studio_slug)
    and status <> 'suspended';

  if not found then
    raise exception 'studio not found';
  end if;

  if not v_studio.registration_enabled then
    raise exception 'registration is closed for this studio';
  end if;

  if not (p_role::text = any (v_studio.registration_roles)) then
    raise exception 'role not allowed for open registration';
  end if;

  select studio_id, account_kind into v_home_studio, v_account_kind
  from public.profiles
  where id = v_uid for update;
  if not found then raise exception 'Account profile is not ready'; end if;
  if exists (select 1 from public.studio_memberships
    where user_id = v_uid and studio_id = v_studio.id and status = 'suspended') then
    raise exception 'Registration unavailable; contact the studio';
  end if;

  if v_home_studio is null then
    update public.profiles
    set studio_id = v_studio.id,
        role = p_role,
        active_studio_id = v_studio.id,
        self_managed = case when p_role = 'student' then p_self_managed else false end,
        birthday = coalesce(p_birthday, birthday)
    where id = v_uid;

    insert into public.studio_memberships (user_id, studio_id, role, is_primary, linked_via, status)
    values (v_uid, v_studio.id, p_role, true, 'registration', 'active')
    on conflict (user_id, studio_id) do update
      set role = excluded.role, status = 'active';
  elsif v_account_kind = 'instructor' and p_role = 'teacher' then
    insert into public.studio_memberships (user_id, studio_id, role, is_primary, linked_via, status)
    values (v_uid, v_studio.id, p_role, false, 'registration', 'active')
    on conflict (user_id, studio_id) do update
      set role = excluded.role, status = 'active', linked_via = 'registration';
  elsif p_role in ('parent', 'student') then
    if exists (
      select 1 from public.studio_memberships
      where user_id = v_uid
        and studio_id = v_studio.id
        and status = 'active'
    ) then
      raise exception 'already registered at this studio';
    end if;

    insert into public.studio_memberships (user_id, studio_id, role, is_primary, linked_via, status)
    values (v_uid, v_studio.id, p_role, false, 'registration', 'active')
    on conflict (user_id, studio_id) do update
      set role = excluded.role, status = 'active', linked_via = 'registration';

    update public.profiles
    set active_studio_id = v_studio.id,
        self_managed = case
          when p_role = 'student' and p_self_managed then true
          else self_managed
        end,
        birthday = coalesce(p_birthday, birthday)
    where id = v_uid;
  else
    raise exception 'user already belongs to a studio';
  end if;

  return v_studio.id;
end;
$$;

revoke all on function public.register_studio_member(text, public.user_role, boolean, date) from public, anon;
grant execute on function public.register_studio_member(text, public.user_role, boolean, date) to authenticated;

-- Lock the profile before creating a workspace, preventing concurrent orphan studios.
create or replace function public.create_studio_for_user(
  p_name text,
  p_slug text,
  p_vertical text default 'dance'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_home uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select studio_id into v_home from public.profiles where id = v_uid for update;
  if not found then raise exception 'Account profile is not ready'; end if;
  if v_home is not null then
    raise exception 'user already belongs to a studio';
  end if;
  if not exists (select 1 from public.verticals where key = p_vertical and status <> 'hidden') then
    raise exception 'unknown vertical: %', p_vertical;
  end if;

  if nullif(trim(p_name), '') is null or p_slug is null or lower(p_slug) !~ '^[a-z0-9-]{3,32}$' then
    raise exception 'Valid workspace name and slug required';
  end if;

  insert into public.studios (name, slug, status, kind, vertical)
    values (trim(p_name), lower(p_slug), 'trial', 'studio', p_vertical)
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
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_studio uuid;
  v_home uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select studio_id into v_home from public.profiles where id = v_uid for update;
  if not found then raise exception 'Account profile is not ready'; end if;
  if v_home is not null then
    raise exception 'user already belongs to a studio';
  end if;
  if not exists (select 1 from public.verticals where key = p_vertical and status <> 'hidden') then
    raise exception 'unknown vertical: %', p_vertical;
  end if;

  if nullif(trim(p_name), '') is null or p_slug is null or lower(p_slug) !~ '^[a-z0-9-]{3,32}$' then
    raise exception 'Valid workspace name and slug required';
  end if;

  insert into public.studios (name, slug, status, kind, vertical)
    values (trim(p_name), lower(p_slug), 'trial', 'instructor', p_vertical)
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

revoke all on function public.create_studio_for_user(text,text,text) from public,anon;
grant execute on function public.create_studio_for_user(text,text,text) to authenticated;
revoke all on function public.create_instructor_workspace_for_user(text,text,text) from public,anon;
grant execute on function public.create_instructor_workspace_for_user(text,text,text) to authenticated;
