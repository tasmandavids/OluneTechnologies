-- October audit: R-03, B-07, F2a-01 — enrolment goes through one checked path.
--
-- R-03   A parent could insert enrolments straight through PostgREST, with any
--        status, into a full class, skipping capacity, waitlist and billing.
-- B-07   A payer could insert their own invoice line items, including forged
--        "already invoiced" tuition_hours lines that zero the next quote.
-- F2a-01 enroll_student_atomic was SECURITY INVOKER, so for a parent
--        `select ... for update` on classes hit the UPDATE policies and raised
--        "Class not found" for every class, and the enrolment count only saw
--        rows the caller could read.
--
-- The RPC becomes SECURITY DEFINER with explicit authorisation, and is the only
-- way a family enrols. Line items are written by the server.

create or replace function public.enroll_student_atomic(
  p_studio_id uuid,
  p_student_id uuid,
  p_class_id uuid
)
returns table (enrollment_id uuid, waitlisted boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_capacity int;
  v_enrolled int;
  v_status text;
  v_existing_id uuid;
  v_existing_status text;
  v_id uuid;
  v_class_ok boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- The caller's workspace decides the studio, never the argument.
  if p_studio_id is distinct from private.current_studio() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- Studio staff, the child's guardian, or a self-managed adult enrolling
  -- themselves. Nobody else, including other families in the same studio.
  if not (
    private.current_user_role() in ('admin', 'office')
    or private.is_my_child(p_student_id)
    or (p_student_id = v_uid and private.is_self_managed_student())
  ) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  -- The student must belong to this studio.
  if not private.user_in_studio(p_student_id, p_studio_id) then
    raise exception 'Student not found' using errcode = '42501';
  end if;

  select true into v_class_ok
  from public.classes c
  where c.id = p_class_id and c.studio_id = p_studio_id
  for update;

  if v_class_ok is distinct from true then
    raise exception 'Class not found';
  end if;

  select e.id, e.status into v_existing_id, v_existing_status
  from public.enrollments e
  where e.student_id = p_student_id and e.class_id = p_class_id
  for update;

  if v_existing_id is not null and v_existing_status = 'active' then
    raise exception 'Already enrolled';
  end if;

  -- Count every active enrolment, not just the rows this caller can read.
  select c.capacity,
         (select count(*)::int from public.enrollments e
           where e.class_id = p_class_id and e.status = 'active')
    into v_capacity, v_enrolled
  from public.classes c
  where c.id = p_class_id;

  v_status := case
    when coalesce(v_capacity, 0) > 0 and coalesce(v_enrolled, 0) >= v_capacity
      then 'waitlisted'
    else 'active'
  end;

  if v_existing_id is not null then
    update public.enrollments
      set status = v_status, studio_id = p_studio_id
      where id = v_existing_id
      returning id into v_id;
  else
    insert into public.enrollments (studio_id, student_id, class_id, status)
    values (p_studio_id, p_student_id, p_class_id, v_status)
    returning id into v_id;
  end if;

  enrollment_id := v_id;
  waitlisted := (v_status = 'waitlisted');
  return next;
end;
$$;

revoke all on function public.enroll_student_atomic(uuid, uuid, uuid) from public, anon;
grant execute on function public.enroll_student_atomic(uuid, uuid, uuid) to authenticated;

-- True active-enrolment counts for the classes of the caller's studio, so
-- parents see real spots left rather than only the rows RLS lets them read.
create or replace function public.class_enrolled_counts(p_class_ids uuid[])
returns table (class_id uuid, enrolled int)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id, count(e.id) filter (where e.status = 'active')::int
  from public.classes c
  left join public.enrollments e on e.class_id = c.id and e.studio_id = c.studio_id
  where c.id = any (p_class_ids)
    and c.studio_id = private.current_studio()
  group by c.id
$$;

revoke all on function public.class_enrolled_counts(uuid[]) from public, anon;
grant execute on function public.class_enrolled_counts(uuid[]) to authenticated;

-- Families no longer write enrolments or line items directly.
drop policy if exists "enroll_parent_insert_child" on public.enrollments;
drop policy if exists "enroll_student_self_insert" on public.enrollments;
drop policy if exists "invoice_line_items_payer_insert_own" on public.invoice_line_items;
