-- October audit R-14: reserved words cannot be claimed as studio slugs.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(3);

select throws_ok(
  $$insert into public.studios (name, slug, status) values ('Fake support', 'support', 'trial')$$,
  '23514', null, 'reserved slug "support" is rejected');
select throws_ok(
  $$insert into public.studios (name, slug, status) values ('Fake billing', 'Billing', 'trial')$$,
  '23514', null, 'reserved slug is rejected case-insensitively');
select lives_ok(
  $$insert into public.studios (name, slug, status) values ('Real studio', 'reserved-slug-ok', 'trial')$$,
  'an ordinary slug is still accepted');

select * from finish();
rollback;
