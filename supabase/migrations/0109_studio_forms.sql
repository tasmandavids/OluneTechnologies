-- ============================================================================
--  0109_studio_forms.sql
--
--  Turns the parent-only `student_forms` table into a real studio forms
--  system: an admin builds a form (policy text + fields + a signature block),
--  targets it at everyone / a role / a class / named individuals, and the
--  people it lands on sign it.
--
--  Three moving parts:
--    · student_forms gains the authoring columns (body, signature block,
--      draft/published state, subject scope).
--    · form_assignments is the audience — one row per target, OR'd together.
--    · form_responses gains the signature evidence (who signed, name, when,
--      IP, user agent) alongside the existing `signature` column, which now
--      actually gets written to.
--
--  Security note: the old "forms_parent_read" policy was `active = true` with
--  no tenant predicate, so any signed-in user could read every active form in
--  every studio. It is replaced here with a studio-scoped, published-only,
--  assignment-aware policy.
-- ============================================================================

-- ─── 1. Authoring columns on student_forms ──────────────────────────────────

alter table public.student_forms
  add column if not exists body                text,
  add column if not exists signature_required  boolean not null default false,
  add column if not exists signature_statement text,
  add column if not exists subject_scope       text not null default 'student',
  add column if not exists published_at        timestamptz,
  add column if not exists created_by          uuid references public.profiles(id) on delete set null,
  add column if not exists updated_at          timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'student_forms_subject_scope_check'
  ) then
    alter table public.student_forms
      add constraint student_forms_subject_scope_check
      check (subject_scope in ('student', 'person'));
  end if;
end $$;

-- Widen form_type: studio policies, handbooks and codes of conduct are the
-- reason this feature exists, and none of them fit the enrolment-era list.
alter table public.student_forms drop constraint if exists student_forms_form_type_check;
alter table public.student_forms
  add constraint student_forms_form_type_check
  check (form_type in (
    'medical','emergency_contact','photo_consent','video_consent',
    'waiver','pickup_permission','policy','handbook','code_of_conduct',
    'general'
  ));

-- Every form that already existed was live, so it stays live.
update public.student_forms set published_at = created_at where published_at is null;

-- ─── 2. Audience ────────────────────────────────────────────────────────────
--  kind = all    → everyone in the studio
--  kind = role   → everyone holding that role
--  kind = class  → the active roster of that class
--  kind = person → one named profile
--  A form's audience is the union of its rows; no rows means nobody.

create table if not exists public.form_assignments (
  id          uuid primary key default gen_random_uuid(),
  form_id     uuid not null references public.student_forms(id) on delete cascade,
  studio_id   uuid not null references public.studios(id)       on delete cascade,
  kind        text not null check (kind in ('all', 'role', 'class', 'person')),
  role        public.user_role,
  class_id    uuid references public.classes(id)  on delete cascade,
  profile_id  uuid references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  constraint form_assignments_target_check check (
    (kind = 'all'    and role is null and class_id is null and profile_id is null) or
    (kind = 'role'   and role is not null and class_id is null and profile_id is null) or
    (kind = 'class'  and role is null and class_id is not null and profile_id is null) or
    (kind = 'person' and role is null and class_id is null and profile_id is not null)
  )
);

create index if not exists form_assignments_form_idx   on public.form_assignments(form_id);
create index if not exists form_assignments_studio_idx on public.form_assignments(studio_id);
create index if not exists form_assignments_class_idx  on public.form_assignments(class_id) where class_id is not null;
create index if not exists form_assignments_person_idx on public.form_assignments(profile_id) where profile_id is not null;

-- One row per target, so re-saving an audience is idempotent.
create unique index if not exists form_assignments_all_uniq
  on public.form_assignments(form_id) where kind = 'all';
create unique index if not exists form_assignments_role_uniq
  on public.form_assignments(form_id, role) where kind = 'role';
create unique index if not exists form_assignments_class_uniq
  on public.form_assignments(form_id, class_id) where kind = 'class';
create unique index if not exists form_assignments_person_uniq
  on public.form_assignments(form_id, profile_id) where kind = 'person';

