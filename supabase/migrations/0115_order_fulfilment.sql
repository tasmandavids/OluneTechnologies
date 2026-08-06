-- ============================================================================
--  0115_order_fulfilment.sql
--
--  Give shop orders a fulfilment state.
--
--  0010 gave orders a `status` covering the PAYMENT lifecycle only —
--  pending / paid / cancelled / refunded. That answers "did the money arrive",
--  which is the question the Stripe webhook asks. It does not answer the
--  question the front desk asks every single day: has this leotard actually
--  been handed to the family yet?
--
--  Without it the orders tab could show a paid order and offer a refund, and
--  nothing else. A studio selling uniform from the desk had no way to see what
--  still needed picking, no way to mark an order collected, and no way to tell
--  a parent whether their order was ready. The catalogue was built; the shop
--  was not.
--
--  Deliberately a SEPARATE column rather than more values on `status`: the two
--  axes are independent. A paid order can be unfulfilled, and a refunded order
--  may well have already been handed over. Collapsing them would make both
--  unrepresentable.
-- ============================================================================

alter table public.orders
  add column if not exists fulfilment_status text not null default 'unfulfilled'
    check (fulfilment_status in ('unfulfilled', 'ready', 'fulfilled')),
  add column if not exists fulfilled_at timestamptz,
  add column if not exists fulfilled_by uuid references public.profiles(id);

-- The picking list: "what does this studio still owe someone". Partial, because
-- that is the only question this index needs to serve — completed orders are
-- read through orders_studio_idx (0010) in the normal date-ordered list.
create index if not exists orders_studio_open_fulfilment_idx
  on public.orders(studio_id, created_at desc)
  where fulfilment_status <> 'fulfilled';

comment on column public.orders.fulfilment_status is
  'Has the goods side of the order been completed? Independent of `status`, which tracks payment only. unfulfilled → ready (picked, awaiting collection) → fulfilled (handed over).';

-- ─── Who may set it ──────────────────────────────────────────────────────────
--
--  0010's `orders_own` policy is `for all using (user_id = auth.uid())`, not
--  select-only — a customer can UPDATE their own order row. That was harmless
--  while every column was either payment state (written by the webhook under
--  the service role) or immutable, but a fulfilment flag a customer can set
--  themselves is worth exactly nothing: "collected" would stop meaning the
--  studio handed anything over.
--
--  Narrowing `orders_own` to SELECT is the tempting fix and the wrong one here
--  — the checkout route inserts the order as the signed-in user, so INSERT has
--  to stay, and unpicking which of UPDATE/DELETE other flows rely on is a
--  bigger change than this migration should make. A trigger guards the three
--  new columns precisely instead, leaving every existing path untouched.

create or replace function public.guard_order_fulfilment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.fulfilment_status is distinct from old.fulfilment_status
     or new.fulfilled_at is distinct from old.fulfilled_at
     or new.fulfilled_by is distinct from old.fulfilled_by
  then
    -- auth.uid() is null for the service role (webhooks, crons), which is
    -- trusted; a signed-in user must be an admin of the owning studio.
    if auth.uid() is not null
       and not (
         private.current_studio() = new.studio_id
         and private.current_user_role() = 'admin'
       )
    then
      raise exception 'Only studio admins can change order fulfilment'
        using errcode = 'insufficient_privilege';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists orders_guard_fulfilment on public.orders;
create trigger orders_guard_fulfilment
  before update on public.orders
  for each row execute function public.guard_order_fulfilment();

--  The studio-admin policy (orders_admin_all) already covers reading and
--  writing the new columns, so no policy changes are needed beyond this.
