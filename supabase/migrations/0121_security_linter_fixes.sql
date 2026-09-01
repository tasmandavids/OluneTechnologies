-- ============================================================================
--  0121_security_linter_fixes.sql
--
--  Third pass at the Supabase database linter (after 0048 and 0075). Resolves:
--    0011 function_search_path_mutable                    (3 functions)
--    0025 public_bucket_allows_listing                    (social-media)
--    0028 anon_security_definer_function_executable       (16 functions)
--    0029 authenticated_security_definer_function_executable (18 functions)
--    0008 rls_enabled_no_policy                           (stripe_events)
--
--  ── Why this keeps coming back ───────────────────────────────────────────
--
--  Two separate bugs let 0048's and 0075's fixes rot:
--
--  1. Supabase ships `alter default privileges for role postgres in schema
--     public grant execute on functions to anon, authenticated, service_role`.
--     Every function a migration creates in `public` is therefore auto-granted
--     to anon and authenticated the moment it exists. 0048's one-time bulk
--     revoke fixed the functions that existed *then*; migrations 0049-0120
--     each re-opened the hole for anything new.
--
--  2. 0075 wrote `revoke execute on function f() from anon`. That is a no-op
--     when the access came from the implicit `GRANT ... TO PUBLIC` entry
--     (`=X/postgres` in proacl) — revoking from `anon` does not remove a grant
--     held by `PUBLIC`. Every revoke in 0075 silently did nothing.
--
--  So this migration moves what should never have been reachable into
--  `private`, and revokes from `public` (not just the two role names).
--
--  ⚠️  RULE FOR EVERY NEW FUNCTION IN `public` — there is no way to make the
--      database do this for you (see section 6). Any function a migration adds
--      is auto-granted to anon and authenticated the moment it exists, so every
--      migration must close it by hand:
--
--        -- a trigger/internal function: put it in `private`, like 0048 did
--        create function private.my_trigger_fn() returns trigger ...;
--
--        -- a genuine RPC: revoke the auto-grants, then grant what you meant
--        revoke all on function public.my_rpc(uuid) from public, anon, authenticated;
--        grant execute on function public.my_rpc(uuid) to authenticated;
--
--      `revoke ... from public` is the load-bearing clause — revoking from
--      `anon` alone is the no-op that made 0075 ineffective.
--
--      scripts/verify-function-grants.mjs enforces this in CI.
-- ============================================================================


-- ─── 1. RLS helpers → private (0011, 0028, 0029) ────────────────────────────
--
-- These two are called from RLS policy expressions, which are evaluated as the
-- querying role — so `authenticated` genuinely needs EXECUTE and revoking it
-- would break the 11 policies below. The fix is not to revoke but to move them
-- out of the PostgREST-exposed schema, exactly as 0048 did for current_studio()
-- and friends. Policy expressions reference functions by OID, so `set schema`
-- carries the policies along untouched — no policy rewrite needed.
--
--   act_belongs_to_admin    → event_act_cues / event_act_music /
--                             event_act_participants  (eac/eam/eap_admin_all)
--   is_self_managed_student → building_taps, class_passes (x2), enrollments,
--                             invoice_line_items, invoices (x2),
--                             waiver_signatures

do $$
begin
  if to_regprocedure('public.act_belongs_to_admin(uuid)') is not null then
    alter function public.act_belongs_to_admin(uuid) set schema private;
  end if;

  if to_regprocedure('public.is_self_managed_student()') is not null then
    alter function public.is_self_managed_student() set schema private;
  end if;
end;
$$;

-- act_belongs_to_admin had no search_path at all (lint 0011).
alter function private.act_belongs_to_admin(uuid) set search_path = public;

revoke all on function private.act_belongs_to_admin(uuid) from public;
revoke all on function private.is_self_managed_student() from public;
grant execute on function private.act_belongs_to_admin(uuid) to authenticated, service_role;
grant execute on function private.is_self_managed_student() to authenticated, service_role;


