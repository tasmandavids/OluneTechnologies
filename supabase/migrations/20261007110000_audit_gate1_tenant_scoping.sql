-- October audit, Gate 1 (continued): C-02, C-03, C-04, C-05, C-06, C-08, E-02, E-05.
--
-- C-02  Teacher policies and helpers ignored studio membership, so any
--       "teacher" (anyone can create an instructor workspace) could write
--       classes into another studio and read its roster.
-- C-03  Users could rewrite server-owned profile columns.
-- C-04  Any signed-in user could claim any open substitute request.
-- C-05  A parent could insert a private-lesson booking into any studio.
-- C-06  A parent could insert absence rows into any studio.
-- C-08  A payer could choose their own invoice number.
-- E-02  Any user could write rows (with SMS/email links) into the delivery queue.
-- E-05  messages_insert let any studio member message any other member,
--       including other families' children.
--
-- C-01 follow-up: teachers lost studio-wide profile read in the previous
-- migration, but still need the guardians of the students they teach.

-- ─── Helpers ────────────────────────────────────────────────────────────────
-- Same rule as private.user_studio_context(): an active membership, or no
-- membership row at all and the profile's home studio (legacy accounts). A
-- suspended membership therefore removes access.

create or replace function private.user_in_studio(p_user uuid, p_studio uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.studio_memberships m
    where m.user_id = p_user and m.studio_id = p_studio and m.status = 'active'
  ) or (
    not exists (
      select 1 from public.studio_memberships m
      where m.user_id = p_user and m.studio_id = p_studio
    )
    and exists (
      select 1 from public.profiles p
      where p.id = p_user and p.studio_id = p_studio
    )
  )
$$;
revoke all on function private.user_in_studio(uuid, uuid) from public, anon;
grant execute on function private.user_in_studio(uuid, uuid) to authenticated, service_role;

-- The caller's own access to a studio.
create or replace function private.has_studio_access(p_studio uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select private.user_in_studio(auth.uid(), p_studio)
$$;
revoke all on function private.has_studio_access(uuid) from public, anon;
grant execute on function private.has_studio_access(uuid) to authenticated, service_role;

-- ─── C-02: teacher helpers and policies are studio-aware ───────────────────

create or replace function private.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class
      and c.teacher_id = auth.uid()
      and private.user_in_studio(auth.uid(), c.studio_id)
  )
$$;

create or replace function private.teaches_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = p_student
      and c.teacher_id = auth.uid()
      and e.studio_id = c.studio_id
      and private.user_in_studio(auth.uid(), c.studio_id)
  )
$$;

drop policy if exists "classes_teacher_assigned" on public.classes;
create policy "classes_teacher_assigned" on public.classes
  for select to authenticated
  using (
    teacher_id = (select auth.uid())
    and private.user_in_studio((select auth.uid()), studio_id)
  );

drop policy if exists "classes_teacher_assigned_write" on public.classes;
create policy "classes_teacher_assigned_write" on public.classes
  for all to authenticated
  using (
    teacher_id = (select auth.uid())
    and private.current_user_role() = 'teacher'
    and private.user_in_studio((select auth.uid()), studio_id)
  )
  with check (
    teacher_id = (select auth.uid())
    and private.current_user_role() = 'teacher'
    and private.user_in_studio((select auth.uid()), studio_id)
  );

-- Teachers still need to read the guardians of the students they teach
-- (messaging, roll call). Replaces what the studio-wide read used to give.
-- A SECURITY DEFINER helper, because teachers cannot read guardianships.
create or replace function private.teaches_guardian(p_guardian uuid, p_studio uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.guardianships g
    where g.guardian_id = p_guardian
      and g.studio_id = p_studio
      and private.teaches_student(g.student_id)
  )
$$;
revoke all on function private.teaches_guardian(uuid, uuid) from public, anon;
grant execute on function private.teaches_guardian(uuid, uuid) to authenticated, service_role;

drop policy if exists "profiles_teacher_read_guardians" on public.profiles;
create policy "profiles_teacher_read_guardians" on public.profiles
  for select to authenticated
  using (
    studio_id = (select private.current_studio())
    and (select private.current_user_role()) = 'teacher'
    and private.teaches_guardian(id, studio_id)
  );

-- ─── C-03: server-owned profile columns ────────────────────────────────────
-- Extends the existing guard. Stripe/Xero identifiers may be stamped once
-- (null -> value) by the server paths that run under the user's session, but
-- never rewritten. Verification and account kind are never client-editable.
-- self_managed unlocks adult self-service, so only a studio admin may flip it.

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

    if new.network_verified is distinct from old.network_verified
       or new.account_kind is distinct from old.account_kind then
      raise exception 'Not authorized to change profile verification' using errcode = '42501';
    end if;

    if new.self_managed is distinct from old.self_managed
       and (private.current_user_role() is distinct from 'admin'
         or old.studio_id is distinct from private.current_studio()) then
      raise exception 'Not authorized to change self-managed status' using errcode = '42501';
    end if;

    if (new.stripe_customer_id is distinct from old.stripe_customer_id
          and old.stripe_customer_id is not null)
       or (new.xero_contact_id is distinct from old.xero_contact_id
          and old.xero_contact_id is not null) then
      raise exception 'Billing identifiers cannot be changed' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ─── C-04: only teachers of the studio can claim its substitute requests ───

