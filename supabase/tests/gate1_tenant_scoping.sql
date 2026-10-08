-- October audit, Gate 1 negative tests: C-02, C-03, C-04, C-05, C-06, C-08,
-- E-02, E-05 (plus the teacher/guardian reads that must keep working).
-- Run against a disposable database after all migrations have replayed. Every
-- fixture and attempted write is rolled back at the end of this file.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(30);

-- Studios: A (the victim) and B (an unrelated studio).
insert into public.studios (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000000c001', 'Scope studio A', 'scope-studio-a', 'trial'),
  ('00000000-0000-0000-0000-00000000d001', 'Scope studio B', 'scope-studio-b', 'trial');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000c101', 'scope-admin-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000c102', 'scope-teacher-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000c103', 'scope-teacher-suspended@example.invalid'),
  ('00000000-0000-0000-0000-00000000c104', 'scope-parent-a1@example.invalid'),
  ('00000000-0000-0000-0000-00000000c105', 'scope-parent-a2@example.invalid'),
  ('00000000-0000-0000-0000-00000000c106', 'scope-child-a1@example.invalid'),
  ('00000000-0000-0000-0000-00000000c107', 'scope-child-a2@example.invalid'),
  ('00000000-0000-0000-0000-00000000d102', 'scope-teacher-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000d103', 'scope-parent-b@example.invalid');

update public.profiles
set studio_id = '00000000-0000-0000-0000-00000000c001',
    active_studio_id = '00000000-0000-0000-0000-00000000c001',
    role = case id
      when '00000000-0000-0000-0000-00000000c101' then 'admin'::public.user_role
      when '00000000-0000-0000-0000-00000000c102' then 'teacher'::public.user_role
      when '00000000-0000-0000-0000-00000000c103' then 'teacher'::public.user_role
      when '00000000-0000-0000-0000-00000000c106' then 'student'::public.user_role
      when '00000000-0000-0000-0000-00000000c107' then 'student'::public.user_role
      else 'parent'::public.user_role end
where id in ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c102',
             '00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000c104',
             '00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000c106',
             '00000000-0000-0000-0000-00000000c107');
update public.profiles
set studio_id = '00000000-0000-0000-0000-00000000d001',
    active_studio_id = '00000000-0000-0000-0000-00000000d001',
    role = case when id = '00000000-0000-0000-0000-00000000d102'
      then 'teacher'::public.user_role else 'parent'::public.user_role end
where id in ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000d103');
update public.profiles set stripe_customer_id = 'cus_scope_parent_a1'
where id = '00000000-0000-0000-0000-00000000c104';

insert into public.studio_memberships (user_id, studio_id, role, status, is_primary) values
  ('00000000-0000-0000-0000-00000000c101', '00000000-0000-0000-0000-00000000c001', 'admin', 'active', true),
  ('00000000-0000-0000-0000-00000000c102', '00000000-0000-0000-0000-00000000c001', 'teacher', 'active', true),
  ('00000000-0000-0000-0000-00000000c103', '00000000-0000-0000-0000-00000000c001', 'teacher', 'suspended', true),
  ('00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000c001', 'parent', 'active', true),
  ('00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000c001', 'parent', 'active', true),
  ('00000000-0000-0000-0000-00000000c106', '00000000-0000-0000-0000-00000000c001', 'student', 'active', true),
  ('00000000-0000-0000-0000-00000000c107', '00000000-0000-0000-0000-00000000c001', 'student', 'active', true),
  ('00000000-0000-0000-0000-00000000d102', '00000000-0000-0000-0000-00000000d001', 'teacher', 'active', true),
  ('00000000-0000-0000-0000-00000000d103', '00000000-0000-0000-0000-00000000d001', 'parent', 'active', true);

insert into public.classes (id, studio_id, name, teacher_id) values
  ('00000000-0000-0000-0000-00000000c201', '00000000-0000-0000-0000-00000000c001', 'Scope A class', '00000000-0000-0000-0000-00000000c102'),
  ('00000000-0000-0000-0000-00000000c202', '00000000-0000-0000-0000-00000000c001', 'Scope A suspended-teacher class', '00000000-0000-0000-0000-00000000c103');
insert into public.guardianships (studio_id, guardian_id, student_id) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000c106'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c105', '00000000-0000-0000-0000-00000000c107');
insert into public.enrollments (studio_id, student_id, class_id, status) values
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c106', '00000000-0000-0000-0000-00000000c201', 'active'),
  ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c107', '00000000-0000-0000-0000-00000000c202', 'active');
