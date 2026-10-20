-- Audit B-06(c): completing a term plan by manual instalment must settle the
-- invoices it collected, as recordTermInstallmentPaid does. Otherwise families
-- stay in Collections and can pay the same invoices again.
create or replace function public.admin_record_installment_payment(p_plan_id uuid, p_amount_cents int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.term_payment_plans;
  v_user uuid := auth.uid();
  v_completed boolean;
begin
  if v_user is null then raise exception 'permission denied' using errcode = '42501'; end if;
  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'Payment amount must be positive' using errcode = '22023';
  end if;
  select * into v_plan from public.term_payment_plans p
  where p.id = p_plan_id and (
    exists (select 1 from public.profiles u where u.id = v_user
      and u.studio_id = p.studio_id and u.role in ('admin', 'office'))
    or exists (select 1 from public.studio_memberships m where m.user_id = v_user
      and m.studio_id = p.studio_id and m.status = 'active' and m.role in ('admin', 'office'))
  ) for update;
  if not found then raise exception 'Payment plan unavailable' using errcode = '42501'; end if;
  if v_plan.status <> 'active' then raise exception 'Payment plan is not active' using errcode = '22023'; end if;
  if p_amount_cents > v_plan.total_cents - v_plan.amount_paid_cents then
    raise exception 'Payment exceeds remaining balance' using errcode = '22023';
  end if;
  v_completed := v_plan.installments_paid + 1 >= v_plan.installment_count
    and v_plan.amount_paid_cents + p_amount_cents >= v_plan.total_cents;
  update public.term_payment_plans set
    installments_paid = installments_paid + 1,
    amount_paid_cents = amount_paid_cents + p_amount_cents,
    status = case when v_completed then 'completed' else status end,
    completed_at = case when v_completed then now() else null end,
    next_due_date = case when installments_paid + 1 < installment_count
      then (next_due_date + interval '1 month')::date else null end
  where id = p_plan_id;
  if v_completed then
    update public.invoices i set status = 'paid', paid_at = now()
    where i.status in ('sent', 'overdue')
      and i.id in (select l.invoice_id from public.term_payment_plan_invoices l where l.plan_id = p_plan_id);
  end if;
end;
$$;
revoke all on function public.admin_record_installment_payment(uuid, int) from public, anon;
grant execute on function public.admin_record_installment_payment(uuid, int) to authenticated;
