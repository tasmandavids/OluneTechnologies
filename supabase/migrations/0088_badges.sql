-- ============================================================================
--  0088 — Achievement badges + XP / levels
--
--  A ballet "achievement system": a catalogue of badges (global seed + studio
--  custom), each granting XP, awarded manually by teachers/admins to students
--  (and parents, for Family badges). XP rolls up into a level ladder that the
--  student & parent portals surface as a growth journey.
--
--  v1 is MANUAL award only. Auto-award (attendance streaks, class-count clubs)
--  is intentionally left to a follow-up — the schema already supports a system
--  actor via a nullable awarded_by.
--
--  RLS uses the private.* SECURITY DEFINER helpers established in 0048/0053/0085
--  (current_studio, current_user_role, teaches_student, is_my_child). Global
--  catalogue rows (studio_id is null) are managed by the platform via the
--  service-role admin client, which bypasses RLS.
--
--  Idempotent & guarded — safe to re-run.
-- ============================================================================

-- ─── enums ────────────────────────────────────────────────────────────────
do $$ begin
  create type public.badge_tier as enum ('bronze','silver','gold','diamond');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.badge_recipient_type as enum ('student','parent');
exception when duplicate_object then null; end $$;

-- ============================================================================
--  BADGE DEFINITIONS  (the catalogue)
--  studio_id IS NULL  → global seeded badge (shared by every studio)
--  studio_id = <uuid> → studio-custom badge
-- ============================================================================
create table if not exists public.badge_definitions (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid references public.studios(id) on delete cascade,   -- null = global
  key            text not null,                                          -- stable slug
  category       text not null,                                          -- founder|beginner|commitment|technique|level|performance|character|mentor|community|secret|family
  name           text not null,
  description    text,
  icon           text,                                                   -- emoji
  tier           public.badge_tier not null default 'bronze',
  xp             int  not null default 0 check (xp >= 0),
  is_secret      boolean not null default false,
  recipient_type public.badge_recipient_type not null default 'student',
  is_active      boolean not null default true,
  sort           int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One catalogue key per scope: global keys unique among globals; studio keys
-- unique within that studio. Two partial unique indexes since studio_id is
-- nullable and NULLs don't collide in a normal unique index.
create unique index if not exists badge_definitions_global_key_idx
  on public.badge_definitions(key) where studio_id is null;
create unique index if not exists badge_definitions_studio_key_idx
  on public.badge_definitions(studio_id, key) where studio_id is not null;

create index if not exists badge_definitions_studio_idx
  on public.badge_definitions(studio_id);
create index if not exists badge_definitions_category_idx
  on public.badge_definitions(category);

drop trigger if exists badge_definitions_updated_at on public.badge_definitions;
create trigger badge_definitions_updated_at
  before update on public.badge_definitions
  for each row execute function private.touch_updated_at();

-- ============================================================================
--  STUDIO BADGE VISIBILITY  (per-studio hide of a global badge)
--  A row here means the studio has chosen to hide that (global) badge.
-- ============================================================================
create table if not exists public.studio_badge_visibility (
  studio_id  uuid not null references public.studios(id) on delete cascade,
  badge_id   uuid not null references public.badge_definitions(id) on delete cascade,
  hidden     boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (studio_id, badge_id)
);

-- ============================================================================
--  PROFILE BADGES  (awards)
--  recipient_id is a profile so Family badges can be awarded to parents.
--  awarded_by is nullable so a future system/auto-award actor can insert.
-- ============================================================================
create table if not exists public.profile_badges (
  id           uuid primary key default gen_random_uuid(),
  studio_id    uuid not null references public.studios(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  badge_id     uuid not null references public.badge_definitions(id) on delete cascade,
  awarded_by   uuid references public.profiles(id) on delete set null,
  note         text,
  awarded_at   timestamptz not null default now(),
  unique (recipient_id, badge_id)
);
create index if not exists profile_badges_recipient_idx
  on public.profile_badges(recipient_id, awarded_at desc);
create index if not exists profile_badges_studio_idx
  on public.profile_badges(studio_id);
create index if not exists profile_badges_badge_idx
  on public.profile_badges(badge_id);

-- ============================================================================
--  XP LEVELS  (global ladder — seeded in 0089)
-- ============================================================================
create table if not exists public.xp_levels (
  level   int primary key,
  name    text not null,
  icon    text,
  min_xp  int  not null,
  max_xp  int             -- null = top level (open-ended)
);

-- ============================================================================
--  STUDENT XP  (derived: sum of XP over student-type badges earned)
--  SECURITY INVOKER view → RLS on profile_badges/badge_definitions still applies
--  to whoever queries it, so a caller only sees XP for recipients they may read.
-- ============================================================================
create or replace view public.student_xp
with (security_invoker = true) as
  select pb.recipient_id,
         coalesce(sum(bd.xp), 0)::int as total_xp,
         count(*)::int               as badge_count
  from public.profile_badges pb
  join public.badge_definitions bd on bd.id = pb.badge_id
  where bd.recipient_type = 'student'
  group by pb.recipient_id;

-- ============================================================================
--  RLS
-- ============================================================================
alter table public.badge_definitions       enable row level security;
alter table public.studio_badge_visibility enable row level security;
alter table public.profile_badges          enable row level security;
alter table public.xp_levels               enable row level security;

grant select, insert, update, delete on public.badge_definitions       to authenticated;
grant select, insert, update, delete on public.studio_badge_visibility  to authenticated;
grant select, insert, update, delete on public.profile_badges           to authenticated;
grant select on public.xp_levels  to authenticated;
grant select on public.student_xp to authenticated;

-- ─── badge_definitions ──────────────────────────────────────────────────────
-- Everyone in a studio can read global badges + their own studio's custom ones.
drop policy if exists "badge_defs_read" on public.badge_definitions;
create policy "badge_defs_read" on public.badge_definitions
  for select using (
    studio_id is null
    or studio_id = private.current_studio()
  );

-- Studio admins manage their OWN custom badges only (global rows are platform-managed).
drop policy if exists "badge_defs_admin_write" on public.badge_definitions;
create policy "badge_defs_admin_write" on public.badge_definitions
  for all
  using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

-- ─── studio_badge_visibility ────────────────────────────────────────────────
drop policy if exists "badge_vis_read" on public.studio_badge_visibility;
create policy "badge_vis_read" on public.studio_badge_visibility
  for select using (studio_id = private.current_studio());

drop policy if exists "badge_vis_admin_write" on public.studio_badge_visibility;
create policy "badge_vis_admin_write" on public.studio_badge_visibility
  for all
  using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

-- ─── profile_badges ─────────────────────────────────────────────────────────
-- Read: the recipient; their guardians; teachers who teach them; studio admins.
drop policy if exists "profile_badges_read" on public.profile_badges;
create policy "profile_badges_read" on public.profile_badges
  for select using (
    recipient_id = auth.uid()
    or private.is_my_child(recipient_id)
    or private.teaches_student(recipient_id)
    or (
      studio_id = private.current_studio()
      and private.current_user_role() = 'admin'
    )
  );

-- Award: teachers for students they teach; admins for anyone in their studio.
drop policy if exists "profile_badges_teacher_write" on public.profile_badges;
create policy "profile_badges_teacher_write" on public.profile_badges
  for insert with check (
    studio_id = private.current_studio()
    and awarded_by = auth.uid()
    and private.teaches_student(recipient_id)
  );

drop policy if exists "profile_badges_teacher_delete" on public.profile_badges;
create policy "profile_badges_teacher_delete" on public.profile_badges
  for delete using (
    studio_id = private.current_studio()
    and private.teaches_student(recipient_id)
  );

drop policy if exists "profile_badges_admin_all" on public.profile_badges;
create policy "profile_badges_admin_all" on public.profile_badges
  for all
  using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

-- ─── xp_levels (global read) ────────────────────────────────────────────────
drop policy if exists "xp_levels_read" on public.xp_levels;
create policy "xp_levels_read" on public.xp_levels
  for select using (true);

-- ============================================================================
--  Notify recipient + guardians when a badge is awarded
-- ============================================================================
create or replace function private.notify_badge_awarded()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_badge   public.badge_definitions;
  v_role    public.user_role;
  v_link    text;
  v_title   text;
  v_body    text;
begin
  select * into v_badge from public.badge_definitions where id = new.badge_id;
  if v_badge.id is null then return new; end if;

  select role into v_role from public.profiles where id = new.recipient_id;
  v_link := case when v_role = 'parent' then '/portal/parent' else '/portal/student/progress' end;

  v_title := coalesce(v_badge.icon, '🏅') || ' New badge earned';
  v_body  := coalesce(v_badge.name, 'Achievement')
    || case when v_badge.description is not null then ' · ' || v_badge.description else '' end;

  -- The recipient.
  insert into public.notifications (studio_id, user_id, type, title, body, link, payload)
  values (
    new.studio_id, new.recipient_id, 'badge_awarded', v_title, v_body, v_link,
    jsonb_build_object('badge_id', v_badge.id, 'badge_name', v_badge.name, 'icon', v_badge.icon, 'tier', v_badge.tier)
  );

  -- Each guardian of the recipient (no-op when the recipient is a parent).
  insert into public.notifications (studio_id, user_id, type, title, body, link, payload)
  select new.studio_id, g.guardian_id, 'badge_awarded', v_title,
         coalesce((select full_name from public.profiles where id = new.recipient_id), 'Your dancer')
           || ' earned ' || coalesce(v_badge.name, 'a badge'),
         '/portal/parent/children/' || new.recipient_id,
         jsonb_build_object('badge_id', v_badge.id, 'badge_name', v_badge.name, 'icon', v_badge.icon, 'tier', v_badge.tier)
  from public.guardianships g
  where g.student_id = new.recipient_id;

  return new;
end;
$$;

drop trigger if exists profile_badges_notify on public.profile_badges;
create trigger profile_badges_notify
  after insert on public.profile_badges
  for each row execute function private.notify_badge_awarded();