insert into public.substitute_requests (id, studio_id, class_id, posted_by, class_name, date, start_time, end_time, status) values
  ('00000000-0000-0000-0000-00000000c301', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c201',
   '00000000-0000-0000-0000-00000000c101', 'Scope A class', current_date + 3, '16:00', '17:00', 'open');

set local role authenticated;

-- ── C-02 · a teacher of studio B cannot reach studio A ─────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d102', true);
select throws_ok(
  $$insert into public.classes (studio_id, name, teacher_id) values
    ('00000000-0000-0000-0000-00000000c001', 'injected', '00000000-0000-0000-0000-00000000d102')$$,
  '42501', null, 'C-02: teacher of studio B cannot insert a class into studio A'
);
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000c106'),
  0::bigint, 'C-02: teacher of studio B cannot read a studio A student');

-- A teacher whose membership is suspended keeps nothing, even for a class that still names them.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c103', true);
select is((select count(*) from public.classes where id = '00000000-0000-0000-0000-00000000c202'),
  0::bigint, 'C-02: suspended teacher cannot read the class that still names them');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000c107'),
  0::bigint, 'C-02: suspended teacher cannot read their old roster');
select is((select count(*) from public.enrollments where class_id = '00000000-0000-0000-0000-00000000c202'),
  0::bigint, 'C-02: suspended teacher cannot read their old enrolments');

-- An active teacher keeps their own roster and its guardians.
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c102', true);
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000c106'),
  1::bigint, 'C-02: teacher still reads a student on their roster');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000c104'),
  1::bigint, 'C-01: teacher still reads the guardian of a student they teach');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000c105'),
  0::bigint, 'C-01: teacher cannot read the guardian of a student they do not teach');

-- ── C-04 · substitute requests ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c104', true);
with changed as (
  update public.substitute_requests
  set status = 'filled', filled_by = '00000000-0000-0000-0000-00000000c104'
  where id = '00000000-0000-0000-0000-00000000c301' returning id
)
select is((select count(*) from changed), 0::bigint, 'C-04: a parent cannot claim a substitute request');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000d102', true);
with changed as (
  update public.substitute_requests
  set status = 'filled', filled_by = '00000000-0000-0000-0000-00000000d102'
  where id = '00000000-0000-0000-0000-00000000c301' returning id
)
select is((select count(*) from changed), 0::bigint, 'C-04: a teacher of another studio cannot claim it');
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c102', true);
with changed as (
  update public.substitute_requests
  set status = 'filled', filled_by = '00000000-0000-0000-0000-00000000c102'
  where id = '00000000-0000-0000-0000-00000000c301' returning id
)
select is((select count(*) from changed), 1::bigint, 'C-04: a teacher of the studio can claim it');

-- ── C-03 · server-owned profile columns ────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c104', true);
select throws_ok(
  $$update public.profiles set stripe_customer_id = 'cus_stolen' where id = '00000000-0000-0000-0000-00000000c104'$$,
  '42501', null, 'C-03: cannot overwrite an existing Stripe customer id'
);
select throws_ok(
  $$update public.profiles set network_verified = true where id = '00000000-0000-0000-0000-00000000c104'$$,
  '42501', null, 'C-03: cannot self-verify'
);
select throws_ok(
  $$update public.profiles set self_managed = true where id = '00000000-0000-0000-0000-00000000c104'$$,
  '42501', null, 'C-03: cannot flip self_managed'
);
select throws_ok(
  $$update public.profiles set account_kind = 'instructor' where id = '00000000-0000-0000-0000-00000000c104'$$,
  '42501', null, 'C-03: cannot change account kind'
);

-- ── C-05 · private-lesson bookings ─────────────────────────────────────────
select throws_ok(
  $$insert into public.private_lesson_bookings
      (studio_id, teacher_id, student_id, requested_by, lesson_date, start_time, end_time, status)
    values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000d102',
            '00000000-0000-0000-0000-00000000c106', '00000000-0000-0000-0000-00000000c104',
            current_date + 5, '10:00', '11:00', 'requested')$$,
  '42501', null, 'C-05: a parent cannot file a booking into another studio'
);
select throws_ok(
  $$insert into public.private_lesson_bookings
      (studio_id, teacher_id, student_id, requested_by, lesson_date, start_time, end_time, status)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000d102',
            '00000000-0000-0000-0000-00000000c106', '00000000-0000-0000-0000-00000000c104',
            current_date + 5, '10:00', '11:00', 'requested')$$,
  '42501', null, 'C-05: a booking cannot name a teacher from another studio'
);

