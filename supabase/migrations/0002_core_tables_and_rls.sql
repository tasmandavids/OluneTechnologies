-- ============================================================================
--  Olune · 0002_core_tables_and_rls
--  Phase 2 — Users (profiles), Classes, Enrollments, Invoices, the parent⇄child
--  link, and the Row-Level Security that scopes every row to ONE studio AND the
--  correct role.
--
--  Money is stored in integer cents. Times are local; dates are dates.
--  Safe to run on a fresh DB or on top of Phase 1 — every object is guarded
--  (do/exception, if not exists, create or replace, drop policy if exists).
-- ============================================================================

-- ─────────────────────────── enums ───────────────────────────
do $$ begin
  create type public.user_role as enum ('admin','teacher','parent','student');
exception when duplicate_object then null; end $$;

-- ─── studios (tenant root, from Phase 1 — minimal guard so this runs standalone) ───
create table if not exists public.studios (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null unique,
  status     text not null default 'trial',
  created_at timestamptz not null default now()
);

-- ============================================================================
--  USERS  →  public.profiles
--  The auth row lives in auth.users (Supabase-managed). This table is the one
--  you query, and the source of role + studio_id for every policy below.
-- ============================================================================
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  studio_id  uuid references public.studios(id) on delete cascade,
  role       public.user_role not null default 'parent',
  full_name  text,
  email      text,
  phone      text,
  created_at timestamptz not null default now()
);
-- 0001 may already have created profiles without email. CREATE TABLE IF NOT
-- EXISTS leaves that older shape untouched on a fresh migration replay.
alter table public.profiles add column if not exists email text;
create index if not exists profiles_studio_idx on public.profiles(studio_id);

-- ============================================================================
--  CLASSES
-- ============================================================================
create table if not exists public.classes (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id)  on delete cascade,
  teacher_id  uuid references public.profiles(id)          on delete set null,
  name        text not null,
  discipline  text,                                  -- Ballet, Jazz, Hip-Hop…
  level       text,
  day_of_week int  check (day_of_week between 0 and 6),
  start_time  time,
  end_time    time,
  capacity    int  not null default 20,
  price_cents int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists classes_studio_idx  on public.classes(studio_id);
create index if not exists classes_teacher_idx on public.classes(teacher_id);

-- ============================================================================
--  ENROLLMENTS  (students ⇄ classes, many-to-many)
-- ============================================================================
create table if not exists public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id)  on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  class_id    uuid not null references public.classes(id)  on delete cascade,
  status      text not null default 'active',        -- active | waitlisted | dropped
  enrolled_at timestamptz not null default now(),
  unique (student_id, class_id)
);
create index if not exists enrollments_studio_idx  on public.enrollments(studio_id);
create index if not exists enrollments_class_idx   on public.enrollments(class_id);
create index if not exists enrollments_student_idx on public.enrollments(student_id);

-- ============================================================================
--  GUARDIANSHIPS  (parent ⇄ student — REQUIRED so parent RLS has something to
--  check: "is this student one of my children?")
-- ============================================================================
create table if not exists public.guardianships (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id)  on delete cascade,
  guardian_id uuid not null references public.profiles(id) on delete cascade,  -- parent
  student_id  uuid not null references public.profiles(id) on delete cascade,  -- dancer
  is_primary  boolean not null default false,
  unique (guardian_id, student_id)
);
create index if not exists guardianships_guardian_idx on public.guardianships(guardian_id);
create index if not exists guardianships_student_idx  on public.guardianships(student_id);