drop policy if exists "sub_requests_teacher_claim" on public.substitute_requests;
create policy "sub_requests_teacher_claim" on public.substitute_requests
  for update to authenticated
  using (
    status = 'open'
    and private.user_in_studio((select auth.uid()), studio_id)
    and exists (
      select 1 from public.profiles p
      left join public.studio_memberships m
        on m.user_id = p.id and m.studio_id = substitute_requests.studio_id
      where p.id = (select auth.uid())
        and case when p.studio_id = substitute_requests.studio_id
              then p.role else m.role end = 'teacher'
    )
  )
  with check (
    filled_by = (select auth.uid())
    and status = 'filled'
    and private.user_in_studio((select auth.uid()), studio_id)
  );

-- ─── C-05: bookings stay inside the caller's studio ────────────────────────

drop policy if exists "plb_parent_insert" on public.private_lesson_bookings;
create policy "plb_parent_insert" on public.private_lesson_bookings
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and studio_id = (select private.current_studio())
    and private.is_my_child(student_id)
    and private.user_in_studio(teacher_id, studio_id)
    and status = 'requested'
  );

-- ─── C-06: absences only for the caller's own children ─────────────────────

drop policy if exists "absences_parent_rw" on public.student_absences;
create policy "absences_parent_rw" on public.student_absences
  for all to authenticated
  using (
    reported_by = (select auth.uid())
    or exists (
      select 1 from public.guardianships g
      where g.student_id = student_absences.student_id
        and g.guardian_id = (select auth.uid())
    )
  )
  with check (
    studio_id = (select private.current_studio())
    and (
      private.is_my_child(student_id)
      or student_id = (select auth.uid())
    )
  );

-- ─── C-08: only studio admins and the server choose an invoice number ──────

create or replace function private.assign_invoice_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_num int;
begin
  if new.invoice_number is not null
     and (auth.uid() is null
       or (private.current_studio() = new.studio_id
           and private.current_user_role() in ('admin', 'office')))
  then
    return new;
  end if;

  insert into public.studio_invoice_counters (studio_id, last_number)
  values (new.studio_id, 1)
  on conflict (studio_id) do update
    set last_number = studio_invoice_counters.last_number + 1
  returning last_number into next_num;

  new.invoice_number := next_num;
  return new;
end;
$$;

-- ─── E-02: the notification queue is not client-writable ───────────────────
-- Users read their own rows and may mark them read. Studio admins keep the
-- ability to notify members of their own studio only. Everything else (the
-- crons, webhooks, triggers) runs as service role or SECURITY DEFINER.

drop policy if exists "notifications_own" on public.notifications;
drop policy if exists "notifications_own_read" on public.notifications;
drop policy if exists "notifications_own_mark_read" on public.notifications;
create policy "notifications_own_read" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "notifications_own_mark_read" on public.notifications
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "notifications_admin_all" on public.notifications;
create policy "notifications_admin_all" on public.notifications
  for all to authenticated
  using (
    studio_id = (select private.current_studio())
    and (select private.current_user_role()) = 'admin'
  )
  with check (
    studio_id = (select private.current_studio())
    and (select private.current_user_role()) = 'admin'
    and private.user_in_studio(user_id, studio_id)
  );

revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

-- ─── E-05: who may message whom (membership roles, not profiles.role) ──────

create or replace function private.can_message(p_to uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  with me as (
    select c.studio_id, c.user_role::text as role
    from private.user_studio_context() c
  ),
  peer as (
    select case when p.studio_id = me.studio_id then p.role::text else m.role::text end as role
    from me
    join public.profiles p on p.id = p_to
    left join public.studio_memberships m
      on m.user_id = p.id and m.studio_id = me.studio_id
    where p.id <> auth.uid()
      and (m.status = 'active' or (m.id is null and p.studio_id = me.studio_id))
  )
  select exists (
    select 1 from me, peer
    where
      -- staff reach anyone in the studio
      me.role in ('admin', 'office')
      -- teachers reach staff, other teachers, and families they teach
      or (me.role = 'teacher' and (
        peer.role in ('admin', 'office', 'teacher')
        or (peer.role = 'parent' and exists (
          select 1 from public.guardianships g
          join public.enrollments e on e.student_id = g.student_id
            and e.studio_id = me.studio_id and e.status = 'active'
          join public.classes c on c.id = e.class_id
            and c.teacher_id = auth.uid() and c.studio_id = me.studio_id
          where g.guardian_id = p_to and g.studio_id = me.studio_id
        ))
        or (peer.role = 'student' and exists (
          select 1 from public.enrollments e
          join public.classes c on c.id = e.class_id
            and c.teacher_id = auth.uid() and c.studio_id = me.studio_id
          where e.student_id = p_to and e.studio_id = me.studio_id
            and e.status = 'active'
        ))
      ))
      -- families reach staff and the teachers of their own children
      or (me.role = 'parent' and (
        peer.role in ('admin', 'office')
        or (peer.role = 'teacher' and exists (
          select 1 from public.guardianships g
          join public.enrollments e on e.student_id = g.student_id
            and e.studio_id = me.studio_id and e.status = 'active'
          join public.classes c on c.id = e.class_id
            and c.teacher_id = p_to and c.studio_id = me.studio_id
          where g.guardian_id = auth.uid() and g.studio_id = me.studio_id
        ))
      ))
      -- students reach staff and their own teachers
      or (me.role = 'student' and (
        peer.role in ('admin', 'office')
        or (peer.role = 'teacher' and exists (
          select 1 from public.enrollments e
          join public.classes c on c.id = e.class_id
            and c.teacher_id = p_to and c.studio_id = me.studio_id
          where e.student_id = auth.uid() and e.studio_id = me.studio_id
            and e.status = 'active'
        ))
      ))
  )
$$;
revoke all on function private.can_message(uuid) from public, anon;
grant execute on function private.can_message(uuid) to authenticated, service_role;

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (
    studio_id = (select private.current_studio())
    and from_user_id = (select auth.uid())
    and private.can_message(to_user_id)
  );
