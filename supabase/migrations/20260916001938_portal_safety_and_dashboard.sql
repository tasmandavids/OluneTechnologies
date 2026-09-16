-- Tenant-safe installment recording. Authorisation uses current database rows,
-- not a potentially stale JWT role. Lock before checking the remaining balance.
create or replace function public.admin_record_installment_payment(p_plan_id uuid, p_amount_cents int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_plan public.term_payment_plans;
  v_user uuid := auth.uid();
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
  update public.term_payment_plans set
    installments_paid = installments_paid + 1,
    amount_paid_cents = amount_paid_cents + p_amount_cents,
    status = case when installments_paid + 1 >= installment_count
      and amount_paid_cents + p_amount_cents >= total_cents then 'completed' else status end,
    completed_at = case when installments_paid + 1 >= installment_count
      and amount_paid_cents + p_amount_cents >= total_cents then now() else null end,
    next_due_date = case when installments_paid + 1 < installment_count
      then (next_due_date + interval '1 month')::date else null end
  where id = p_plan_id;
end;
$$;
revoke all on function public.admin_record_installment_payment(uuid, int) from public, anon;
grant execute on function public.admin_record_installment_payment(uuid, int) to authenticated;

-- Append fields without changing the existing view's columns or RLS semantics.
create or replace view public.class_capacity with (security_invoker = on) as
select c.id, c.studio_id, c.name, c.teacher_id, c.discipline, c.level,
  c.day_of_week, c.start_time, c.end_time, c.capacity,
  coalesce(count(e.id) filter (where e.status = 'active'), 0)::int as enrolled,
  c.room, c.price_cents, c.recurring_group_id
from public.classes c left join public.enrollments e
  on e.class_id = c.id and e.studio_id = c.studio_id
group by c.id;

-- One bounded response. SECURITY INVOKER retains table RLS, including when
-- someone calls this function directly with another studio's identifier.
create or replace function public.portal_dashboard_totals(
  p_studio_id uuid, p_month_start timestamptz, p_cash_start timestamptz
) returns jsonb language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
  'paidCents', (select coalesce(sum(amount_cents), 0) from public.invoices
    where studio_id = p_studio_id and status = 'paid' and created_at >= p_month_start),
  'overdue', (select jsonb_build_object('count', count(*), 'amountCents', coalesce(sum(amount_cents), 0),
    'families', count(distinct payer_id), 'oldestDueDate', min(due_date))
    from public.invoices where studio_id = p_studio_id and status = 'overdue'),
  'leads', (select jsonb_build_object('count', count(*), 'oldestCreatedAt', min(created_at))
    from public.leads where studio_id = p_studio_id and status in ('new', 'trial')),
  'cash', (select jsonb_build_object('count', count(*), 'amountCents', coalesce(sum(amount_cents), 0))
    from public.payments where studio_id = p_studio_id and status = 'succeeded' and created_at >= p_cash_start),
  'days', (select coalesce(jsonb_agg(jsonb_build_object('date', day, 'amountCents', cents) order by day), '[]'::jsonb)
    from (select (created_at at time zone 'UTC')::date as day, sum(amount_cents) as cents
      from public.payments where studio_id = p_studio_id and status = 'succeeded' and created_at >= p_cash_start
      group by 1) daily)
);
$$;
revoke all on function public.portal_dashboard_totals(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.portal_dashboard_totals(uuid, timestamptz, timestamptz) to authenticated;

-- Founder-approved offer: free through 31 December in Pacific/Auckland.
-- Existing trials are extended only; paid/comped/canceled subscriptions are untouched.
create or replace function private.grant_studio_trial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.studio_subscriptions (studio_id, plan_key, status, trial_ends_at)
  values (new.id, 'scale', 'trialing', greatest(now() + interval '14 days',
    timestamp '2027-01-01 00:00:00' at time zone 'Pacific/Auckland'))
  on conflict (studio_id) do nothing;
  return new;
end;
$$;
update public.studio_subscriptions
set trial_ends_at = timestamp '2027-01-01 00:00:00' at time zone 'Pacific/Auckland'
where status = 'trialing' and trial_ends_at < timestamp '2027-01-01 00:00:00' at time zone 'Pacific/Auckland'
  and now() < timestamp '2027-01-01 00:00:00' at time zone 'Pacific/Auckland';

-- Window totals include every visible ledger row before pagination. The UI's
-- running balance must not restart at zero for each page of 50 payments.
create or replace function public.portal_ledger_page(p_studio_id uuid, p_offset int default 0)
returns jsonb language sql stable security invoker set search_path = '' as $$
with ledger as (
  select p.id, p.amount_cents, p.status, p.description, p.created_at,
    i.invoice_number, u.full_name as payer_name,
    sum(p.amount_cents) over (order by p.created_at, p.id rows unbounded preceding) as running_total
  from public.payments p
  left join public.invoices i on i.id = p.invoice_id and i.studio_id = p.studio_id
  left join public.profiles u on u.id = p.payer_id
  where p.studio_id = p_studio_id
), page as (
  select * from ledger order by created_at desc, id desc
  offset greatest(coalesce(p_offset,0),0) limit 50
)
select jsonb_build_object(
  'count', (select count(*) from ledger),
  'netCents', (select coalesce(sum(amount_cents),0) from ledger),
  'rows', coalesce((select jsonb_agg(jsonb_build_object(
    'id',id,'amountCents',amount_cents,'status',status,'description',description,
    'createdAt',created_at,'invoiceNumber',invoice_number,'payerName',payer_name,
    'runningTotalCents',running_total) order by created_at desc,id desc) from page),'[]'::jsonb)
);
$$;
revoke all on function public.portal_ledger_page(uuid,int) from public,anon;
grant execute on function public.portal_ledger_page(uuid,int) to authenticated;

-- Filter and page directory IDs before loading detail, attendance and balances.
create or replace function public.portal_people_page(
  p_studio_id uuid, p_tab text default 'students', p_query text default '',
  p_filter text default 'all', p_class text default 'all', p_offset int default 0
) returns jsonb language sql stable security invoker set search_path = '' as $$
with members as materialized (
  select p.id, p.full_name, p.email, p.phone, p.created_at, p.role
  from public.profiles p where p.role in ('student','parent') and (
    p.studio_id = p_studio_id or exists (select 1 from public.studio_memberships m
      where m.user_id=p.id and m.studio_id=p_studio_id and m.status='active' and m.role=p.role))
), candidates as (
  select m.id, m.full_name as sort_name from members m
  where m.role = case when p_tab='families' then 'parent'::public.user_role else 'student'::public.user_role end
    and p_tab in ('students','families')
    and (coalesce(p_query,'')='' or strpos(lower(concat_ws(' ',m.full_name,m.email,m.phone)),lower(p_query)) > 0
      or (p_tab='students' and exists (select 1 from public.enrollments e join public.classes c on c.id=e.class_id and c.studio_id=p_studio_id
        where e.student_id=m.id and e.studio_id=p_studio_id and e.status='active' and strpos(lower(c.name),lower(p_query))>0))
      or exists (select 1 from public.guardianships g join public.profiles related on related.id=case when p_tab='students' then g.guardian_id else g.student_id end
        where g.studio_id=p_studio_id and (case when p_tab='students' then g.student_id else g.guardian_id end)=m.id
        and strpos(lower(related.full_name),lower(p_query))>0))
    and (p_tab<>'students' or p_class='all' or exists (select 1 from public.enrollments e join public.classes c on c.id=e.class_id and c.studio_id=p_studio_id
      where e.student_id=m.id and e.studio_id=p_studio_id and e.status='active' and c.name=p_class))
    and (p_filter='all'
      or (p_tab='students' and p_filter='overdue' and exists (select 1 from public.invoices i where i.studio_id=p_studio_id and i.student_id=m.id and i.status='overdue'))
      or (p_tab='students' and p_filter='new' and m.created_at>now()-interval '14 days' and not exists (select 1 from public.invoices i where i.studio_id=p_studio_id and i.student_id=m.id and i.status='overdue'))
      or (p_tab='students' and p_filter='unenrolled' and not exists (select 1 from public.enrollments e where e.studio_id=p_studio_id and e.student_id=m.id and e.status='active'))
      or (p_tab='families' and p_filter='owing' and (select coalesce(sum(i.amount_cents),0) from public.invoices i where i.studio_id=p_studio_id and i.payer_id=m.id and i.status in ('sent','overdue'))>0)
      or (p_tab='families' and p_filter='noChildren' and not exists (select 1 from public.guardianships g where g.studio_id=p_studio_id and g.guardian_id=m.id)))
), matching_leads as (
  select l.id,l.updated_at from public.leads l where l.studio_id=p_studio_id and p_tab='leads'
    and (p_filter='all' or l.status=p_filter)
    and (coalesce(p_query,'')='' or strpos(lower(concat_ws(' ',l.first_name,l.last_name,l.email,l.phone,l.source,l.notes)),lower(p_query))>0)
), selected_members as (
  select id from candidates order by sort_name nulls last,id offset greatest(coalesce(p_offset,0),0) limit 50
), selected_leads as (
  select id from matching_leads order by updated_at desc,id offset greatest(coalesce(p_offset,0),0) limit 50
)
select jsonb_build_object(
 'ids', case when p_tab='leads' then (select coalesce(jsonb_agg(id),'[]'::jsonb) from selected_leads)
   else (select coalesce(jsonb_agg(id),'[]'::jsonb) from selected_members) end,
 'childIds', (select coalesce(jsonb_agg(distinct g.student_id),'[]'::jsonb) from public.guardianships g
   where p_tab='families' and g.studio_id=p_studio_id and g.guardian_id in (select id from selected_members)),
 'total', case when p_tab='leads' then (select count(*) from matching_leads) else (select count(*) from candidates) end,
 'counts', jsonb_build_object('students',(select count(*) from members where role='student'),
   'families',(select count(*) from members where role='parent'), 'leads',(select count(*) from public.leads where studio_id=p_studio_id)),
 'classNames',(select coalesce(jsonb_agg(name order by name),'[]'::jsonb) from (select distinct c.name from public.classes c
   join public.enrollments e on e.class_id=c.id and e.studio_id=p_studio_id and e.status='active' where c.studio_id=p_studio_id) names)
);
$$;
revoke all on function public.portal_people_page(uuid,text,text,text,text,int) from public,anon;
grant execute on function public.portal_people_page(uuid,text,text,text,text,int) to authenticated;

-- Small option records are fetched only when a directory form is opened.
create or replace function public.portal_people_options(p_studio_id uuid, p_role public.user_role)
returns jsonb language sql stable security invoker set search_path = '' as $$
select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'email',p.email) order by p.full_name,p.id),'[]'::jsonb)
from public.profiles p where p_role in ('student','parent') and p.role=p_role and (
  p.studio_id=p_studio_id or exists (select 1 from public.studio_memberships m where m.studio_id=p_studio_id
    and m.user_id=p.id and m.role=p_role and m.status='active'));
