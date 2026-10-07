-- October audit: R-03, B-07, F2a-01. Families enrol only through
-- enroll_student_atomic (SECURITY DEFINER, explicit authorisation), cannot write
-- enrolments or invoice line items directly, and see real spots-left counts.
-- Every fixture and attempted write is rolled back at the end of this file.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(10);

insert into public.studios (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000000f001', 'Enrol studio A', 'enrol-studio-a', 'trial'),
  ('00000000-0000-0000-0000-00000000f002', 'Enrol studio B', 'enrol-studio-b', 'trial');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000f101', 'enrol-admin-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000f104', 'enrol-parent-1@example.invalid'),
  ('00000000-0000-0000-0000-00000000f105', 'enrol-parent-2@example.invalid'),
  ('00000000-0000-0000-0000-00000000f106', 'enrol-child-1@example.invalid'),
  ('00000000-0000-0000-0000-00000000f107', 'enrol-child-2@example.invalid'),
  ('00000000-0000-0000-0000-00000000f203', 'enrol-parent-b@example.invalid');

update public.profiles
set studio_id = '00000000-0000-0000-0000-00000000f001',
    active_studio_id = '00000000-0000-0000-0000-00000000f001',
    role = case id
      when '00000000-0000-0000-0000-00000000f101' then 'admin'::public.user_role
      when '00000000-0000-0000-0000-00000000f106' then 'student'::public.user_role
      when '00000000-0000-0000-0000-00000000f107' then 'student'::public.user_role
      else 'parent'::public.user_role end
where id in ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f104',
             '00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-00000000f106',
             '00000000-0000-0000-0000-00000000f107');
update public.profiles
set studio_id = '00000000-0000-0000-0000-00000000f002',
    active_studio_id = '00000000-0000-0000-0000-00000000f002',
    role = 'parent'
where id = '00000000-0000-0000-0000-00000000f203';

insert into public.studio_memberships (user_id, studio_id, role, status, is_primary) values
  ('00000000-0000-0000-0000-00000000f101', '00000000-0000-0000-0000-00000000f001', 'admin', 'active', true),
  ('00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000f001', 'parent', 'active', true),
  ('00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-00000000f001', 'parent', 'active', true),
  ('00000000-0000-0000-0000-00000000f106', '00000000-0000-0000-0000-00000000f001', 'student', 'active', true),
  ('00000000-0000-0000-0000-00000000f107', '00000000-0000-0000-0000-00000000f001', 'student', 'active', true),
  ('00000000-0000-0000-0000-00000000f203', '00000000-0000-0000-0000-00000000f002', 'parent', 'active', true);

insert into public.guardianships (studio_id, guardian_id, student_id) values
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000f106'),
  ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f105', '00000000-0000-0000-0000-00000000f107');

insert into public.classes (id, studio_id, name, capacity) values
  ('00000000-0000-0000-0000-00000000f301', '00000000-0000-0000-0000-00000000f001', 'Open class', 10),
  ('00000000-0000-0000-0000-00000000f302', '00000000-0000-0000-0000-00000000f001', 'Full class', 1);
-- Child 2 already holds the only place in the full class.
insert into public.enrollments (studio_id, student_id, class_id, status)
values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f107',
        '00000000-0000-0000-0000-00000000f302', 'active');
insert into public.invoices (id, studio_id, payer_id, student_id, amount_cents, status) values
  ('00000000-0000-0000-0000-00000000f401', '00000000-0000-0000-0000-00000000f001',
   '00000000-0000-0000-0000-00000000f104', '00000000-0000-0000-0000-00000000f106', 1000, 'sent');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f104', true);

select is(
  (select waitlisted from public.enroll_student_atomic(
    '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f106',
    '00000000-0000-0000-0000-00000000f301')),
  false, 'F2a-01: a parent can enrol their own child into an open class');
select is(
  (select waitlisted from public.enroll_student_atomic(
    '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f106',
    '00000000-0000-0000-0000-00000000f302')),
  true, 'R-03: a full class puts the child on the waitlist, not into it');
select throws_ok(
  $$select * from public.enroll_student_atomic(
    '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f107',
    '00000000-0000-0000-0000-00000000f301')$$,
  '42501', null, 'R-03: a parent cannot enrol another family''s child');
select throws_ok(
  $$select * from public.enroll_student_atomic(
    '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000f106',
    '00000000-0000-0000-0000-00000000f301')$$,
  '42501', null, 'R-03: the studio argument cannot differ from the caller''s workspace');
select throws_ok(
  $$insert into public.enrollments (studio_id, student_id, class_id, status)
    values ('00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f106',
            '00000000-0000-0000-0000-00000000f302', 'active')$$,
  '42501', null, 'R-03: a parent cannot insert an enrolment directly');
select throws_ok(
  $$insert into public.invoice_line_items
      (invoice_id, item_type, description, quantity, unit_cents, line_total_cents, sort_order)
    values ('00000000-0000-0000-0000-00000000f401', 'tuition_hours', 'forged', 1, 999999, 999999, 9)$$,
  '42501', null, 'B-07: a payer cannot write their own invoice line items');
select is(
  (select enrolled from public.class_enrolled_counts(array['00000000-0000-0000-0000-00000000f302']::uuid[])),
  1, 'F2a-01: a parent sees the true enrolled count, not only the rows they can read');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f203', true);
select throws_ok(
  $$select * from public.enroll_student_atomic(
    '00000000-0000-0000-0000-00000000f002', '00000000-0000-0000-0000-00000000f106',
    '00000000-0000-0000-0000-00000000f301')$$,
  '42501', null, 'R-03: a parent of another studio cannot enrol a studio A child');
select is(
  (select count(*) from public.class_enrolled_counts(array['00000000-0000-0000-0000-00000000f302']::uuid[])),
  0::bigint, 'counts are limited to the caller''s own studio');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000f101', true);
select is(
  (select waitlisted from public.enroll_student_atomic(
    '00000000-0000-0000-0000-00000000f001', '00000000-0000-0000-0000-00000000f107',
    '00000000-0000-0000-0000-00000000f301')),
  false, 'a studio admin can still enrol a student');

select * from finish();
rollback;
