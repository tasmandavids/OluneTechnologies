-- ============================================================================
--  0118_staff_time_clock.sql
--
--  Staff hours: the largest single capability a competitor gives away free that
--  Olune had nothing for. Until now `staff_members.pay_notes` (0046) was a
--  free-text field and that was the entire payroll story.
--
--  Two tables and one column:
--
--    staff_time_entries — one row per worked stretch. Open while clock_out_at
--                         is null. Carries the hour type, location and
--                         department that a payroll export needs, plus the
--                         approval fields a manager signs off with.
--    staff_pay_rates    — effective-dated rate per staff member. Supersedes
--                         pay_notes as the source of truth; the notes field
--                         survives because studios keep real prose in it.
--    nfc_cards.card_kind — lets the existing door reader (0103) issue a card to
--                         a staff member, so clocking in is a tap on the same
--                         hardware students already use.
--
--  ── Why text + check rather than enums
--  0046 created staff_employment_type / staff_work_location as enums and adding
--  a value to either now needs its own migration. 0103 and 0110 established the
--  newer convention — text with a check constraint — because a studio asking
--  for a "training" hour type should be a constraint edit, not a type
--  rewrite. Following the newer convention.
--
--  ── The integrity guard that matters
--  `staff_time_entries_one_open_per_staff` is the whole reason this schema is
--  trustworthy. Double clock-in is the classic time-clock bug: a staff member
--  taps twice, or the portal button double-submits, and the timesheet shows two
--  overlapping open shifts that quietly double the hours. A partial unique
--  index makes that unrepresentable rather than something the application layer
--  has to remember to check on every path — and there are three paths here
--  (portal button, NFC tap, admin manual entry).
--
--  ── Money is admin-only, deliberately
--  staff_pay_rates is not readable by the staff member it describes. Hours are;
--  money is not. An "estimated gross pay" figure computed from a rate and raw
--  hours excludes overtime loading, tax and leave accrual — Jackrabbit ships
--  the same number and has to label it "estimated" for exactly this reason.
--  Showing it to the person being paid turns a planning aid into an apparent
--  promise about their wage. Studios that want staff to see their rate can tell
--  them; Olune shouldn't imply a payslip it isn't computing.
--
--  Idempotent & guarded — safe to re-run.
-- ============================================================================

-- ============================================================================
--  STAFF_TIME_ENTRIES
-- ============================================================================
create table if not exists public.staff_time_entries (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios(id)  on delete cascade,
  staff_id      uuid not null references public.profiles(id) on delete cascade,

  -- Studio-LOCAL calendar date, computed by the caller via
  -- lib/date/studio-date.ts. Stored rather than derived from clock_in_at
  -- because a shift that starts at 23:30 belongs to the day it started on for
  -- payroll purposes, and because deriving it in SQL would re-introduce the
  -- UTC-lag bug that studio-date.ts exists to prevent.
  entry_date    date        not null,
  clock_in_at   timestamptz not null,
  clock_out_at  timestamptz,          -- null = still on the clock

  hour_type     text not null default 'regular'
                  check (hour_type in ('regular', 'overtime', 'holiday', 'sick', 'vacation', 'unpaid')),
  source        text not null default 'portal'
                  check (source in ('portal', 'nfc', 'manual')),

  location_name text,
  department    text,
  note          text,

  approved_by   uuid references public.profiles(id) on delete set null,
  approved_at   timestamptz,

  -- Who created the row. Differs from staff_id when an admin adds a missed
  -- shift by hand, which is the audit question that gets asked.
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint staff_time_entries_out_after_in
    check (clock_out_at is null or clock_out_at > clock_in_at),

  -- Approval is one fact, not two half-set columns.
  constraint staff_time_entries_approval_paired
    check ((approved_by is null) = (approved_at is null)),

  -- An open shift cannot be approved — there are no hours to approve yet.
  constraint staff_time_entries_no_open_approval
    check (approved_at is null or clock_out_at is not null)
);

create index if not exists staff_time_entries_studio_date_idx
  on public.staff_time_entries(studio_id, entry_date desc);

create index if not exists staff_time_entries_staff_date_idx
  on public.staff_time_entries(staff_id, entry_date desc);

-- The approval queue's read: unapproved, closed entries for a studio.
create index if not exists staff_time_entries_pending_idx
  on public.staff_time_entries(studio_id, entry_date desc)
  where approved_at is null and clock_out_at is not null;