-- ─── 2. Trigger functions → private (0011, 0028, 0029) ──────────────────────
--
-- A trigger function is invoked by the trigger machinery, never over the API.
-- Leaving these in `public` published each one at /rest/v1/rpc/<name>, where
-- calling them directly is at best a no-op and at worst a way to run a SECURITY
-- DEFINER body with an attacker-chosen NEW/OLD. Triggers bind by OID, so
-- `set schema` keeps every existing trigger working with no re-CREATE.

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.assign_invoice_number()',
    'public.assign_contractor_invoice_number()',
    'public.guard_event_ticket_capacity()',
    'public.guard_order_fulfilment()',
    'public.network_message_after_insert()',
    -- No trigger references handle_deleted_user() any more (it was created by
    -- hand in the dashboard, per 0075). Moving rather than dropping keeps the
    -- body recoverable without leaving it callable over the API.
    'public.handle_deleted_user()'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s set schema private', fn);
    end if;
  end loop;
end;
$$;

-- network_message_after_insert had no search_path at all (lint 0011).
alter function private.network_message_after_insert() set search_path = public;

revoke all on function private.assign_invoice_number() from public;
revoke all on function private.assign_contractor_invoice_number() from public;
revoke all on function private.guard_event_ticket_capacity() from public;
revoke all on function private.guard_order_fulfilment() from public;
revoke all on function private.network_message_after_insert() from public;
revoke all on function private.handle_deleted_user() from public;


-- ─── 3. Drop the orphaned public.decrement_stock_on_order() ─────────────────
--
-- 0048 moved this to private and repointed the `order_paid_decrement_stock`
-- trigger there. 0095 then created a *second* copy in public. Nothing
-- references the public copy — the trigger still runs private's — so it is dead
-- code that only exists to be flagged by the linter.
--
-- ⚠️  The two bodies are NOT identical: 0095's public copy added an oversell
--     guard (raise on insufficient stock; decrement only where stock >= qty)
--     that has never actually run, because the trigger was never repointed.
--     Dropping the dead copy is the security fix and changes no behaviour.
--     Enabling that guard is a separate call — 0124 does it.

drop function if exists public.decrement_stock_on_order();


-- ─── 4. mark_inquiry_viewed: keep as an RPC, pin its search_path (0011) ─────
--
-- This one is a legitimate authenticated RPC (teacher network inbox), so it
-- stays in `public`. It only lacked search_path. Its own WHERE clause already
-- scopes the update to `instructor_id = auth.uid()`.

alter function public.mark_inquiry_viewed(uuid) set search_path = public;


-- ─── 5. Revoke EXECUTE from PUBLIC across the public schema (0028, 0029) ────
--
-- `from public` is the load-bearing word — see the header. service_role holds
-- its own explicit grant on every function and is unaffected.

revoke execute on all functions in schema public from public, anon, authenticated;

-- Re-grant only the RPCs the application actually calls, all of which run
-- behind an authenticated session. Verified against every `.rpc(` call site:
--   accept_studio_invite                  app/portal/teacher/affiliations/actions.ts
--   accept_/decline_private_lesson        app/portal/teacher/private-lessons/actions.ts
--   admin_record_installment_payment      app/portal/admin/payment-plans/actions.ts
--   create_studio_for_user                components/onboarding/OnboardingWizard.tsx
--   create_instructor_workspace_for_user  components/onboarding/OnboardingWizard.tsx
--   enroll_student_atomic                 app/portal/{admin/students,parent/enroll}/actions.ts
--   mark_inquiry_viewed                   app/portal/teacher/network/[id]/actions.ts
--   register_device_token                 app/api/devices/route.ts
--   register_studio_member                app/join/actions.ts
-- None of them is reachable as anon, so none is re-granted to anon.

