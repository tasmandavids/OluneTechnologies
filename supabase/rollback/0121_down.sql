-- ============================================================================
--  ROLLBACK for 0121_security_linter_fixes
--
--  ⚠️  MANUAL USE ONLY. This lives outside supabase/migrations/ deliberately —
--      the CLI must never pick it up and run it forward.
--
--  Returns the database to its 0120 state: functions back in `public`, the
--  broad grants restored, the social-media read policy recreated, and the
--  Supabase default privileges put back. Running this re-introduces every
--  linter warning 0121 resolved — that is the point of a rollback, not a bug.
--
--  NOT restored: public.decrement_stock_on_order(), dropped by 0121 as dead
--  code. Nothing referenced it (the order_paid_decrement_stock trigger runs
--  private.decrement_stock_on_order), so its absence changes no behaviour. Its
--  body is in 0095 if you want it back.
--
--  Safe to run more than once.
-- ============================================================================

begin;

-- ─── 6. Restore Supabase's stock default privileges ─────────────────────────

alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;

-- ─── 1 & 2. Move functions back to public ───────────────────────────────────

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'private.act_belongs_to_admin(uuid)',
    'private.is_self_managed_student()',
    'private.assign_invoice_number()',
    'private.assign_contractor_invoice_number()',
    'private.guard_event_ticket_capacity()',
    'private.guard_order_fulfilment()',
    'private.network_message_after_insert()',
    'private.handle_deleted_user()'
  ]
  loop
    if to_regprocedure(fn) is not null then
      execute format('alter function %s set schema public', fn);
    end if;
  end loop;
end;
$$;

-- 0121 added search_path to these three; 0120 had them unset.
alter function public.act_belongs_to_admin(uuid) reset search_path;
alter function public.network_message_after_insert() reset search_path;
alter function public.mark_inquiry_viewed(uuid) reset search_path;

-- ─── 5. Restore the broad grants ────────────────────────────────────────────

grant execute on all functions in schema public to anon, authenticated, service_role;

-- custom_access_token_hook and rls_auto_enable were locked down before 0121
-- and must stay that way.
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end;
$$;

-- ─── 7. Recreate the social-media public read policy ────────────────────────

drop policy if exists "social_media_public_read" on storage.objects;
create policy "social_media_public_read"
  on storage.objects for select
  using (bucket_id = 'social-media');

-- ─── 8. Restore stripe_events grants and clear the comments ─────────────────

grant select, insert, update, delete on table public.stripe_events to anon, authenticated;

comment on table public.stripe_events is null;
comment on table public.studio_invoice_counters is null;

commit;