-- See header. One open shift per staff member, enforced by the database
-- because three separate code paths can open one.
create unique index if not exists staff_time_entries_one_open_per_staff
  on public.staff_time_entries(staff_id)
  where clock_out_at is null;

drop trigger if exists staff_time_entries_updated_at on public.staff_time_entries;
create trigger staff_time_entries_updated_at
  before update on public.staff_time_entries
  for each row execute function private.touch_updated_at();

-- ─── Guard: what a staff member may change on their own row ─────────────────
--  RLS can gate WHICH rows are updatable but not WHICH COLUMNS, and a policy's
--  `with check` cannot see the OLD row. Without this a teacher who can close
--  their own shift could also rewrite clock_in_at to three hours earlier, or
--  flip hour_type to 'overtime', or clear an approval. Same reasoning as the
--  orders_own fulfilment guard in 0115.
--
--  Admins bypass this entirely — correcting a mis-keyed timesheet is their job.
--
--  Deliberately NOT security definer: the `current_user` test below has to see
--  the caller's role, and inside a definer function it would see the owner's.
--  Same shape as private.guard_profile_privileges() in 0048.
create or replace function private.guard_staff_time_entry_update()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Triggers fire for every role, RLS does not. Our own server code writes
  -- here as service_role on two paths that have no auth.uid() at all — the
  -- door reader (lib/timeclock/nfc.ts) and the manager actions in
  -- app/portal/admin/staff/actions.ts — and every check below keys off
  -- auth.uid(). Applying them to service_role would reject a staff tap
  -- outright. Reaching service_role at all means passing through our own
  -- authorisation first; RLS is what keeps everyone else out.
  if current_user <> 'authenticated' then
    return new;
  end if;

  if private.is_studio_admin() then
    return new;
  end if;

  -- Once a manager has signed off, the row is a record, not a draft.
  if old.approved_at is not null then
    raise exception 'This timesheet entry has been approved and can no longer be edited.'
      using errcode = 'check_violation';
  end if;

  if new.approved_at is not null or new.approved_by is not null then
    raise exception 'Only a manager can approve a timesheet entry.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Everything except closing the shift and annotating it is immutable to the
  -- person the row is about.
  if new.staff_id    is distinct from old.staff_id
     or new.studio_id   is distinct from old.studio_id
     or new.entry_date  is distinct from old.entry_date
     or new.clock_in_at is distinct from old.clock_in_at
     or new.hour_type   is distinct from old.hour_type
     or new.source      is distinct from old.source
     or new.created_by  is distinct from old.created_by then
    raise exception 'You can only clock out of or annotate your own shift.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Closing an already-closed shift would silently extend paid hours.
  if old.clock_out_at is not null and new.clock_out_at is distinct from old.clock_out_at then
    raise exception 'This shift has already been closed.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists staff_time_entries_guard_update on public.staff_time_entries;
create trigger staff_time_entries_guard_update
  before update on public.staff_time_entries
  for each row execute function private.guard_staff_time_entry_update();

-- ─── Guard: what a staff member may insert ──────────────────────────────────
--  Mirrors the update guard for the clock-in path: a staff member opens their
--  own shift, now, unapproved. Backdating and hour-type selection are manager
--  actions.
--  Not security definer, and service_role exempt, for the same reasons as the
--  update guard above — this is the one the NFC reader actually trips.
create or replace function private.guard_staff_time_entry_insert()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  if private.is_studio_admin() then
    return new;
  end if;

  if new.staff_id is distinct from auth.uid() then
    raise exception 'You can only clock in as yourself.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.approved_at is not null or new.approved_by is not null then
    raise exception 'Only a manager can approve a timesheet entry.'
      using errcode = 'insufficient_privilege';
  end if;

  -- A self-serve clock-in is "now", within a tolerance for clock skew between
  -- the user's device and the database.
  if new.clock_in_at < now() - interval '5 minutes'
     or new.clock_in_at > now() + interval '5 minutes' then
    raise exception 'You can only clock in for the current time.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists staff_time_entries_guard_insert on public.staff_time_entries;
create trigger staff_time_entries_guard_insert
  before insert on public.staff_time_entries
  for each row execute function private.guard_staff_time_entry_insert();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.staff_time_entries enable row level security;