grant execute on function public.accept_studio_invite(text) to authenticated;
grant execute on function public.accept_private_lesson(uuid, text) to authenticated;
grant execute on function public.decline_private_lesson(uuid, text) to authenticated;
grant execute on function public.admin_record_installment_payment(uuid, integer) to authenticated;
grant execute on function public.create_studio_for_user(text, text, text) to authenticated;
grant execute on function public.create_instructor_workspace_for_user(text, text, text) to authenticated;
grant execute on function public.enroll_student_atomic(uuid, uuid, uuid) to authenticated;
grant execute on function public.mark_inquiry_viewed(uuid) to authenticated;
grant execute on function public.register_device_token(text, text, text, text, uuid) to authenticated;
grant execute on function public.register_studio_member(text, public.user_role, boolean, date) to authenticated;

-- Legacy 2-arg overload, superseded by the 4-arg form in 0056 but still present.
do $$
begin
  if to_regprocedure('public.register_studio_member(text, public.user_role)') is not null then
    grant execute on function public.register_studio_member(text, public.user_role) to authenticated;
  end if;
end;
$$;

-- The Auth hook is called by GoTrue, not by a client role.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;


-- ─── 6. Why there is no default-privileges fix here ─────────────────────────
--
-- The obvious durable fix — teaching the database to stop auto-granting — does
-- not exist in PostgreSQL. `ALTER DEFAULT PRIVILEGES ... REVOKE EXECUTE ON
-- FUNCTIONS FROM PUBLIC` cannot make function defaults stricter than the
-- built-in default, which unconditionally grants EXECUTE to PUBLIC:
--
--   revoke from public, anon, authenticated
--       → new function gets  =X/postgres | postgres=X | service_role=X
--         (the `=X` PUBLIC grant comes back on its own)
--   revoke from public, anon, authenticated, service_role
--       → pg_default_acl row collapses to NULL, which *means* "built-in
--         default", so the new function is granted to PUBLIC again
--
-- Both were measured against this database before writing this comment.
--
-- So the guard lives in CI instead: scripts/verify-function-grants.mjs runs
-- after `supabase db push` on main and fails the build if a SECURITY DEFINER
-- function in `public` is executable by anon, or by authenticated without
-- being on the reviewed allowlist. That is what would have caught the drift
-- between 0048 and today, and it is the reason section 5 above lists the RPC
-- grants explicitly rather than relying on a blanket rule.


-- ─── 7. Public bucket listing (0025) ────────────────────────────────────────
--
-- `social-media` is a public bucket: object URLs are served by the public
-- storage endpoint, which does not consult RLS. A broad `SELECT ... USING
-- (bucket_id = 'social-media')` policy therefore buys nothing for reads, while
-- letting any client enumerate every object in the bucket across all studios.
--
-- 0048 removed the identical policy from the `site-images` bucket and public
-- image serving has worked ever since; this is the same change for the bucket
-- 0114 added. Uploads (social_media_admin_insert/update/delete) and the
-- service-role signed-URL path in app/portal/admin/advertising/actions.ts are
-- untouched.

drop policy if exists "social_media_public_read" on storage.objects;


-- ─── 8. stripe_events: match the grants to the intent (0008) ────────────────
--
-- RLS is enabled with zero policies, which is correct — this is the Stripe
-- webhook idempotency ledger and only the service role (which bypasses RLS)
-- should ever touch it. But anon and authenticated still hold SELECT/INSERT
-- table grants, so the table is protected by exactly one mechanism. Removing
-- the grants makes "nobody but service_role" true at both layers, so a future
-- permissive policy or an accidental `disable row level security` cannot
-- quietly expose the ledger.
--
-- studio_invoice_counters raises the same INFO lint but already has no anon or
-- authenticated grants, so there is nothing to revoke there.

revoke all on table public.stripe_events from anon, authenticated;

comment on table public.stripe_events is
  'Stripe webhook idempotency ledger. service_role only: RLS is enabled with no '
  'policies and anon/authenticated hold no grants. The rls_enabled_no_policy '
  'linter INFO is expected and intentional.';

comment on table public.studio_invoice_counters is
  'Per-studio invoice sequence. Written only by the assign_invoice_number '
  'trigger (private schema) under SECURITY DEFINER; no client role has grants. '
  'The rls_enabled_no_policy linter INFO is expected and intentional.';
