-- October audit R-04: tenant helpers in RLS policies must be evaluated once per
-- statement, not once per row. With bare helper calls an admin count over 20,000
-- attendance rows took about 5 s on a developer laptop; wrapped as InitPlans it
-- takes a few milliseconds. The threshold leaves a wide margin for slow CI
-- machines while still failing by an order of magnitude on a regression.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(2);

insert into public.studios (id, name, slug, status)
values ('00000000-0000-0000-0000-0000000e0001', 'RLS scale studio', 'rls-scale-studio', 'trial');
insert into auth.users (id, email)
select ('00000000-0000-0000-0001-' || lpad(to_hex(i), 12, '0'))::uuid, 'rls-scale-' || i || '@example.invalid'
from generate_series(1, 200) i;
update public.profiles
set studio_id = '00000000-0000-0000-0000-0000000e0001',
    active_studio_id = '00000000-0000-0000-0000-0000000e0001',
    role = 'student'
where id::text like '00000000-0000-0000-0001-%';
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0001-000000000001';
insert into public.studio_memberships (user_id, studio_id, role, status, is_primary)
select id, '00000000-0000-0000-0000-0000000e0001', role, 'active', true
from public.profiles where id::text like '00000000-0000-0000-0001-%';
insert into public.classes (id, studio_id, name)
values ('00000000-0000-0000-0000-0000000e0201', '00000000-0000-0000-0000-0000000e0001', 'scale class');
insert into public.attendance (studio_id, class_id, student_id, date, status)
select '00000000-0000-0000-0000-0000000e0001', '00000000-0000-0000-0000-0000000e0201', p.id, current_date - d, 'present'
from public.profiles p, generate_series(1, 100) d
where p.id::text like '00000000-0000-0000-0001-%';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0001-000000000001', true);
select set_config('scale.start', clock_timestamp()::text, true);
select is((select count(*) from public.attendance), 20000::bigint, 'admin reads all 20,000 attendance rows of their studio');
select ok(clock_timestamp() - current_setting('scale.start')::timestamptz < interval '500 milliseconds',
          'RLS helpers are evaluated once per statement, not once per row');

select * from finish();
rollback;
