-- ============================================================================
--  0074_security_linter_fixes.sql
--  Address Supabase security linter warnings:
--    - 0011 function_search_path_mutable
--    - 0028 anon_security_definer_function_executable
--    - 0029 authenticated_security_definer_function_executable
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix mutable search_path on functions that were missing it
-- ---------------------------------------------------------------------------

-- handle_deleted_user was created outside migrations in some hosted projects.
-- A fresh database has no such function, so only harden it when present.
do $$
begin
  if to_regprocedure('public.handle_deleted_user()') is not null then
    alter function public.handle_deleted_user() set search_path = public;
    revoke execute on function public.handle_deleted_user() from anon, authenticated;
  end if;
end
$$;

-- admin_record_installment_payment: recreate with search_path + internal
--   permission guard (only admin/office may call this)
create or replace function public.admin_record_installment_payment(
  p_plan_id     uuid,
  p_amount_cents int
)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_plan public.term_payment_plans;
  v_role public.user_role;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('admin', 'office') then
    raise exception 'permission denied';
  end if;

  select * into v_plan from public.term_payment_plans where id = p_plan_id;
  if not found then raise exception 'Plan not found'; end if;

  update public.term_payment_plans
  set
    installments_paid  = installments_paid + 1,
    amount_paid_cents  = amount_paid_cents + p_amount_cents,
    status             = case
      when installments_paid + 1 >= installment_count then 'completed'
      else status
    end,
    completed_at = case
      when installments_paid + 1 >= installment_count then now()
      else null
    end,
    next_due_date = case
      when installments_paid + 1 < installment_count
        then (next_due_date + interval '1 month')::date
      else null
    end
  where id = p_plan_id;
end;
$$;

-- assign_contractor_invoice_number: trigger function, add search_path
create or replace function public.assign_contractor_invoice_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.invoice_number is null then
    new.invoice_number := (
      select coalesce(max(invoice_number), 0) + 1
      from public.contractor_invoices
      where instructor_id = new.instructor_id
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Revoke EXECUTE from anon on SECURITY DEFINER functions
--    (anon should never call these directly)
-- ---------------------------------------------------------------------------

revoke execute on function public.admin_record_installment_payment(uuid, int) from anon;
revoke execute on function public.assign_invoice_number() from anon;
revoke execute on function public.create_instructor_workspace_for_user(text, text) from anon;
revoke execute on function public.is_self_managed_student() from anon;
revoke execute on function public.register_studio_member(text, public.user_role, boolean, date) from anon;
revoke execute on function public.register_studio_member(text, public.user_role) from anon;
revoke execute on function public.assign_contractor_invoice_number() from anon;

-- ---------------------------------------------------------------------------
-- 3. Revoke EXECUTE from authenticated on trigger / internal functions
--    that are not meant to be called via RPC
-- ---------------------------------------------------------------------------

-- Trigger functions: only the trigger mechanism needs to call these
revoke execute on function public.assign_invoice_number() from authenticated;
revoke execute on function public.assign_contractor_invoice_number() from authenticated;

-- is_self_managed_student: used in RLS policies (called as definer by the
-- policy engine), not an RPC endpoint — revoke direct authenticated access
revoke execute on function public.is_self_managed_student() from authenticated;
