-- October audit, Gate 1 (R-01, F1-01, C-01).
--
-- R-01: a parent could insert a guardianship for any student in their studio
--       straight through PostgREST and then read that child's invoices etc.
--       All app code creates guardianships with the service-role client, so the
--       client-facing insert policy is simply removed.
-- F1-01: a guardianship must tie a student that belongs to the guardianship's
--       studio (profile home studio or an active/pending membership).
-- C-01: every studio member could read every profile in the studio (children's
--       birthdays, phones, other families). Studio-wide read is narrowed to
--       staff profiles; own, own-children, teacher-roster and admin policies
--       are unchanged.

drop policy if exists "guardianships_parent_insert" on public.guardianships;

create or replace function private.guardianship_student_in_studio()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = new.student_id and p.studio_id = new.studio_id
  ) and not exists (
    select 1 from public.studio_memberships m
    where m.user_id = new.student_id and m.studio_id = new.studio_id
  ) then
    raise exception 'guardianship student does not belong to studio %', new.studio_id
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists guardianships_student_in_studio on public.guardianships;
create trigger guardianships_student_in_studio
  before insert or update of student_id, studio_id on public.guardianships
  for each row execute function private.guardianship_student_in_studio();

drop policy if exists "read profiles in own studio" on public.profiles;
drop policy if exists "read staff profiles in own studio" on public.profiles;
create policy "read staff profiles in own studio" on public.profiles
  for select to authenticated
  using (
    studio_id = (select private.current_studio())
    and role in ('admin', 'teacher', 'office')
  );