grant select, insert, update, delete on public.staff_time_entries to authenticated;

--  Admin/office: full lifecycle within their studio.
drop policy if exists "staff_time_entries_ops_all" on public.staff_time_entries;
create policy "staff_time_entries_ops_all" on public.staff_time_entries
  for all
  using (studio_id = private.current_studio() and private.is_studio_admin())
  with check (studio_id = private.current_studio() and private.is_studio_admin());

--  Staff: read their own timesheet.
drop policy if exists "staff_time_entries_self_read" on public.staff_time_entries;
create policy "staff_time_entries_self_read" on public.staff_time_entries
  for select using (staff_id = auth.uid());

--  Staff: clock in. Column-level restrictions live in the insert trigger.
drop policy if exists "staff_time_entries_self_insert" on public.staff_time_entries;
create policy "staff_time_entries_self_insert" on public.staff_time_entries
  for insert with check (
    staff_id = auth.uid()
    and studio_id = private.current_studio()
  );

--  Staff: clock out / annotate. Column-level restrictions live in the update
--  trigger; the policy only decides which rows are reachable at all.
drop policy if exists "staff_time_entries_self_update" on public.staff_time_entries;
create policy "staff_time_entries_self_update" on public.staff_time_entries
  for update
  using (staff_id = auth.uid() and approved_at is null)
  with check (staff_id = auth.uid());

-- ============================================================================
--  STAFF_PAY_RATES  (admin-only — see header)
-- ============================================================================
create table if not exists public.staff_pay_rates (
  id             uuid primary key default gen_random_uuid(),
  studio_id      uuid not null references public.studios(id)  on delete cascade,
  staff_id       uuid not null references public.profiles(id) on delete cascade,

  -- Effective-dated rather than a single mutable rate: a pay rise must not
  -- retroactively re-price timesheets that were already approved and paid.
  effective_from date not null,
  rate_cents     int  not null check (rate_cents >= 0),
  currency       text not null default 'NZD',

  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),

  -- One rate per staff member per start date, so "what were they on that day"
  -- has exactly one answer and a double-submitted form can't create a second.
  unique (staff_id, effective_from)
);

create index if not exists staff_pay_rates_staff_idx
  on public.staff_pay_rates(staff_id, effective_from desc);

create index if not exists staff_pay_rates_studio_idx
  on public.staff_pay_rates(studio_id);

drop trigger if exists staff_pay_rates_updated_at on public.staff_pay_rates;
create trigger staff_pay_rates_updated_at
  before update on public.staff_pay_rates
  for each row execute function private.touch_updated_at();

alter table public.staff_pay_rates enable row level security;

grant select, insert, update, delete on public.staff_pay_rates to authenticated;

--  Admin/office only, both directions. There is deliberately no self-read
--  policy: the staff member cannot read their own rate through the API.
drop policy if exists "staff_pay_rates_ops_all" on public.staff_pay_rates;
create policy "staff_pay_rates_ops_all" on public.staff_pay_rates
  for all
  using (studio_id = private.current_studio() and private.is_studio_admin())
  with check (studio_id = private.current_studio() and private.is_studio_admin());

-- ============================================================================
--  NFC_CARDS.CARD_KIND — staff cards on the existing reader
-- ============================================================================
--  0103 built card issuance and a door reader for students. A staff card is the
--  same object with a different consequence on tap: a student tap is a safety
--  register entry, a staff tap is that AND a clock event.
--
--  Defaulting to 'student' means every existing card keeps its current
--  behaviour with no backfill. The column name is `card_kind` rather than
--  `role` to avoid colliding with the user_role vocabulary — this is about what
--  the card does, not what the holder is.
--
--  Note that nfc_cards.student_id already references profiles(id), not a
--  students table, so a staff profile needs no schema change to hold a card.
--  The existing one-active-card-per-profile unique index applies unchanged.
alter table public.nfc_cards
  add column if not exists card_kind text not null default 'student';

alter table public.nfc_cards
  drop constraint if exists nfc_cards_card_kind_check;
alter table public.nfc_cards
  add constraint nfc_cards_card_kind_check
    check (card_kind in ('student', 'staff'));

comment on column public.nfc_cards.card_kind is
  'student = tap writes building_taps only. staff = tap also opens/closes a staff_time_entries row. See lib/checkin/tap.ts.';