-- ============================================================================
--  INVOICES  (billed to a parent/guardian; optionally for a specific dancer)
-- ============================================================================
create table if not exists public.invoices (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references public.studios(id)  on delete cascade,
  payer_id          uuid not null references public.profiles(id) on delete restrict,  -- parent
  student_id        uuid references public.profiles(id)          on delete set null,  -- dancer
  amount_cents      int  not null default 0,
  gst_cents         int  not null default 0,           -- 15% NZ GST
  status            text not null default 'draft',     -- draft|sent|paid|overdue|void
  due_date          date,
  stripe_invoice_id text,
  issued_at         timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists invoices_studio_idx on public.invoices(studio_id);
create index if not exists invoices_payer_idx  on public.invoices(payer_id);

-- ============================================================================
--  TENANT + ROLE HELPERS
--  SECURITY DEFINER so they read lookup tables WITHOUT tripping those tables'
--  own RLS — this is also what prevents a policy from recursing on itself.
-- ============================================================================
create or replace function public.current_studio()
returns uuid language sql stable security definer set search_path = public as $$
  select studio_id from public.profiles where id = auth.uid()
$$;

create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Is the given student one of the caller's children?
create or replace function public.is_my_child(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.guardianships
    where guardian_id = auth.uid() and student_id = p_student
  )
$$;

-- Does the caller teach the given class?
create or replace function public.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.classes where id = p_class and teacher_id = auth.uid()
  )
$$;

-- Does the caller teach the given student in any of their classes?
create or replace function public.teaches_student(p_student uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = p_student and c.teacher_id = auth.uid()
  )
$$;

-- ============================================================================
--  ENABLE RLS
-- ============================================================================
alter table public.profiles      enable row level security;
alter table public.classes       enable row level security;
alter table public.enrollments   enable row level security;
alter table public.guardianships enable row level security;
alter table public.invoices      enable row level security;

-- Table privileges: RLS gates ROWS, but the role still needs the verb. Supabase
-- usually pre-grants these; we state them so you never hit "permission denied".
grant select, insert, update, delete on
  public.profiles, public.classes, public.enrollments, public.guardianships, public.invoices
  to authenticated;

-- ============================================================================
--  POLICIES · PROFILES (Users)
--   • everyone: read + update OWN row
--   • admin:    full access within the studio
--   • teacher:  read profiles of students they teach
--   • parent:   read their own children
-- ============================================================================
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "profiles_admin_all" on public.profiles;
create policy "profiles_admin_all" on public.profiles
  for all using (studio_id = public.current_studio() and public.current_user_role() = 'admin')
          with check (studio_id = public.current_studio() and public.current_user_role() = 'admin');

drop policy if exists "profiles_teacher_read_students" on public.profiles;
create policy "profiles_teacher_read_students" on public.profiles
  for select using (
    studio_id = public.current_studio()
    and public.current_user_role() = 'teacher'
    and public.teaches_student(id)
  );

drop policy if exists "profiles_parent_read_children" on public.profiles;
create policy "profiles_parent_read_children" on public.profiles
  for select using (
    studio_id = public.current_studio()
    and public.current_user_role() = 'parent'
    and public.is_my_child(id)
  );

-- ── Guard against privilege escalation ──────────────────────────────────────
-- RLS can't compare OLD vs NEW, so a "read/update own row" policy would let a
-- user set their own role to 'admin'. This BEFORE trigger blocks that. It runs
-- SECURITY INVOKER, so end-user updates execute as the 'authenticated' role
-- (caught here) while trusted SECURITY DEFINER RPCs run as the table owner
-- (e.g. create_studio_for_user during onboarding) and pass straight through.
create or replace function public.guard_profile_privileges()
returns trigger language plpgsql as $$
begin
  if current_user = 'authenticated'
     and (new.role is distinct from old.role or new.studio_id is distinct from old.studio_id)
     and public.current_user_role() is distinct from 'admin'
  then
    raise exception 'Only admins may change role or studio_id (attempted by %).', auth.uid();
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_privileges on public.profiles;
create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ============================================================================
--  POLICIES · CLASSES
--   • any studio member: read (timetable / catalog)
--   • admin:   full access within the studio
--   • teacher: full access to their OWN classes
-- ============================================================================
drop policy if exists "classes_member_read" on public.classes;
create policy "classes_member_read" on public.classes
  for select using (studio_id = public.current_studio());

drop policy if exists "classes_admin_all" on public.classes;
create policy "classes_admin_all" on public.classes
  for all using (studio_id = public.current_studio() and public.current_user_role() = 'admin')
          with check (studio_id = public.current_studio() and public.current_user_role() = 'admin');

drop policy if exists "classes_teacher_own" on public.classes;
create policy "classes_teacher_own" on public.classes
  for all using (
    studio_id = public.current_studio()
    and public.current_user_role() = 'teacher'
    and teacher_id = auth.uid()
  ) with check (
    studio_id = public.current_studio()
    and public.current_user_role() = 'teacher'
    and teacher_id = auth.uid()
  );

