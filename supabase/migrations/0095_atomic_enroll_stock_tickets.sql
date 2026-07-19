-- ============================================================================
--  0095 — Atomic enrollment capacity + stock/ticket reservation guards
--
--  Closes TOCTOU races where concurrent enrolls / checkouts oversell.
-- ============================================================================

-- ─── Atomic enroll (capacity-safe) ───────────────────────────────────────────

create or replace function public.enroll_student_atomic(
  p_studio_id uuid,
  p_student_id uuid,
  p_class_id uuid
)
returns table (enrollment_id uuid, waitlisted boolean)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_capacity int;
  v_enrolled int;
  v_status text;
  v_existing_id uuid;
  v_existing_status text;
  v_id uuid;
  v_class_ok boolean;
begin
  select true into v_class_ok
  from public.classes c
  where c.id = p_class_id and c.studio_id = p_studio_id
  for update;

  if v_class_ok is distinct from true then
    raise exception 'Class not found';
  end if;

  select e.id, e.status into v_existing_id, v_existing_status
  from public.enrollments e
  where e.student_id = p_student_id and e.class_id = p_class_id
  for update;

  if v_existing_id is not null and v_existing_status = 'active' then
    raise exception 'Already enrolled';
  end if;

  select c.capacity,
         (select count(*)::int from public.enrollments e
           where e.class_id = p_class_id and e.status = 'active')
    into v_capacity, v_enrolled
  from public.classes c
  where c.id = p_class_id;

  v_status := case
    when coalesce(v_capacity, 0) > 0 and coalesce(v_enrolled, 0) >= v_capacity
      then 'waitlisted'
    else 'active'
  end;

  if v_existing_id is not null then
    update public.enrollments
      set status = v_status, studio_id = p_studio_id
      where id = v_existing_id
      returning id into v_id;
  else
    insert into public.enrollments (studio_id, student_id, class_id, status)
    values (p_studio_id, p_student_id, p_class_id, v_status)
    returning id into v_id;
  end if;

  enrollment_id := v_id;
  waitlisted := (v_status = 'waitlisted');
  return next;
end;
$$;

grant execute on function public.enroll_student_atomic(uuid, uuid, uuid) to authenticated;

-- ─── Stock: refuse paid decrement that would go negative ─────────────────────

create or replace function public.decrement_stock_on_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  if old.status <> 'paid' and new.status = 'paid' then
    select p.name into v_name
    from public.order_items oi
    join public.products p on p.id = oi.product_id
    where oi.order_id = new.id
      and p.stock_qty < oi.qty
    limit 1;

    if v_name is not null then
      raise exception 'Insufficient stock for %', v_name;
    end if;

    update public.products p
    set stock_qty = p.stock_qty - oi.qty
    from public.order_items oi
    where oi.order_id = new.id
      and oi.product_id = p.id
      and p.stock_qty >= oi.qty;
  end if;
  return new;
end;
$$;

-- ─── Events: refuse ticket rows that would exceed capacity ───────────────────

create or replace function public.guard_event_ticket_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total int;
  v_sold int;
begin
  if new.status not in ('reserved', 'paid') then
    return new;
  end if;

  select e.total_tickets into v_total
  from public.events e
  where e.id = new.event_id
  for update;

  if v_total is null then
    raise exception 'Event not found';
  end if;

  select coalesce(sum(t.quantity), 0)::int into v_sold
  from public.event_tickets t
  where t.event_id = new.event_id
    and t.status in ('reserved', 'paid')
    and (tg_op = 'INSERT' or t.id <> new.id);

  if v_sold + new.quantity > v_total then
    raise exception 'Not enough tickets available';
  end if;

  return new;
end;
$$;

drop trigger if exists event_tickets_capacity_guard on public.event_tickets;
create trigger event_tickets_capacity_guard
  before insert or update of status, quantity on public.event_tickets
  for each row execute function public.guard_event_ticket_capacity();
