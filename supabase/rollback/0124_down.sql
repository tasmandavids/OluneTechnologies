-- ============================================================================
--  ROLLBACK for 0124_enable_stock_oversell_guard
--
--  ⚠️  MANUAL USE ONLY. This lives outside supabase/migrations/ deliberately —
--      the CLI must never pick it up and run it forward.
--
--  Restores 0048's unguarded decrement, the body the order_paid_decrement_stock
--  trigger ran from 0048 until 0124. Running this re-opens the oversell hole:
--  a paid order whose lines exceed stock will drive products.stock_qty
--  negative instead of being refused.
--
--  Reach for this only if the guard is rejecting orders you need to let
--  through — and prefer fixing the stock levels over running this.
--
--  Safe to run more than once.
-- ============================================================================

begin;

create or replace function private.decrement_stock_on_order()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status <> 'paid' and new.status = 'paid' then
    update public.products p
    set stock_qty = p.stock_qty - oi.qty
    from public.order_items oi
    where oi.order_id = new.id
      and oi.product_id = p.id;
  end if;
  return new;
end;
$$;

revoke all on function private.decrement_stock_on_order() from public;

commit;
