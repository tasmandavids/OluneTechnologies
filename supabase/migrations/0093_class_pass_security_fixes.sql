-- ============================================================================
-- 0093 — Harden class pass checkout state transitions
--
-- 0091 introduced class_passes with a student INSERT policy that only checked
-- ownership, and no student UPDATE policy at all. Two real problems fell out
-- of that:
--   1. A crafted client insert could set status='paid' (or worse) directly,
--      producing a redeemable pass without ever paying via Stripe.
--   2. With no UPDATE policy, the purchase route's own second write (attaching
--      qr_code/stripe_payment_intent_id once the PaymentIntent exists) was
--      silently dropped by RLS — meaning that data never actually persisted,
--      and the payment_intent.succeeded webhook (which matches on
--      stripe_payment_intent_id) could never find the row to flip to 'paid'.
--      The purchase flow was non-functional end to end.
--
-- This tightens the insert policy to only allow a bare, unpaid 'reserved'
-- checkout row, and adds a narrow update policy letting a student attach
-- checkout details (qr_code, stripe_payment_intent_id) to their own row while
-- it's still 'reserved' — nothing else about the row may change.
-- ============================================================================

alter table public.class_passes enable row level security;

grant select, insert, update on public.class_passes to authenticated;

drop policy if exists "class_passes_student_insert_own" on public.class_passes;
create policy "class_passes_student_insert_own" on public.class_passes
  for insert
  to authenticated
  with check (
    studio_id = private.current_studio()
    and student_id = auth.uid()
    and public.is_self_managed_student()
    and price_cents = 2500
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
    and price_cents = 2500
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
