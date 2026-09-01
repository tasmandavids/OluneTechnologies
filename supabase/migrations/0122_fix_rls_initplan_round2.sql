-- Fix auth_rls_initplan warnings (round 2, follows 0074).
-- Must run after 0121, which moves is_self_managed_student() into `private`.
--
-- Each policy below called auth.uid() directly, so Postgres re-evaluated it
-- once per row. Wrapping it as (select auth.uid()) turns it into an InitPlan
-- that runs once per query.
--
-- Policies are also pinned to `to authenticated`. Every predicate here is
-- gated on auth.uid(), so it could never match an anonymous request; naming
-- the role keeps the policy off anon/authenticator/dashboard_user and out of
-- the multiple_permissive_policies lint for those roles.

-- ─── device_tokens ───────────────────────────────────────────────────────────

drop policy if exists "device_tokens_own" on public.device_tokens;
create policy "device_tokens_own" on public.device_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ─── private_lesson_bookings ─────────────────────────────────────────────────

drop policy if exists "plb_parent_insert" on public.private_lesson_bookings;
create policy "plb_parent_insert" on public.private_lesson_bookings
  for insert to authenticated
  with check (
    requested_by = (select auth.uid())
    and private.is_my_child(student_id)
    and status = 'requested'
  );

drop policy if exists "plb_parent_read" on public.private_lesson_bookings;
create policy "plb_parent_read" on public.private_lesson_bookings
  for select to authenticated
  using (requested_by = (select auth.uid()));

drop policy if exists "plb_parent_cancel" on public.private_lesson_bookings;
create policy "plb_parent_cancel" on public.private_lesson_bookings
  for update to authenticated
  using (requested_by = (select auth.uid()) and status = 'requested')
  with check (
    requested_by = (select auth.uid())
    and status in ('requested', 'cancelled')
  );

drop policy if exists "plb_teacher_read" on public.private_lesson_bookings;
create policy "plb_teacher_read" on public.private_lesson_bookings
  for select to authenticated
  using (teacher_id = (select auth.uid()));

-- ─── instructor_availability ─────────────────────────────────────────────────

drop policy if exists "availability_studio_member_read" on public.instructor_availability;
create policy "availability_studio_member_read" on public.instructor_availability
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles me
      where me.id = (select auth.uid())
        and (
          -- teacher is staff at my studio
          exists (
            select 1 from public.profiles t
            where t.id = instructor_availability.instructor_id
              and t.studio_id = me.studio_id
          )
          or
          -- teacher is affiliated to my studio
          exists (
            select 1 from public.studio_memberships sm
            where sm.user_id = instructor_availability.instructor_id
              and sm.studio_id = me.studio_id
              and sm.status = 'active'
          )
        )
    )
  );

-- ─── profile_stripe_customers ────────────────────────────────────────────────

drop policy if exists "profile_stripe_customers_self_read" on public.profile_stripe_customers;
create policy "profile_stripe_customers_self_read" on public.profile_stripe_customers
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- ─── network_inquiries / network_messages ────────────────────────────────────

drop policy if exists "ni_instructor_rw" on public.network_inquiries;
create policy "ni_instructor_rw" on public.network_inquiries
  for all to authenticated
  using (instructor_id = (select auth.uid()));

drop policy if exists "nm_parties" on public.network_messages;
create policy "nm_parties" on public.network_messages
  for all to authenticated
  using (
    exists (
      select 1 from public.network_inquiries ni
      where ni.id = inquiry_id
        and (
          ni.instructor_id = (select auth.uid())
          or (
            ni.studio_id = private.current_studio()
            and private.current_user_role() = 'admin'
          )
        )
    )
  );

-- ─── class_passes ────────────────────────────────────────────────────────────

drop policy if exists "class_passes_student_read_own" on public.class_passes;
create policy "class_passes_student_read_own" on public.class_passes
  for select to authenticated
  using (student_id = (select auth.uid()));

