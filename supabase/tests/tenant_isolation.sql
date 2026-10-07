-- Run against a disposable local database after all migrations have replayed.
-- Every fixture and attempted write is rolled back at the end of this file.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(22);

insert into public.studios (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000000a001', 'RLS studio A', 'rls-studio-a', 'trial'),
  ('00000000-0000-0000-0000-00000000b001', 'RLS studio B', 'rls-studio-b', 'trial');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a101', 'rls-admin-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000a102', 'rls-parent-a@example.invalid'),
  ('00000000-0000-0000-0000-00000000a103', 'rls-parent-a2@example.invalid'),
  ('00000000-0000-0000-0000-00000000b101', 'rls-admin-b@example.invalid'),
  ('00000000-0000-0000-0000-00000000b102', 'rls-parent-b@example.invalid');

update public.profiles
set studio_id = '00000000-0000-0000-0000-00000000a001',
    active_studio_id = '00000000-0000-0000-0000-00000000a001',
    role = case when id = '00000000-0000-0000-0000-00000000a101' then 'admin'::public.user_role else 'parent'::public.user_role end
where id in ('00000000-0000-0000-0000-00000000a101',
             '00000000-0000-0000-0000-00000000a102',
             '00000000-0000-0000-0000-00000000a103');
update public.profiles
set studio_id = '00000000-0000-0000-0000-00000000b001',
    active_studio_id = '00000000-0000-0000-0000-00000000b001',
    role = case when id = '00000000-0000-0000-0000-00000000b101' then 'admin'::public.user_role else 'parent'::public.user_role end
where id in ('00000000-0000-0000-0000-00000000b101',
             '00000000-0000-0000-0000-00000000b102');

insert into public.studio_memberships (user_id, studio_id, role, status, is_primary) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a001', 'admin', 'active', true),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a001', 'parent', 'active', true),
  ('00000000-0000-0000-0000-00000000a103', '00000000-0000-0000-0000-00000000a001', 'parent', 'active', true),
  ('00000000-0000-0000-0000-00000000b101', '00000000-0000-0000-0000-00000000b001', 'admin', 'active', true),
  ('00000000-0000-0000-0000-00000000b102', '00000000-0000-0000-0000-00000000b001', 'parent', 'active', true),
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000b001', 'parent', 'active', false);

insert into public.classes (id, studio_id, name) values
  ('00000000-0000-0000-0000-00000000a201', '00000000-0000-0000-0000-00000000a001', 'Studio A class'),
  ('00000000-0000-0000-0000-00000000b201', '00000000-0000-0000-0000-00000000b001', 'Studio B class');
insert into public.invoices (id, studio_id, payer_id, amount_cents, status) values
  ('00000000-0000-0000-0000-00000000a301', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a102', 1000, 'sent'),
  ('00000000-0000-0000-0000-00000000a302', '00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a103', 2000, 'sent'),
  ('00000000-0000-0000-0000-00000000b301', '00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000b102', 3000, 'sent');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a101', true);
select is(private.current_studio(), '00000000-0000-0000-0000-00000000a001'::uuid, 'admin A has studio A context');
select is((select count(*) from public.classes where studio_id = '00000000-0000-0000-0000-00000000a001'), 1::bigint, 'admin A reads own class');
select is((select count(*) from public.classes where studio_id = '00000000-0000-0000-0000-00000000b001'), 0::bigint, 'admin A cannot read studio B class');
select is((select count(*) from public.invoices where studio_id = '00000000-0000-0000-0000-00000000a001'), 2::bigint, 'admin A reads own invoices');
select is((select count(*) from public.invoices where studio_id = '00000000-0000-0000-0000-00000000b001'), 0::bigint, 'admin A cannot read studio B invoice');
with changed as (
  update public.classes set name = 'tampered'
  where id = '00000000-0000-0000-0000-00000000b201' returning id
)
select is((select count(*) from changed), 0::bigint, 'admin A cannot update studio B class');
select throws_ok(
  $$insert into public.classes (studio_id, name) values ('00000000-0000-0000-0000-00000000b001', 'intrusion')$$,
  '42501', null, 'admin A cannot insert into studio B'
);
select set_config('request.jwt.claims', '{"studio_id":"00000000-0000-0000-0000-00000000b001","user_role":"admin"}', true);
select is(private.current_studio(), '00000000-0000-0000-0000-00000000a001'::uuid, 'stale token claims do not switch the database tenant');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a102', true);
select is((select count(*) from public.invoices where id = '00000000-0000-0000-0000-00000000a301'), 1::bigint, 'parent A reads own invoice');
select is((select count(*) from public.invoices where id = '00000000-0000-0000-0000-00000000a302'), 0::bigint, 'parent A cannot read another family invoice');
select is((select count(*) from public.invoices where id = '00000000-0000-0000-0000-00000000b301'), 0::bigint, 'parent A cannot read studio B invoice');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000a102'$$,
  '42501', null, 'parent cannot promote their own role'
);

select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000a103'), 0::bigint, 'parent A cannot read another family profile');
select is((select count(*) from public.profiles where id = '00000000-0000-0000-0000-00000000a101'), 1::bigint, 'parent A can still read studio staff profiles');
select throws_ok(
  $$insert into public.guardianships (studio_id, guardian_id, student_id)
    values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a103')$$,
  '42501', null, 'parent cannot self-link as guardian of another studio member'
);

reset role;
set local role anon;
select throws_ok('select count(*) from public.profiles', '42501', null, 'anonymous caller cannot query private profiles');
select throws_ok('select count(*) from public.invoices', '42501', null, 'anonymous caller cannot query invoices');

reset role;
update public.profiles set active_studio_id = '00000000-0000-0000-0000-00000000b001'
where id = '00000000-0000-0000-0000-00000000a101';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a101', true);
select is(private.current_user_role()::text, 'parent', 'member switching to B uses the B role');
reset role;
update public.studio_memberships set status = 'suspended'
where user_id = '00000000-0000-0000-0000-00000000a101'
  and studio_id = '00000000-0000-0000-0000-00000000b001';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000a101', true);
select is(private.current_studio(), null::uuid, 'suspended membership immediately removes tenant context');
select is((select count(*) from public.classes), 0::bigint, 'suspended member cannot read classes');

reset role;
select is((select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
           join pg_attribute a on a.attrelid = c.oid and a.attname = 'studio_id' and not a.attisdropped
           where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
          0::bigint, 'all studio-scoped public tables have RLS enabled');
select throws_ok(
  $$insert into public.guardianships (studio_id, guardian_id, student_id)
    values ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000b102')$$,
  '23514', null, 'guardianship cannot tie a student from another studio'
);
select * from finish();
rollback;
