-- ============================================================================
--  Lock payer-side writes to money rows.
--
--  Several "own row" policies checked WHO owned a row but not WHAT changed, so
--  any signed-in parent holding the public anon key could skip the app and:
--    • set their own invoice to status='paid', or cut amount_cents to 1 and
--      then pay that through /api/payments/create-intent;
--    • insert an event ticket as status='paid' with total_cents 0;
--    • flip their own shop order to 'paid' (firing the stock decrement);
--    • rewrite their term payment plan or subscription mirror row.
--
--  The legitimate payer-side writes to orders, event_tickets, subscriptions
--  and term plans now go through the service role after the route/action has
--  validated them, so those policies become read-only. Invoices keep their
--  payer insert/update policies (enrolment creates the invoice in the parent's
--  session) but a guard trigger now limits what a non-admin may write.
-- ============================================================================

-- ─── invoices: column guard for non-admin writers ──────────────────────────

create or replace function private.guard_invoice_payer_write()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  -- The only column a payer ever writes after creation: the PaymentIntent id
  -- stamped by /api/payments/create-intent and the enrolment checkout.
  v_payer_writable constant text[] := array['stripe_payment_intent_id'];
begin
  -- Service role (webhooks, crons, server actions using the admin client) and
  -- migrations run without auth.uid(); they are trusted.
  if auth.uid() is null then
    return new;
  end if;

  -- Studio admins manage invoices through inv_admin_all.
  if private.current_studio() = new.studio_id
     and private.current_user_role() = 'admin'
  then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status not in ('draft', 'sent')
       or new.paid_at is not null
       or new.refunded_at is not null
       or coalesce(new.refund_amount_cents, 0) <> 0
       or new.stripe_payment_intent_id is not null
       or new.stripe_refund_id is not null
       or new.stripe_invoice_id is not null
       or new.xero_invoice_id is not null
       or new.subscription_id is not null
       or new.term_payment_plan_id is not null
    then
      raise exception 'Payers can only create unpaid invoices'
        using errcode = 'insufficient_privilege';
    end if;
    return new;
  end if;

  if (to_jsonb(new) - v_payer_writable) is distinct from (to_jsonb(old) - v_payer_writable) then
    raise exception 'Payers can only attach a payment to an invoice'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_guard_payer_write on public.invoices;
create trigger invoices_guard_payer_write
  before insert or update on public.invoices
  for each row execute function private.guard_invoice_payer_write();

-- ─── event_tickets: holders read, the server writes ────────────────────────
-- /api/events/purchase writes with the service role after validating price,
-- capacity and studio. event_tickets_admin_all still covers the door scanner.

drop policy if exists "event_tickets_own" on public.event_tickets;
create policy "event_tickets_own" on public.event_tickets
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ─── orders / order_items: buyers read, the server writes ──────────────────
-- /api/shop/checkout prices the cart server-side and writes with the service
-- role. Before this a buyer could also add line items to an order they had
-- already paid for.

drop policy if exists "orders_own" on public.orders;
create policy "orders_own" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "order_items_via_order" on public.order_items;
create policy "order_items_own_read" on public.order_items
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.user_id = (select auth.uid())
    )
  );

drop policy if exists "order_items_admin_all" on public.order_items;
create policy "order_items_admin_all" on public.order_items
  for all to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.studio_id = private.current_studio()
        and private.current_user_role() = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.orders o
      where o.id = order_id
        and o.studio_id = private.current_studio()
        and private.current_user_role() = 'admin'
    )
  );

-- ─── term payment plans: payers read, the server writes ────────────────────
-- app/portal/parent/billing/actions.ts builds plans with the service role; the
-- plan service checks every invoice belongs to the payer before linking it.

drop policy if exists "term_plans_payer_insert" on public.term_payment_plans;
drop policy if exists "term_plans_payer_update_own" on public.term_payment_plans;
drop policy if exists "term_plan_invoices_payer_insert" on public.term_payment_plan_invoices;

-- ─── subscriptions: payers read, the server writes ─────────────────────────
-- The mirror row is written by the parent action (service role) from the
-- Stripe subscription it just created, then kept in sync by the webhook.

drop policy if exists "subscriptions_payer_insert" on public.subscriptions;
drop policy if exists "subscriptions_payer_update_own" on public.subscriptions;
