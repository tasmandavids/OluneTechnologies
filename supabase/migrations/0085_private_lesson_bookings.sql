-- ============================================================================
--  0085 — Private lesson bookings
--  Parent requests a private lesson against a teacher's availability →
--  teacher accepts/declines → on acceptance a student_schedule_entry
--  (private_lesson) is created so it flows to every schedule → admin reviews
--  and bills per-booking via the existing studio-invoice rail.
-- ============================================================================

create table if not exists public.private_lesson_bookings (
  id                 uuid primary key default gen_random_uuid(),
  studio_id          uuid not null references public.studios(id) on delete cascade,
  teacher_id         uuid not null references public.profiles(id) on delete cascade,
  student_id         uuid not null references public.profiles(id) on delete cascade,
  requested_by       uuid not null references public.profiles(id) on delete cascade, -- parent / payer
  lesson_date        date not null,
  start_time         time not null,
  end_time           time not null,
  location_name      text,
  parent_note        text,
  status             text not null default 'requested'
                       check (status in ('requested', 'accepted', 'declined', 'cancelled')),
  teacher_response_note text,
  schedule_entry_id  uuid references public.student_schedule_entries(id) on delete set null,
  invoice_id         uuid references public.invoices(id) on delete set null,
  amount_cents       int check (amount_cents is null or amount_cents >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint plb_time_order check (end_time > start_time)
);

create index if not exists plb_teacher_status_idx on public.private_lesson_bookings(teacher_id, status);
create index if not exists plb_studio_status_idx  on public.private_lesson_bookings(studio_id, status);
create index if not exists plb_requested_by_idx    on public.private_lesson_bookings(requested_by);
create index if not exists plb_student_date_idx     on public.private_lesson_bookings(student_id, lesson_date);

drop trigger if exists private_lesson_bookings_updated_at on public.private_lesson_bookings;
create trigger private_lesson_bookings_updated_at
  before update on public.private_lesson_bookings
  for each row execute function private.touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.private_lesson_bookings enable row level security;

-- Parent: request a lesson for their own child
drop policy if exists "plb_parent_insert" on public.private_lesson_bookings;
create policy "plb_parent_insert" on public.private_lesson_bookings
  for insert with check (
    requested_by = auth.uid()
    and private.is_my_child(student_id)
    and status = 'requested'
  );

-- Parent: read their own requests (any status)
drop policy if exists "plb_parent_read" on public.private_lesson_bookings;
create policy "plb_parent_read" on public.private_lesson_bookings
  for select using (requested_by = auth.uid());

-- Parent: cancel a still-pending request
drop policy if exists "plb_parent_cancel" on public.private_lesson_bookings;
create policy "plb_parent_cancel" on public.private_lesson_bookings
  for update using (requested_by = auth.uid() and status = 'requested')
  with check (requested_by = auth.uid() and status in ('requested', 'cancelled'));

-- Teacher: read requests addressed to them (accept/decline happen via RPC)
drop policy if exists "plb_teacher_read" on public.private_lesson_bookings;
create policy "plb_teacher_read" on public.private_lesson_bookings
  for select using (teacher_id = auth.uid());

-- Admin: full access within their studio (review queue + billing)
drop policy if exists "plb_admin_all" on public.private_lesson_bookings;
create policy "plb_admin_all" on public.private_lesson_bookings
  for all using (
    studio_id = private.current_studio()
    and private.is_studio_admin()
  )
  with check (
    studio_id = private.current_studio()
    and private.is_studio_admin()
  );

grant select, insert, update on public.private_lesson_bookings to authenticated;

-- ─── Availability visibility for booking ─────────────────────────────────────
-- Parents (and any member) need to see the weekly windows of teachers in their
-- studio to pick a slot. Mirrors the existing availability_admin_read shape.
drop policy if exists "availability_studio_member_read" on public.instructor_availability;
create policy "availability_studio_member_read" on public.instructor_availability
  for select using (
    exists (
      select 1 from public.profiles me
      where me.id = auth.uid()
        and (
          -- teacher is staff at my studio
          exists (
            select 1 from public.profiles t
            where t.id = instructor_availability.instructor_id
              and t.studio_id = me.studio_id
          )
          or
          -- teacher is affiliated to my studio
          exists (
            select 1 from public.studio_memberships sm
            where sm.user_id = instructor_availability.instructor_id
              and sm.studio_id = me.studio_id
              and sm.status = 'active'
          )
        )
    )
  );

-- ─── Notify teacher on a new request ─────────────────────────────────────────

create or replace function private.notify_private_lesson_request()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_student_name text;
  v_body text;
begin
  select full_name into v_student_name from public.profiles where id = new.student_id;

  v_body := coalesce(v_student_name, 'A student')
    || ' · ' || to_char(new.lesson_date, 'Dy Mon DD');
  if new.start_time is not null then
    v_body := v_body || ' at ' || to_char(new.start_time, 'HH12:MI AM');
  end if;

  insert into public.notifications (studio_id, user_id, type, title, body, link, payload)
  values (
    new.studio_id,
    new.teacher_id,
    'private_lesson_request',
    'New private lesson request',
    v_body,
    '/portal/teacher/private-lessons',
    jsonb_build_object('booking_id', new.id, 'action', 'requested')
  );

  return new;
end;
$$;

drop trigger if exists private_lesson_notify_request on public.private_lesson_bookings;
create trigger private_lesson_notify_request
  after insert on public.private_lesson_bookings
  for each row
  when (new.status = 'requested')
  execute function private.notify_private_lesson_request();

-- ─── Teacher accept / decline (SECURITY DEFINER) ─────────────────────────────
-- The teacher may not teach the child in a regular class, so the schedule-entry
-- insert must bypass the teaches_student() policy. These functions validate the
-- caller is the assigned teacher and enforce the requested→accepted/declined
-- transition.

create or replace function public.accept_private_lesson(p_booking uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_booking public.private_lesson_bookings;
  v_teacher_name text;
  v_entry_id uuid;
begin
  select * into v_booking from public.private_lesson_bookings where id = p_booking for update;

  if v_booking.id is null then raise exception 'Booking not found'; end if;
  if v_booking.teacher_id <> auth.uid() then raise exception 'Not authorised for this booking'; end if;
  if v_booking.status <> 'requested' then raise exception 'Booking is no longer pending'; end if;

  select full_name into v_teacher_name from public.profiles where id = v_booking.teacher_id;

  insert into public.student_schedule_entries (
    studio_id, student_id, title, description, entry_date,
    start_time, end_time, entry_type, location_name, created_by
  ) values (
    v_booking.studio_id,
    v_booking.student_id,
    'Private lesson with ' || coalesce(v_teacher_name, 'teacher'),
    v_booking.parent_note,
    v_booking.lesson_date,
    v_booking.start_time,
    v_booking.end_time,
    'private_lesson',
    v_booking.location_name,
    v_booking.teacher_id
  )
  returning id into v_entry_id;

  update public.private_lesson_bookings
  set status = 'accepted',
      teacher_response_note = p_note,
      schedule_entry_id = v_entry_id
  where id = p_booking;

  return p_booking;
end;
$$;

create or replace function public.decline_private_lesson(p_booking uuid, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_booking public.private_lesson_bookings;
  v_student_name text;
begin
  select * into v_booking from public.private_lesson_bookings where id = p_booking for update;

  if v_booking.id is null then raise exception 'Booking not found'; end if;
  if v_booking.teacher_id <> auth.uid() then raise exception 'Not authorised for this booking'; end if;
  if v_booking.status <> 'requested' then raise exception 'Booking is no longer pending'; end if;

  update public.private_lesson_bookings
  set status = 'declined',
      teacher_response_note = p_note
  where id = p_booking;

  select full_name into v_student_name from public.profiles where id = v_booking.student_id;

  insert into public.notifications (studio_id, user_id, type, title, body, link, payload)
  values (
    v_booking.studio_id,
    v_booking.requested_by,
    'private_lesson_declined',
    'Private lesson request declined',
    coalesce(v_student_name, 'Your dancer') || ' · ' || to_char(v_booking.lesson_date, 'Dy Mon DD')
      || case when p_note is not null and length(trim(p_note)) > 0 then ' — ' || p_note else '' end,
    '/portal/parent/private-lessons',
    jsonb_build_object('booking_id', p_booking, 'action', 'declined')
  );

  return p_booking;
end;
$$;

grant execute on function public.accept_private_lesson(uuid, text) to authenticated;
grant execute on function public.decline_private_lesson(uuid, text) to authenticated;
