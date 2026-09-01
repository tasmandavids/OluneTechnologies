-- ============================================================================
--  0124_enable_stock_oversell_guard.sql
--
--  Activates the oversell guard that migration 0095 wrote but never wired up.
--
--  ── What was wrong ────────────────────────────────────────────────────────
--
--  0048 moved decrement_stock_on_order() into the `private` schema and
--  repointed the `order_paid_decrement_stock` trigger there. 0095 then wrote an
--  improved version — one that refuses to sell stock that does not exist —
--  but wrote it to `public.decrement_stock_on_order()`, a name nothing
--  references any more. The trigger kept running 0048's unguarded body, so
--  from 0095 until now a paid order could always drive products.stock_qty
--  negative. 0121 dropped that stranded public copy; this migration puts its
--  logic where the trigger will actually reach it.
--
--  No data repair is needed: at the time of writing, `products` holds no rows
--  and no paid order exceeds current stock, so nothing has actually oversold
--  yet. This closes the hole before the shop carries inventory.
--
--  ── Two behaviours worth knowing before this ships ────────────────────────
--
--  1. products.stock_qty is `integer not null default 0`, so a product whose
--     stock was never set reads as zero, not as "untracked". Once this guard
--     is live, orders for such a product are refused rather than silently
--     driving stock to -1. That is the correct reading of the column, but it
--     does mean a studio must set stock before it can sell.
--
--  2. The trigger fires on the status→'paid' transition, which happens in the
--     Stripe webhook (lib/webhooks/process-stripe-event.ts) *after* the
--     customer has been charged. app/api/shop/checkout/route.ts already
--     rejects an over-quantity cart up front, so this guard only catches the
--     race between two concurrent checkouts for the last unit — but in that
--     race the UPDATE now aborts, and the webhook currently treats a failed
--     order update as a warning and still returns 200. The result is a charged
--     customer whose order stays unpaid, with no retry.
--
--     That is a better failure than shipping goods that do not exist, but it
--     is not a good one, and the webhook should be made loud about it. Left as
--     a follow-up because it is application code, not schema.
-- ============================================================================

create or replace function private.decrement_stock_on_order()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_name text;
begin
  if old.status <> 'paid' and new.status = 'paid' then
    -- Refuse the whole order if any line exceeds what is on hand, rather than
    -- part-filling it and leaving the remainder to go negative.
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
      -- Belt and braces: the select above already proved this holds, but the
      -- predicate keeps a concurrent decrement from taking stock below zero.
      and p.stock_qty >= oi.qty;
  end if;
  return new;
end;
$$;

revoke all on function private.decrement_stock_on_order() from public;

-- The `order_paid_decrement_stock` trigger on public.orders already binds to
-- this function (0048), so replacing the body is all that is required — no
-- trigger is created or dropped here.