-- ============================================================================
--  POLICIES · ENROLLMENTS
--   • student: read OWN enrollments
--   • parent:  read their children's enrollments
--   • teacher: read + manage the rosters of classes they teach
--   • admin:   full access within the studio
--  (Parent self-service enrolment is intentionally omitted; add a checked
--   INSERT policy [is_my_child(student_id)] when you wire capacity rules.)
-- ============================================================================
drop policy if exists "enroll_student_read_own" on public.enrollments;
create policy "enroll_student_read_own" on public.enrollments
  for select using (studio_id = public.current_studio() and student_id = auth.uid());

drop policy if exists "enroll_parent_read_child" on public.enrollments;
create policy "enroll_parent_read_child" on public.enrollments
  for select using (
    studio_id = public.current_studio()
    and public.current_user_role() = 'parent'
    and public.is_my_child(student_id)
  );

drop policy if exists "enroll_teacher_roster" on public.enrollments;
create policy "enroll_teacher_roster" on public.enrollments
  for all using (
    studio_id = public.current_studio()
    and public.current_user_role() = 'teacher'
    and public.teaches_class(class_id)
  ) with check (
    studio_id = public.current_studio()
    and public.current_user_role() = 'teacher'
    and public.teaches_class(class_id)
  );

drop policy if exists "enroll_admin_all" on public.enrollments;
create policy "enroll_admin_all" on public.enrollments
  for all using (studio_id = public.current_studio() and public.current_user_role() = 'admin')
          with check (studio_id = public.current_studio() and public.current_user_role() = 'admin');

-- ============================================================================
--  POLICIES · INVOICES  (billing is parent + admin only)
--   • parent: read invoices billed to them OR for one of their children
--   • admin:  full access within the studio
--   • teachers & students: NO access (no policy = denied)
-- ============================================================================
drop policy if exists "inv_parent_read" on public.invoices;
create policy "inv_parent_read" on public.invoices
  for select using (
    studio_id = public.current_studio()
    and public.current_user_role() = 'parent'
    and (payer_id = auth.uid() or public.is_my_child(student_id))
  );

drop policy if exists "inv_admin_all" on public.invoices;
create policy "inv_admin_all" on public.invoices
  for all using (studio_id = public.current_studio() and public.current_user_role() = 'admin')
          with check (studio_id = public.current_studio() and public.current_user_role() = 'admin');

-- ============================================================================
--  POLICIES · GUARDIANSHIPS
--   • parent / student: read links that involve them
--   • admin: manages the links within the studio
-- ============================================================================
drop policy if exists "guard_parent_read" on public.guardianships;
create policy "guard_parent_read" on public.guardianships
  for select using (studio_id = public.current_studio() and guardian_id = auth.uid());

drop policy if exists "guard_student_read" on public.guardianships;
create policy "guard_student_read" on public.guardianships
  for select using (studio_id = public.current_studio() and student_id = auth.uid());

drop policy if exists "guard_admin_all" on public.guardianships;
create policy "guard_admin_all" on public.guardianships
  for all using (studio_id = public.current_studio() and public.current_user_role() = 'admin')
          with check (studio_id = public.current_studio() and public.current_user_role() = 'admin');

-- ============================================================================
--  OPTIONAL (recommended for scale): put role + studio_id into the JWT so the
--  Next.js middleware can route WITHOUT a database round-trip per request.
--  Enable at: Dashboard → Authentication → Hooks → Custom Access Token.
--  The middleware reads these as the `user_role` / `studio_id` claims.
-- ============================================================================
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims   jsonb := event -> 'claims';
  v_role   public.user_role;
  v_studio uuid;
begin
  select role, studio_id into v_role, v_studio
  from public.profiles where id = (event ->> 'user_id')::uuid;

  if v_role   is not null then claims := jsonb_set(claims, '{user_role}', to_jsonb(v_role::text)); end if;
  if v_studio is not null then claims := jsonb_set(claims, '{studio_id}', to_jsonb(v_studio::text)); end if;

  return jsonb_set(event, '{claims}', claims);
end $$;

grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
