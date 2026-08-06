-- ============================================================================
--  0107_class_pass_product_price.sql
--
--  0093 pinned the student class-pass insert policy to a literal
--  `price_cents = 2500`, matching the hardcoded CLASS_PASS_PRICE_CENTS
--  constant. With the 0105 catalogue that price is a studio's own decision, so
--  the literal has to go — but the guarantee it provided (a student cannot
--  self-issue a pass at a price they chose) must not weaken.
--
--  The replacement checks the price against the studio's own catalogue row
--  instead of against a constant. Everything else 0093 established is
--  reproduced byte-for-byte: bare 'reserved' row, no QR, no PaymentIntent, no
--  redemption fields, no refund fields on insert; and the narrow update that
--  only ever attaches qr_code + stripe_payment_intent_id.
--
--  private.product_price_cents is SECURITY DEFINER because the WITH CHECK runs
--  as the student, and billing_products' member-read policy would otherwise
--  have to be consulted mid-policy — a nested RLS evaluation that Postgres
--  cannot use here. It is STABLE, takes the studio id explicitly (never
--  trusting the caller's session for tenancy), and only ever returns a price
--  for an active product in that studio.
-- ============================================================================

create or replace function private.product_price_cents(p_product_id uuid, p_studio_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select unit_amount_cents
    from public.billing_products
   where id = p_product_id
     and studio_id = p_studio_id
     and active
$$;

revoke all on function private.product_price_cents(uuid, uuid) from public;
grant execute on function private.product_price_cents(uuid, uuid) to authenticated;

drop policy if exists "class_passes_student_insert_own" on public.class_passes;
create policy "class_passes_student_insert_own" on public.class_passes
  for insert
  to authenticated
  with check (
    studio_id = private.current_studio()
    and student_id = auth.uid()
    and public.is_self_managed_student()
    and product_id is not null
    and price_cents = private.product_price_cents(product_id, studio_id)
    and currency = 'nzd'
    and status = 'reserved'
    and qr_code is null
    and stripe_payment_intent_id is null
    and redeemed_at is null
    and redeemed_class_id is null
    and redeemed_date is null
    and redeemed_by is null
    and refunded_at is null
    and refund_amount_cents is null
    and stripe_refund_id is null
  );

drop policy if exists "class_passes_student_update_reserved_checkout" on public.class_passes;
create policy "class_passes_student_update_reserved_checkout" on public.class_passes
  for update
  to authenticated
  using (
    studio_id = private.current_studio()
    and student_id = auth.uid()
    and public.is_self_managed_student()
    and status = 'reserved'
  )
  with check (
    studio_id = private.current_studio()
    and student_id = auth.uid()
    and public.is_self_managed_student()
    and product_id is not null
    and price_cents = private.product_price_cents(product_id, studio_id)
    and currency = 'nzd'
    and status = 'reserved'
    and qr_code is not null
    and stripe_payment_intent_id is not null
    and redeemed_at is null
    and redeemed_class_id is null
    and redeemed_date is null
    and redeemed_by is null
    and refunded_at is null
    and refund_amount_cents is null
    and stripe_refund_id is null
  );
