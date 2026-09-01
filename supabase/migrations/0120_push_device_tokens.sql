-- ============================================================================
--  0120_push_device_tokens.sql
--
--  Push notifications: the delivery channel the native parent app is built
--  around, and the only one Olune has never had. Until now lib/notify shipped
--  exactly two providers — Resend and Twilio — so an "app" whose alerting is
--  email is an app parents delete.
--
--  Nothing here is app-specific. The queue, the retry schedule (0117) and the
--  per-type routing all already exist; push slots in beside email and SMS as a
--  third channel, so this migration is four small pieces:
--
--    device_tokens                         — one row per signed-in app install.
--    notification_preferences.push_enabled — per-user, per-type opt-out.
--    notifications.push_sent_at            — mirrors email_sent_at / sms_sent_at.
--    register_device_token()               — the sign-in handover, atomically.
--
--  ── Why the token is unique, not the (user, token) pair
--  A push token identifies a physical device+install, not a person. Families
--  share iPads. If two parents sign in on the same device and both rows stay
--  live, parent A receives parent B's notifications — their children's names,
--  their invoices, their chat. That is a privacy incident, not a duplicate-row
--  annoyance, so it is made unrepresentable: a partial unique index over
--  `token` where the row is live. Signing in re-points the existing token at
--  the new user; the previous registration is revoked by the same write.
--
--  ── Why studio_id is not part of that identity
--  A parent with children at two studios is one profile, and delivery targets
--  `user_id` (see the cron — it resolves recipients per notification row, not
--  per tenant). Folding studio_id into the unique key would revoke the device
--  every time such a parent switched studio and silently stop their pushes.
--  It is kept as context — which studio the install last presented itself as,
--  which is what a per-studio white-label binary would need later — and
--  deliberately excluded from the key.
--
--  ── Why revoked_at rather than delete
--  Expo answers `DeviceNotRegistered` when an app is uninstalled. Pushing to a
--  dead token forever gets the whole project rate-limited, so the cron has to
--  act on that answer. Soft revocation keeps the reason, which is the
--  difference between "they uninstalled" and "we sent a malformed token" when
--  someone asks why a parent stopped getting alerts.
--
--  ── Why other users cannot read this table
--  A push token is close enough to a credential that studio admins have no
--  business reading it, and there is no feature that needs them to. RLS is
--  own-rows-only, the same shape as notification_preferences (0071).
--
--  Idempotent & guarded — safe to re-run.
-- ============================================================================

-- ============================================================================
--  DEVICE_TOKENS
-- ============================================================================
create table if not exists public.device_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,

  -- Context, not identity — see the header. Nullable because a token can be
  -- registered during sign-in before the studio has been chosen.
  studio_id   uuid references public.studios(id) on delete set null,

  -- Expo push token, e.g. ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]. Stored
  -- verbatim; the provider is the only thing that parses it.
  token       text not null,

  platform    text not null
                check (platform in ('ios', 'android')),

  -- Diagnostics. When a parent says "I stopped getting notifications", the
  -- first two questions are which device and which build.
  device_name text,
  app_version text,

  -- Bumped on every app foreground so a token that has gone quiet for months
  -- can be pruned without guessing.
  last_seen_at timestamptz not null default now(),

  revoked_at     timestamptz,
  revoked_reason text
                   check (revoked_reason in (
                     'device_not_registered',  -- Expo says the app is gone
                     'invalid_token',          -- Expo rejected the format
                     'signed_out',             -- the user signed out
                     'replaced'                -- another sign-in claimed the device
                   )),

  created_at  timestamptz not null default now()
);

-- One LIVE registration per physical device. This is the privacy guard
-- described in the header, not a tidiness constraint: the upsert path in the
-- app relies on it to hand the device over between accounts atomically.
create unique index if not exists device_tokens_live_token_uniq
  on public.device_tokens (token)
  where revoked_at is null;

-- The delivery cron's only lookup: live tokens for a batch of recipients.
create index if not exists device_tokens_user_live_idx
  on public.device_tokens (user_id)
  where revoked_at is null;

-- Pruning stale installs.
create index if not exists device_tokens_last_seen_idx
  on public.device_tokens (last_seen_at)
  where revoked_at is null;

alter table public.device_tokens enable row level security;

-- Own rows only. Service role bypasses RLS and is how the cron reads them.
drop policy if exists "device_tokens_own" on public.device_tokens;
create policy "device_tokens_own" on public.device_tokens
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.device_tokens to authenticated;

