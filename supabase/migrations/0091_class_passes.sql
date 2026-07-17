-- ============================================================================
--  0091 — $25 single adult ballet class pass
--
--  A generic, single-use drop-in pass: an existing self-managed adult student
--  buys one from their own portal (not tied to a class/date at purchase time),
--  gets a QR code, and shows it at the studio. An admin scans it and picks the
--  class occurrence it's being redeemed against; the pass is marked redeemed
--  (one-time use) and an attendance row is recorded for that occurrence.
--
--  Modeled on public.event_tickets (status lifecycle + QR) and public.attendance
--  (the redemption target — an "occurrence" is just class_id + date, exactly
--  like attendance already models it; no new class_occurrences table needed).
--
--  RLS uses the private.* SECURITY DEFINER helpers established in 0048/0053
--  (current_studio, current_user_role) — the current standing convention.
--
--  Idempotent & guarded — safe to re-run.
-- ============================================================================

create table if not exists public.class_passes (
  id                       uuid primary key default gen_random_uuid(),
  studio_id                uuid not null references public.studios(id)  on delete cascade,
  student_id               uuid not null references public.profiles(id) on delete cascade,
  price_cents              int  not null default 2500,
  currency                 text not null default 'nzd',
  qr_code                  text,              -- base64 PNG data URL, same convention as event_tickets.qr_code
  qr_token                 uuid not null default gen_random_uuid(), -- opaque redemption token looked up on redeem — not the row id, so a leaked screenshot can't be replayed after a future "regenerate QR" rotation
  stripe_payment_intent_id text,
  status                   text not null default 'reserved'
                             check (status in ('reserved', 'paid', 'redeemed', 'cancelled', 'refunded')),
  redeemed_at              timestamptz,
  redeemed_class_id        uuid references public.classes(id) on delete set null,
  redeemed_date            date,
  redeemed_by              uuid references public.profiles(id) on delete set null,
  purchased_at             timestamptz not null default now(),
  refunded_at              timestamptz,
  refund_amount_cents      int,
  stripe_refund_id         text
);

create index if not exists class_passes_studio_idx  on public.class_passes(studio_id);
create index if not exists class_passes_student_idx on public.class_passes(student_id);
create unique index if not exists class_passes_qr_token_idx on public.class_passes(qr_token);
create index if not exists class_passes_redeemed_class_idx on public.class_passes(redeemed_class_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.class_passes enable row level security;

grant select, insert, update on public.class_passes to authenticated;

-- Self-managed adult student: read + insert their own pass rows.
drop policy if exists "class_passes_student_read_own" on public.class_passes;
create policy "class_passes_student_read_own" on public.class_passes
  for select using (student_id = auth.uid());

drop policy if exists "class_passes_student_insert_own" on public.class_passes;
create policy "class_passes_student_insert_own" on public.class_passes
  for insert with check (
    studio_id = private.current_studio()
    and student_id = auth.uid()
    and public.is_self_managed_student()
  );

-- Admins: full access within their studio (redemption is admin-only, per product decision).
drop policy if exists "class_passes_admin_all" on public.class_passes;
create policy "class_passes_admin_all" on public.class_passes
  for all
  using (studio_id = private.current_studio() and private.current_user_role() = 'admin')
  with check (studio_id = private.current_studio() and private.current_user_role() = 'admin');