-- Forms that predate this migration went to every family, so they keep doing
-- that rather than silently vanishing from the parent portal.
insert into public.form_assignments (form_id, studio_id, kind)
select f.id, f.studio_id, 'all'
from public.student_forms f
where not exists (
  select 1 from public.form_assignments a where a.form_id = f.id
);

-- ─── 3. Signature evidence on form_responses ────────────────────────────────
--  `signature` (already present) holds the drawn PNG data URL or, for a typed
--  signature, the typed text. respondent_id is who actually signed —
--  student_id stays "who the form is about".

alter table public.form_responses
  add column if not exists respondent_id        uuid references public.profiles(id) on delete set null,
  add column if not exists signature_name       text,
  add column if not exists signature_type       text,
  add column if not exists signature_ip         text,
  add column if not exists signature_user_agent text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'form_responses_signature_type_check'
  ) then
    alter table public.form_responses
      add constraint form_responses_signature_type_check
      check (signature_type is null or signature_type in ('drawn', 'typed'));
  end if;
end $$;

update public.form_responses set respondent_id = parent_id where respondent_id is null;

create index if not exists form_responses_respondent_idx
  on public.form_responses(respondent_id);

-- ─── 4. Visibility helper ───────────────────────────────────────────────────
--  Definer so the audience check can read enrolments/guardianships that the
--  caller cannot select directly. auth.uid() is wrapped in a scalar subquery
--  (the initplan pattern from 0074) so it is evaluated once per statement.

create or replace function private.form_is_for_me(p_form uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.form_assignments a
    where a.form_id = p_form
      and (
        a.kind = 'all'
        or (a.kind = 'role' and a.role = private.current_user_role())
        -- A form aimed at students has to reach the guardians who sign for
        -- them, not just students with their own login.
        or (a.kind = 'role' and a.role = 'student' and exists (
              select 1 from public.guardianships g
              where g.guardian_id = (select auth.uid())
            ))
        or (a.kind = 'person' and (
              a.profile_id = (select auth.uid())
              or private.is_my_child(a.profile_id)
            ))
        or (a.kind = 'class' and exists (
              select 1 from public.enrollments e
              where e.class_id = a.class_id
                and e.status = 'active'
                and (e.student_id = (select auth.uid()) or private.is_my_child(e.student_id))
            ))
      )
  )
$$;

grant execute on function private.form_is_for_me(uuid) to authenticated, service_role;

-- ─── 5. RLS ─────────────────────────────────────────────────────────────────

alter table public.form_assignments enable row level security;

drop policy if exists "form_assignments_admin_all" on public.form_assignments;
create policy "form_assignments_admin_all" on public.form_assignments
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

-- Members read their own studio's assignment rows so the portal can work out
-- which of their children a class-targeted form actually applies to. The rows
-- carry ids only — no names, no content.
drop policy if exists "form_assignments_member_read" on public.form_assignments;
create policy "form_assignments_member_read" on public.form_assignments
  for select using (studio_id = private.current_studio());

-- Replaces the untenanted "forms_parent_read".
drop policy if exists "forms_parent_read" on public.student_forms;
drop policy if exists "forms_assigned_read" on public.student_forms;
create policy "forms_assigned_read" on public.student_forms
  for select using (
    active = true
    and published_at is not null
    and studio_id = private.current_studio()
    and private.form_is_for_me(id)
  );

-- Responses. The policy this replaces was `parent_id = auth.uid()` with no
-- check on the student, so any signed-in user could write a response against
-- any student in any studio by naming themselves as the parent. The
-- replacement below requires the subject to be the caller or one of their
-- children, and the row to be in the caller's studio.
drop policy if exists "form_responses_parent_rw" on public.form_responses;
drop policy if exists "form_responses_self_rw" on public.form_responses;
create policy "form_responses_self_rw" on public.form_responses
  for all using (
    studio_id = private.current_studio()
    and (
      student_id = (select auth.uid())
      or respondent_id = (select auth.uid())
      or private.is_my_child(student_id)
    )
  )
  with check (
    studio_id = private.current_studio()
    and respondent_id = (select auth.uid())
    and (
      student_id = (select auth.uid())
      or private.is_my_child(student_id)
    )
  );

grant select on public.form_assignments to authenticated;
grant insert, update, delete on public.form_assignments to authenticated;
