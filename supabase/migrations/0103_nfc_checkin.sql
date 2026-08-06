-- ============================================================================
--  0103 — NFC card issuance + building safety check-in
--
--  Two tables:
--    nfc_cards     — the physical card record. Staff issue one deliberately
--                    (not auto-generated) when they choose to; a card is
--                    `pending` while the tag is being written via Web NFC on
--                    the issuing staff member's phone, then `active` once the
--                    write is confirmed. `frozen`/`lost`/`revoked` are staff
--                    lifecycle actions (a lost/frozen card doesn't block
--                    issuing a replacement — only one pending/active card is
--                    allowed per student at a time).
--    building_taps — an append-only log of tap-in/tap-out events. Deliberately
--                    separate from public.attendance (0003), which is
--                    class/roll-call-scoped; this is building-wide and purely
--                    a safety register of who is on the premises.
--
--  Card-linked class passes and door-lock hardware integration are explicitly
--  OUT OF SCOPE here — nfc_cards.id is a stable FK target either would hook
--  into later without touching this migration.
--
--  Reader devices (the kiosk/USB reader at the door) authenticate against a
--  per-studio shared secret stored as a public.studio_integrations row
--  (provider = 'nfc_reader', see lib/checkin/reader-credential.ts) rather than
--  a new table — one secret per studio for v1; multi-entrance studios can't
--  yet revoke a single kiosk independently of the others without rotating the
--  shared secret. A future nfc_readers table would be the place to fix that.
--
--  RLS uses the private.* SECURITY DEFINER helpers established in 0048/0053
--  (current_studio, current_user_role, is_studio_admin, is_my_child) plus
--  public.is_self_managed_student() (0056) — the current standing convention,
--  per 0091_class_passes.sql / 0088_badges.sql.
--
--  Idempotent & guarded — safe to re-run.
-- ============================================================================

-- ============================================================================
--  NFC_CARDS
-- ============================================================================
create table if not exists public.nfc_cards (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id)  on delete cascade,
  student_id  uuid not null references public.profiles(id) on delete cascade,
  token       uuid not null default gen_random_uuid(), -- opaque value written to the tag; looked up on tap, never the row id
  status      text not null default 'pending'
                check (status in ('pending', 'active', 'frozen', 'lost', 'revoked')),
  issued_by   uuid references public.profiles(id) on delete set null,
  issued_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists nfc_cards_studio_idx  on public.nfc_cards(studio_id);
create index if not exists nfc_cards_student_idx on public.nfc_cards(student_id);
create unique index if not exists nfc_cards_token_idx on public.nfc_cards(token);

-- One live-or-being-written card per student at a time; a frozen/lost/revoked
-- card frees this up so a replacement can be issued.
create unique index if not exists nfc_cards_one_active_per_student
  on public.nfc_cards(student_id)
  where status in ('pending', 'active');

drop trigger if exists nfc_cards_updated_at on public.nfc_cards;
create trigger nfc_cards_updated_at
  before update on public.nfc_cards
  for each row execute function private.touch_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.nfc_cards enable row level security;

grant select, insert, update, delete on public.nfc_cards to authenticated;

-- Admin/office (front desk): full lifecycle within their studio.
drop policy if exists "nfc_cards_ops_all" on public.nfc_cards;
create policy "nfc_cards_ops_all" on public.nfc_cards
  for all
  using (studio_id = private.current_studio() and private.is_studio_admin())
  with check (studio_id = private.current_studio() and private.is_studio_admin());

-- Parents: read their children's card status.
drop policy if exists "nfc_cards_parent_read" on public.nfc_cards;
create policy "nfc_cards_parent_read" on public.nfc_cards
  for select using (private.is_my_child(student_id));

-- Self-managed adult students: read their own card status.
drop policy if exists "nfc_cards_self_read" on public.nfc_cards;
create policy "nfc_cards_self_read" on public.nfc_cards
  for select using (student_id = auth.uid() and public.is_self_managed_student());

-- ============================================================================
--  BUILDING_TAPS  (append-only; every insert goes through the service-role
--  tap endpoint, never a client-authenticated write — no insert policy here)
-- ============================================================================
create table if not exists public.building_taps (
  id          uuid primary key default gen_random_uuid(),
  studio_id   uuid not null references public.studios(id)    on delete cascade,
  card_id     uuid not null references public.nfc_cards(id)  on delete cascade,
  student_id  uuid not null references public.profiles(id)   on delete cascade, -- denormalized: survives the card being revoked later, keeps RLS simple
  direction   text not null check (direction in ('in', 'out')),
  reader_key  text, -- studio_integrations.external_account_id of the reader that posted this, for audit
  tapped_at   timestamptz not null default now()
);

create index if not exists building_taps_studio_time_idx  on public.building_taps(studio_id, tapped_at desc);
create index if not exists building_taps_student_time_idx on public.building_taps(student_id, tapped_at desc);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.building_taps enable row level security;

-- Read-only grant: writes happen exclusively via the service-role client
-- (lib/checkin/tap.ts), which bypasses RLS entirely — no client role ever
-- gets an insert/update/delete grant on this table.
grant select on public.building_taps to authenticated;

drop policy if exists "building_taps_ops_read" on public.building_taps;
create policy "building_taps_ops_read" on public.building_taps
  for select using (studio_id = private.current_studio() and private.is_studio_admin());

drop policy if exists "building_taps_parent_read" on public.building_taps;
create policy "building_taps_parent_read" on public.building_taps
  for select using (private.is_my_child(student_id));

drop policy if exists "building_taps_self_read" on public.building_taps;
create policy "building_taps_self_read" on public.building_taps
  for select using (student_id = auth.uid() and public.is_self_managed_student());

-- ============================================================================
--  Notify guardians when their student taps in/out (in-app only — see
--  lib/notify/messages.ts channelsForType, "checkin_tap" is not an outbound
--  email/SMS type). Self-managed adult students have no guardianship row, so
--  they correctly get no "you checked yourself in" notification.
-- ============================================================================
create or replace function private.notify_building_tap()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_student_name text;
  v_title         text;
  v_body          text;
begin
  select full_name into v_student_name from public.profiles where id = new.student_id;

  v_title := case when new.direction = 'in' then 'Checked in' else 'Checked out' end;
  v_body  := coalesce(v_student_name, 'Your dancer')
    || case when new.direction = 'in' then ' has checked in.' else ' has checked out.' end;

  insert into public.notifications (studio_id, user_id, type, title, body, link, payload)
  select new.studio_id, g.guardian_id, 'checkin_tap', v_title, v_body, '/portal/parent',
         jsonb_build_object('student_id', new.student_id, 'direction', new.direction, 'tapped_at', new.tapped_at)
  from public.guardianships g
  where g.student_id = new.student_id;

  return new;
end;
$$;

drop trigger if exists building_taps_notify on public.building_taps;
create trigger building_taps_notify
  after insert on public.building_taps
  for each row execute function private.notify_building_tap();
