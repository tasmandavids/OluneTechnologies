-- October audit F2a-02: an adult self-managed student reads their own invoices
-- and nobody else's. Everything is rolled back at the end.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(2);

insert into public.studios (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000000a001', 'Adult studio', 'adult-studio', 'trial');
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a101', 'adult-1@example.invalid'),
  ('00000000-0000-0000-0000-00000000a102', 'adult-2@example.invalid');
update public.profiles
set studio_id = '00000000-0000-0000-0000-00000000a001',
    active_studio_id = '00000000-0000-0000-0000-00000000a001',
    role = 'student', self_managed = true
where id in ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a102');
insert into public.studio_memberships (user_id, studio_id, role, status, is_primary) values
  ('00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a001', 'student', 'active', true),
  ('00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a001', 'student', 'active', true);
insert into public.invoices (studio_id, payer_id, student_id, amount_cents, status) values
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a101', '00000000-0000-0000-0000-00000000a101', 5000, 'sent'),
  ('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a102', '00000000-0000-0000-0000-00000000a102', 7000, 'sent');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000a101","role":"authenticated"}', true);
select is((select count(*)::int from public.invoices where payer_id = '00000000-0000-0000-0000-00000000a101'), 1,
  'adult reads their own invoice');
select is((select count(*)::int from public.invoices where payer_id = '00000000-0000-0000-0000-00000000a102'), 0,
  'adult cannot read another adult''s invoice');

select * from finish();
rollback;