drop policy if exists "class_passes_student_insert_own" on public.class_passes;
create policy "class_passes_student_insert_own" on public.class_passes
  for insert to authenticated
  with check (
    studio_id = private.current_studio()
    and student_id = (select auth.uid())
    and private.is_self_managed_student()
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
  for update to authenticated
  using (
    studio_id = private.current_studio()
    and student_id = (select auth.uid())
    and private.is_self_managed_student()
    and status = 'reserved'
  )
  with check (
    studio_id = private.current_studio()
    and student_id = (select auth.uid())
    and private.is_self_managed_student()
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

-- ─── student_absences ────────────────────────────────────────────────────────

drop policy if exists "absences_parent_rw" on public.student_absences;
create policy "absences_parent_rw" on public.student_absences
  for all to authenticated
  using (
    reported_by = (select auth.uid())
    or exists (
      select 1 from public.guardianships g
      where g.student_id = student_absences.student_id
        and g.guardian_id = (select auth.uid())
    )
  );

-- ─── makeup_credits ──────────────────────────────────────────────────────────

drop policy if exists "makeup_credits_parent" on public.makeup_credits;
create policy "makeup_credits_parent" on public.makeup_credits
  for select to authenticated
  using (
    exists (
      select 1 from public.guardianships g
      where g.student_id = makeup_credits.student_id
        and g.guardian_id = (select auth.uid())
    )
  );

-- ─── student_costumes ────────────────────────────────────────────────────────

drop policy if exists "costumes_parent_read" on public.student_costumes;
create policy "costumes_parent_read" on public.student_costumes
  for select to authenticated
  using (
    exists (
      select 1 from public.guardianships g
      where g.student_id = student_costumes.student_id
        and g.guardian_id = (select auth.uid())
    )
  );

drop policy if exists "costumes_parent_update_size" on public.student_costumes;
create policy "costumes_parent_update_size" on public.student_costumes
  for update to authenticated
  using (
    exists (
      select 1 from public.guardianships g
      where g.student_id = student_costumes.student_id
        and g.guardian_id = (select auth.uid())
    )
  ) with check (
    exists (
      select 1 from public.guardianships g
      where g.student_id = student_costumes.student_id
        and g.guardian_id = (select auth.uid())
    )
  );

-- ─── parent_notifications ────────────────────────────────────────────────────

drop policy if exists "notifications_parent_rw" on public.parent_notifications;
create policy "notifications_parent_rw" on public.parent_notifications
  for all to authenticated
  using (parent_id = (select auth.uid()));

-- ─── staff_time_entries ──────────────────────────────────────────────────────

drop policy if exists "staff_time_entries_self_insert" on public.staff_time_entries;
create policy "staff_time_entries_self_insert" on public.staff_time_entries
  for insert to authenticated
  with check (
    staff_id = (select auth.uid())
    and studio_id = private.current_studio()
  );

drop policy if exists "staff_time_entries_self_update" on public.staff_time_entries;
create policy "staff_time_entries_self_update" on public.staff_time_entries
  for update to authenticated
  using (staff_id = (select auth.uid()) and approved_at is null)
  with check (staff_id = (select auth.uid()));

drop policy if exists "staff_time_entries_self_read" on public.staff_time_entries;
create policy "staff_time_entries_self_read" on public.staff_time_entries
  for select to authenticated
  using (staff_id = (select auth.uid()));

-- ─── profile_badges ──────────────────────────────────────────────────────────

drop policy if exists "profile_badges_read" on public.profile_badges;
create policy "profile_badges_read" on public.profile_badges
  for select to authenticated
  using (
    recipient_id = (select auth.uid())
    or private.is_my_child(recipient_id)
    or private.teaches_student(recipient_id)
    or (
      studio_id = private.current_studio()
      and private.current_user_role() = 'admin'
    )
  );

drop policy if exists "profile_badges_teacher_write" on public.profile_badges;
create policy "profile_badges_teacher_write" on public.profile_badges
  for insert to authenticated
  with check (
    studio_id = private.current_studio()
    and awarded_by = (select auth.uid())
    and private.teaches_student(recipient_id)
  );

-- ─── building_taps ───────────────────────────────────────────────────────────

drop policy if exists "building_taps_self_read" on public.building_taps;
create policy "building_taps_self_read" on public.building_taps
  for select to authenticated
  using (
    student_id = (select auth.uid())
    and private.is_self_managed_student()
  );

-- ─── nfc_cards ───────────────────────────────────────────────────────────────

drop policy if exists "nfc_cards_self_read" on public.nfc_cards;
create policy "nfc_cards_self_read" on public.nfc_cards
  for select to authenticated
  using (student_id = (select auth.uid()));