$$;
revoke all on function public.portal_people_options(uuid,public.user_role) from public,anon;
grant execute on function public.portal_people_options(uuid,public.user_role) to authenticated;

create or replace function public.portal_people_attendance(p_studio_id uuid,p_student_ids uuid[])
returns jsonb language sql stable security invoker set search_path = '' as $$
with students as (select distinct id from unnest(p_student_ids) id limit 100), marks as (
  select student_id,date,status from public.attendance where studio_id=p_studio_id
    and student_id in (select id from students) and date>=current_date-84 and date<=current_date
), weeks as (
  select s.id,w.week,
    coalesce(round(100.0 * count(m.student_id) filter(where m.status in ('present','late')) / nullif(count(m.student_id),0)),0)::int as pct
  from students s cross join generate_series(0,11) as w(week)
  left join marks m on m.student_id=s.id and 11-least(11,floor(extract(epoch from (now()-m.date::timestamptz))/604800)::int)=w.week
  group by s.id,w.week
)
select jsonb_build_object('tracked',exists(select 1 from public.attendance where studio_id=p_studio_id and date>=current_date-84 and date<=current_date),'rows',coalesce((select jsonb_agg(jsonb_build_object(
 'studentId',s.id,'percent',(select round(100.0*count(*) filter(where status in ('present','late'))/nullif(count(*),0))
   from marks where student_id=s.id and date>current_date-28),
 'weeks',(select jsonb_agg(pct order by week) from weeks where id=s.id))) from students s),'[]'::jsonb));