-- ─── Guard: a client may not forge its own revocation bookkeeping ───────────
--  The app writes here directly (register on launch, revoke on sign-out), so
--  the fields the delivery layer trusts have to be protected from the client
--  that owns the row. Re-pointing a token at a different user is a server
--  concern; so is claiming a row was revoked for a reason Expo never gave.
--
--  Deliberately NOT security definer, and service_role exempt, for the same
--  reasons as the 0118 guards: `current_user` must see the caller's role, and
--  the cron revokes dead tokens as service_role with no auth.uid() at all.
create or replace function private.guard_device_token_update()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;

  -- A device row belongs to the account that registered it. Handing it to
  -- another user is what the sign-in upsert does, and that runs server-side.
  if new.user_id is distinct from old.user_id then
    raise exception 'A device registration cannot be moved between accounts.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.token is distinct from old.token then
    raise exception 'A device registration cannot change its token — register a new one.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Un-revoking would resurrect a token Expo has already told us is dead.
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'A revoked device registration cannot be reinstated.'
      using errcode = 'check_violation';
  end if;

  -- The only reason a client can legitimately claim for itself.
  if new.revoked_at is not null
     and old.revoked_at is null
     and coalesce(new.revoked_reason, '') <> 'signed_out' then
    raise exception 'A device can only revoke itself on sign-out.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists device_tokens_guard_update on public.device_tokens;
create trigger device_tokens_guard_update
  before update on public.device_tokens
  for each row execute function private.guard_device_token_update();

-- ============================================================================
--  NOTIFICATION_PREFERENCES — push opt-out
-- ============================================================================
--  Defaults true to match email_enabled / sms_enabled (0071). The cron reads a
--  missing row as "on", so existing users need no backfill.
alter table public.notification_preferences
  add column if not exists push_enabled boolean not null default true;

-- ============================================================================
--  NOTIFICATIONS — push delivery stamp
-- ============================================================================
--  Mirrors email_sent_at / sms_sent_at from 0024. A row can succeed on one
--  channel and fail on another, so each channel keeps its own stamp and the
--  shared delivery_error carries the failures.
alter table public.notifications
  add column if not exists push_sent_at timestamptz;

-- ============================================================================
--  REGISTER_DEVICE_TOKEN — the sign-in handover, done atomically
-- ============================================================================
--  Claiming a device is two writes: retire whoever held this token before, then
--  take it. Doing that from the application layer is a read-modify-write over a
--  unique index — two app launches racing produce a 23505 that the caller then
--  has to interpret. In one function it is one transaction and cannot half-
--  apply, which matters because the failure mode is a parent whose device is
--  registered to nobody.
--
--  SECURITY DEFINER for exactly one reason: the retire step touches a row
--  belonging to a *different* user, which the own-rows-only RLS policy forbids
--  and the update guard blocks. The function never takes a user id — it always
--  writes auth.uid() — so it cannot be used to register a device to anyone but
--  the caller.
create or replace function public.register_device_token(
  p_token       text,
  p_platform    text,
  p_device_name text default null,
  p_app_version text default null,
  p_studio_id   uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'Not signed in.' using errcode = 'insufficient_privilege';
  end if;

  if p_platform is null or p_platform not in ('ios', 'android') then
    raise exception 'Unsupported platform.' using errcode = 'check_violation';
  end if;

  if coalesce(btrim(p_token), '') = '' then
    raise exception 'Missing device token.' using errcode = 'check_violation';
  end if;

  -- Hand the device over. A shared iPad that parent B signs in on must stop
  -- delivering parent A's notifications in the same breath, not on some later
  -- cleanup pass.
  update public.device_tokens
     set revoked_at     = now(),
         revoked_reason = 'replaced'
   where token      = p_token
     and revoked_at is null
     and user_id   <> v_user;

  -- Then claim it, or refresh the registration we already hold. Conflict is
  -- inferred against the partial unique index above, so only a LIVE row
  -- collides — a revoked one stays as history.
  insert into public.device_tokens as dt
    (user_id, studio_id, token, platform, device_name, app_version)
  values
    (v_user, p_studio_id, btrim(p_token), p_platform, p_device_name, p_app_version)
  on conflict (token) where (revoked_at is null)
  do update set
    -- coalesce so a launch that omits an optional field doesn't erase what an
    -- earlier one recorded.
    studio_id    = coalesce(excluded.studio_id,   dt.studio_id),
    platform     = excluded.platform,
    device_name  = coalesce(excluded.device_name, dt.device_name),
    app_version  = coalesce(excluded.app_version, dt.app_version),
    last_seen_at = now()
  returning dt.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.register_device_token(text, text, text, text, uuid) from public;
grant execute on function public.register_device_token(text, text, text, text, uuid) to authenticated;