-- ── C-06 · absences ────────────────────────────────────────────────────────
select throws_ok(
  $$insert into public.student_absences (student_id, class_id, absence_date, reported_by, studio_id)
    values ('00000000-0000-0000-0000-00000000c107', '00000000-0000-0000-0000-00000000c202',
            current_date, '00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000c001')$$,
  '42501', null, 'C-06: a parent cannot report an absence for another family''s child'
);

-- ── C-08 · invoice numbers ─────────────────────────────────────────────────
insert into public.invoices (id, studio_id, payer_id, student_id, amount_cents, status, invoice_number)
values ('00000000-0000-0000-0000-00000000c302', '00000000-0000-0000-0000-00000000c001',
        '00000000-0000-0000-0000-00000000c104', '00000000-0000-0000-0000-00000000c106', 500, 'draft', 99999);
select isnt((select invoice_number from public.invoices where id = '00000000-0000-0000-0000-00000000c302'),
  99999, 'C-08: a payer cannot choose their own invoice number');

-- ── E-02 · notification queue ──────────────────────────────────────────────
select throws_ok(
  $$insert into public.notifications (studio_id, user_id, type, title, link)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c104',
            'waitlist_promoted', 'x', 'https://evil.example')$$,
  '42501', null, 'E-02: a parent cannot write to the notification queue'
);

reset role;
insert into public.notifications (id, studio_id, user_id, type, title)
values ('00000000-0000-0000-0000-00000000c401', '00000000-0000-0000-0000-00000000c001',
        '00000000-0000-0000-0000-00000000c104', 'invoice_sent', 'Invoice');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c104', true);
select throws_ok(
  $$update public.notifications set delivered_at = null, email_sent_at = null
    where id = '00000000-0000-0000-0000-00000000c401'$$,
  '42501', null, 'E-02: a parent cannot rewrite delivery columns'
);
with changed as (
  update public.notifications set read_at = now()
  where id = '00000000-0000-0000-0000-00000000c401' returning id
)
select is((select count(*) from changed), 1::bigint, 'E-02: a parent can still mark their notification read');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c101', true);
select throws_ok(
  $$insert into public.notifications (studio_id, user_id, type, title)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000d103', 'x', 'y')$$,
  '42501', null, 'E-02: a studio admin cannot notify a user outside their studio'
);
select lives_ok(
  $$insert into public.notifications (studio_id, user_id, type, title)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c104', 'invoice_sent', 'y')$$,
  'E-02: a studio admin can still notify their own members'
);

-- ── E-05 · messaging ───────────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c104', true);
select throws_ok(
  $$insert into public.messages (studio_id, from_user_id, to_user_id, body)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c104',
            '00000000-0000-0000-0000-00000000c107', 'hi')$$,
  '42501', null, 'E-05: a parent cannot message another family''s child'
);
select throws_ok(
  $$insert into public.messages (studio_id, from_user_id, to_user_id, body)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c104',
            '00000000-0000-0000-0000-00000000c105', 'hi')$$,
  '42501', null, 'E-05: a parent cannot message another parent'
);
select lives_ok(
  $$insert into public.messages (studio_id, from_user_id, to_user_id, body)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c104',
            '00000000-0000-0000-0000-00000000c101', 'hello admin')$$,
  'E-05: a parent can message the studio admin'
);
select lives_ok(
  $$insert into public.messages (studio_id, from_user_id, to_user_id, body)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c104',
            '00000000-0000-0000-0000-00000000c102', 'hello teacher')$$,
  'E-05: a parent can message their child''s teacher'
);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000c102', true);
select lives_ok(
  $$insert into public.messages (studio_id, from_user_id, to_user_id, body)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c102',
            '00000000-0000-0000-0000-00000000c104', 'hello parent')$$,
  'E-05: a teacher can message the guardian of a student they teach'
);
select throws_ok(
  $$insert into public.messages (studio_id, from_user_id, to_user_id, body)
    values ('00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000000c102',
            '00000000-0000-0000-0000-00000000c105', 'hello stranger')$$,
  '42501', null, 'E-05: a teacher cannot message an unrelated family'
);

select * from finish();
rollback;