$$;
revoke all on function public.portal_people_attendance(uuid,uuid[]) from public,anon;
grant execute on function public.portal_people_attendance(uuid,uuid[]) to authenticated;

create or replace function public.portal_people_balances(p_studio_id uuid,p_ids uuid[],p_families boolean)
returns jsonb language sql stable security invoker set search_path = '' as $$
select coalesce(jsonb_agg(row_to_json(b)),'[]'::jsonb) from (
  select student_id,payer_id,status,sum(amount_cents) as amount_cents from public.invoices
  where studio_id=p_studio_id and status in ('sent','overdue')
    and case when p_families then payer_id=any(p_ids) else student_id=any(p_ids) end
  group by student_id,payer_id,status
) b;
$$;
revoke all on function public.portal_people_balances(uuid,uuid[],boolean) from public,anon;
grant execute on function public.portal_people_balances(uuid,uuid[],boolean) to authenticated;

create or replace function public.portal_invoice_page(
 p_studio_id uuid,p_query text default '',p_statuses text[] default array['draft','sent','overdue','refunded'],p_offset int default 0
) returns jsonb language sql stable security invoker set search_path = '' as $$
with matching as (
 select i.id,i.issued_at from public.invoices i
 left join public.profiles payer on payer.id=i.payer_id
 left join public.profiles student on student.id=i.student_id
 where i.studio_id=p_studio_id
 and (i.status=any(p_statuses) or i.status not in ('draft','sent','overdue','paid','refunded','void'))
 and (coalesce(p_query,'')='' or strpos(lower(concat_ws(' ',i.id::text,
   'INV-'||lpad(i.invoice_number::text,greatest(4,length(i.invoice_number::text)),'0'),
   i.description,payer.full_name,student.full_name)),lower(p_query))>0)
), page as (select id from matching order by issued_at desc,id desc offset greatest(coalesce(p_offset,0),0) limit 50)
select jsonb_build_object('ids',(select coalesce(jsonb_agg(id),'[]'::jsonb) from page),
 'count',(select count(*) from matching),
 'draftCount',(select count(*) from public.invoices where studio_id=p_studio_id and status='draft'));
