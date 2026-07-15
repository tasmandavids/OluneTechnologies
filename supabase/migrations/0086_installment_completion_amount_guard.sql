-- ============================================================================
--  0086_installment_completion_amount_guard.sql
--
--  A term payment plan must only be marked `completed` (and, downstream, have
--  its invoices flipped to paid) once the FULL balance has actually been
--  collected — not merely when the installment counter reaches
--  `installment_count`. The counter-only rule let a plan read as fully paid
--  while money was still owed (e.g. an installment that settled short, or the
--  admin "Record" button advancing the schedule without the funds landing).
--
--  Mirrors the same guard now applied in lib/term-payment-plan-service.ts
--  (recordTermInstallmentPaid).
-- ============================================================================

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
      when installments_paid + 1 >= installment_count
       and amount_paid_cents + p_amount_cents >= total_cents then 'completed'
      else status
    end,
    completed_at = case
      when installments_paid + 1 >= installment_count
       and amount_paid_cents + p_amount_cents >= total_cents then now()
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

revoke execute on function public.admin_record_installment_payment(uuid, int) from anon;
