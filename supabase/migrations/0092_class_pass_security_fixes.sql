-- ============================================================================
-- 0092 — Harden class pass checkout and redemption state transitions
--
-- 0091 introduced class_passes with a student INSERT policy that only checked
-- ownership. Because the table is exposed through Supabase RLS, a crafted
-- client insert could choose status='paid' and produce a redeemable pass without
-- a Stripe payment. This migration tightens the student policies so user-created
-- rows can only begin as reserved, unpaid checkout records, and so the purchase
-- route can attach checkout details without granting students status changes.
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