$$;
revoke all on function public.portal_invoice_page(uuid,text,text[],int) from public,anon;
grant execute on function public.portal_invoice_page(uuid,text,text[],int) to authenticated;

-- A database-backed lease prevents concurrent delivery invocations from
-- selecting and sending the same queue batch. No client role can acquire it.
create table if not exists private.cron_leases (
  job text primary key, token uuid not null, expires_at timestamptz not null
);
alter table private.cron_leases enable row level security;
revoke all on private.cron_leases from public,anon,authenticated;
create or replace function public.acquire_notification_delivery_lease(p_token uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare acquired boolean := false;
begin
  if p_token is null then return false; end if;
  insert into private.cron_leases(job,token,expires_at)
  values('deliver-notifications',p_token,clock_timestamp()+interval '600 seconds')
  on conflict (job) do update set token=excluded.token,expires_at=excluded.expires_at
    where private.cron_leases.expires_at<=clock_timestamp()
  returning true into acquired;
  return coalesce(acquired,false);
end;
$$;
create or replace function public.release_notification_delivery_lease(p_token uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.cron_leases where job='deliver-notifications' and token=p_token;
$$;
revoke all on function public.acquire_notification_delivery_lease(uuid) from public,anon,authenticated;
revoke all on function public.release_notification_delivery_lease(uuid) from public,anon,authenticated;
grant execute on function public.acquire_notification_delivery_lease(uuid) to service_role;
grant execute on function public.release_notification_delivery_lease(uuid) to service_role;
