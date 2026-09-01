-- ============================================================================
--  0120_audit_events.sql
--
--  A tenant-scoped audit trail. SOC2-02 in docs/SOC2_READINESS.md.
--
--  platform_audit_log (0026) records what an Olune operator does in /platform.
--  Nothing has ever recorded what happens inside a studio: an admin reading or
--  exporting a student's record, changing someone's role, deleting a family,
--  issuing a refund, connecting an integration. For a platform holding minors'
--  names, addresses, photos, medical notes and guardian payment details, that
--  is the log an auditor asks for first (TSC CC7.2), and the one a studio asks
--  for when a parent asks who looked at their child's file.
--
--  ── Why a second table rather than widening platform_audit_log
--  Different tenancy and different readership. platform_audit_log has no
--  studio_id and is readable only by operators; this is per-studio and readable
--  by that studio's own admins. Merging them would mean a policy that has to
--  distinguish the two cases on every row, and one careless `or` away from
--  showing one studio Olune's cross-tenant operator history.
--
--  ── Append-only, and what that is worth
--  update and delete are revoked from every API role including service_role,
--  so the write path can add rows and nothing short of a direct superuser
--  connection can alter them. This is the difference between "we keep a log"
--  and evidence: an auditor's question is not whether entries exist but whether
--  they could have been edited afterwards.
--
--  Retention is deliberately not enforced here. SOC 2 wants at least the
--  observation window (3 months) and normally a year; a purge job that trims
--  the table is itself a deletion path into an append-only table, so it belongs
--  in a later migration with its own justification, not smuggled in here.
--
--  ── Writes are server-side only
--  No insert policy exists for `authenticated`. Rows come from the service-role
--  client in lib/audit/log.ts, called from server actions that have already
--  established who the actor is — the same shape as lib/platform/audit.ts. A
--  client cannot write its own audit trail, so an actor cannot be forged.
--
--  Idempotent & guarded — safe to re-run.
-- ============================================================================

create table if not exists public.audit_events (
  id          uuid primary key default gen_random_uuid(),

  -- Null only for events with no tenant yet (a sign-in before a studio is
  -- resolved). Every studio-scoped action carries one.
  studio_id   uuid references public.studios(id) on delete cascade,

  -- set null, not cascade: a deleted user must not erase the record of what
  -- they did. actor_email keeps the row legible once the reference is gone.
  actor_id    uuid references auth.users(id) on delete set null,
  actor_email text,
  actor_role  text,

  -- Dotted, past tense: 'student.deleted', 'member.role_changed'.
  -- lib/audit/events.ts is the catalogue; a check constraint here would mean a
  -- migration every time an action is added, which is how logging stops
  -- getting added.
  action      text not null,

  target_type text,
  target_id   text,

  -- Never the record itself. Ids, counts, and before/after of the field that
  -- changed — enough to answer "what happened" without turning the audit trail
  -- into a second copy of the data it is auditing.
  metadata    jsonb not null default '{}'::jsonb,

  created_at  timestamptz not null default now()
);

-- The three questions asked of this table: what happened in my studio lately,
-- what did this person do, and what touched this record.
create index if not exists audit_events_studio_created_idx
  on public.audit_events (studio_id, created_at desc);
create index if not exists audit_events_actor_created_idx
  on public.audit_events (actor_id, created_at desc);
create index if not exists audit_events_target_idx
  on public.audit_events (target_type, target_id);

alter table public.audit_events enable row level security;

-- ─── Read: a studio's own admins, and Olune operators ────────────────────────
--  Deliberately not teachers or parents. A studio admin seeing who opened a
--  student record is oversight; a parent seeing staff movements is not, and the
--  parent-facing version of this is a different, narrower feature.
drop policy if exists "audit_events_studio_admin_read" on public.audit_events;
create policy "audit_events_studio_admin_read" on public.audit_events
  for select using (
    studio_id = private.current_studio()
    and private.is_studio_admin()
  );

drop policy if exists "audit_events_operator_read" on public.audit_events;
create policy "audit_events_operator_read" on public.audit_events
  for select using (private.is_platform_operator());

-- ─── Append-only ─────────────────────────────────────────────────────────────
--  No insert grant for authenticated: writes come from the service-role client
--  only. service_role bypasses RLS but not table grants, so revoking update and
--  delete from it is what actually makes the table immutable through the API.
revoke update, delete on public.audit_events from anon, authenticated, service_role;
revoke insert on public.audit_events from anon, authenticated;

grant select on public.audit_events to authenticated;
grant select, insert on public.audit_events to service_role;

comment on table public.audit_events is
  'Tenant-scoped audit trail (SOC2-02). Append-only: update/delete revoked from all API roles. Written server-side via lib/audit/log.ts.';
