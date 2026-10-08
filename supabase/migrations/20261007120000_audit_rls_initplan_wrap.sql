-- October audit, R-04: RLS tenant helpers were evaluated once per row.
--
-- 153 policies called private.current_studio() / current_user_role() /
-- is_studio_admin() / auth.uid() bare. Those helpers are STABLE, but the
-- SECURITY DEFINER join behind them is re-run for every candidate row unless
-- the call is wrapped as a scalar sub-select (an InitPlan, evaluated once per
-- statement). Measured on 22k attendance rows: 29.9 s -> 6 ms.
--
-- Mechanical rewrite of the final policy text with ALTER POLICY: no change to
-- which rows are visible, only to how often the helper runs. Generated from the
-- replayed schema, so it covers policies from every earlier migration.

alter policy "ad_campaigns_admin" on public.ad_campaigns
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "attendance_admin_all" on public.attendance
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "attendance_parent_read_children" on public.attendance
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'parent'::user_role) AND private.is_my_child(student_id)));

alter policy "attendance_student_read_own" on public.attendance
  using (((studio_id = ( SELECT private.current_studio())) AND (student_id = ( SELECT auth.uid() AS uid))));

alter policy "attendance_teacher_assigned" on public.attendance
  using (((( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)))
  with check (((( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)));

alter policy "attendance_teacher_own_classes" on public.attendance
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)));

alter policy "audit_events_operator_read" on public.audit_events
  using (( SELECT private.is_platform_operator()));

alter policy "audit_events_studio_admin_read" on public.audit_events
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "badge_defs_admin_write" on public.badge_definitions
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "badge_defs_read" on public.badge_definitions
  using (((studio_id IS NULL) OR (studio_id = ( SELECT private.current_studio()))));

alter policy "billing_hour_bands_admin" on public.billing_hour_bands
  using ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_hour_bands.product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_hour_bands.product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "billing_hour_bands_member_read" on public.billing_hour_bands
  using ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_hour_bands.product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND p.active))));

alter policy "billing_price_tiers_admin" on public.billing_price_tiers
  using ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_price_tiers.product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_price_tiers.product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "billing_price_tiers_member_read" on public.billing_price_tiers
  using ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_price_tiers.product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND p.active))));

alter policy "billing_product_components_admin" on public.billing_product_components
  using ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_product_components.package_product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_product_components.package_product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "billing_product_components_member_read" on public.billing_product_components
  using ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_product_components.package_product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND p.active))));

alter policy "billing_product_ledger_codes_admin" on public.billing_product_ledger_codes
  using ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_product_ledger_codes.product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM billing_products p
  WHERE ((p.id = billing_product_ledger_codes.product_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "billing_products_admin" on public.billing_products
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "billing_products_member_read" on public.billing_products
  using (((studio_id = ( SELECT private.current_studio())) AND active));

alter policy "building_taps_ops_read" on public.building_taps
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "building_taps_self_read" on public.building_taps
  using (((student_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_self_managed_student())));

alter policy "class_passes_admin_all" on public.class_passes
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "class_passes_student_insert_own" on public.class_passes
  with check (((studio_id = ( SELECT private.current_studio())) AND (student_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_self_managed_student()) AND (product_id IS NOT NULL) AND (price_cents = private.product_price_cents(product_id, studio_id)) AND (currency = 'nzd'::text) AND (status = 'reserved'::text) AND (qr_code IS NULL) AND (stripe_payment_intent_id IS NULL) AND (redeemed_at IS NULL) AND (redeemed_class_id IS NULL) AND (redeemed_date IS NULL) AND (redeemed_by IS NULL) AND (refunded_at IS NULL) AND (refund_amount_cents IS NULL) AND (stripe_refund_id IS NULL)));

alter policy "class_passes_student_update_reserved_checkout" on public.class_passes
  using (((studio_id = ( SELECT private.current_studio())) AND (student_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_self_managed_student()) AND (status = 'reserved'::text)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (student_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_self_managed_student()) AND (product_id IS NOT NULL) AND (price_cents = private.product_price_cents(product_id, studio_id)) AND (currency = 'nzd'::text) AND (status = 'reserved'::text) AND (qr_code IS NOT NULL) AND (stripe_payment_intent_id IS NOT NULL) AND (redeemed_at IS NULL) AND (redeemed_class_id IS NULL) AND (redeemed_date IS NULL) AND (redeemed_by IS NULL) AND (refunded_at IS NULL) AND (refund_amount_cents IS NULL) AND (stripe_refund_id IS NULL)));

alter policy "classes_admin_all" on public.classes
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "classes_member_read" on public.classes
  using ((studio_id = ( SELECT private.current_studio())));

alter policy "classes_teacher_assigned_write" on public.classes
  using (((teacher_id = ( SELECT auth.uid() AS uid)) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.user_in_studio(( SELECT auth.uid() AS uid), studio_id)))
  with check (((teacher_id = ( SELECT auth.uid() AS uid)) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.user_in_studio(( SELECT auth.uid() AS uid), studio_id)));

alter policy "classes_teacher_own" on public.classes
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND (teacher_id = ( SELECT auth.uid() AS uid))))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND (teacher_id = ( SELECT auth.uid() AS uid))));

alter policy "dashboard_layouts_ops_all" on public.dashboard_layouts
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = ANY (ARRAY['admin'::user_role, 'office'::user_role]))))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = ANY (ARRAY['admin'::user_role, 'office'::user_role]))));

alter policy "email_accounts_admin" on public.email_accounts
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "email_messages_admin" on public.email_messages
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "email_threads_admin" on public.email_threads
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "enroll_admin_all" on public.enrollments
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())))
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "enroll_parent_insert_child" on public.enrollments
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'parent'::user_role) AND private.is_my_child(student_id) AND (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = enrollments.class_id) AND (c.studio_id = ( SELECT private.current_studio())))))));

alter policy "enroll_parent_read_child" on public.enrollments
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'parent'::user_role) AND private.is_my_child(student_id)));

alter policy "enroll_student_read_own" on public.enrollments
  using (((studio_id = ( SELECT private.current_studio())) AND (student_id = ( SELECT auth.uid() AS uid))));

alter policy "enroll_student_self_insert" on public.enrollments
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_self_managed_student()) AND (student_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM classes c
  WHERE ((c.id = enrollments.class_id) AND (c.studio_id = ( SELECT private.current_studio())))))));

alter policy "enroll_teacher_assigned_roster" on public.enrollments
  using (((( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)))
  with check (((( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)));

alter policy "enroll_teacher_roster" on public.enrollments
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)));

alter policy "enrollments_teacher_assigned" on public.enrollments
  using (((( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_class(class_id)));

alter policy "ea_admin_all" on public.event_acts
  using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_acts.event_id) AND (e.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "ecg_admin_all" on public.event_cast_groups
  using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_cast_groups.event_id) AND (e.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "ecm_admin_all" on public.event_cast_members
  using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_cast_members.event_id) AND (e.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "ecrew_admin_all" on public.event_crew
  using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_crew.event_id) AND (e.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "ep_admin_all" on public.event_performances
  using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_performances.event_id) AND (e.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "event_tickets_admin_all" on public.event_tickets
  using ((EXISTS ( SELECT 1
   FROM events e
  WHERE ((e.id = event_tickets.event_id) AND (e.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "events_admin_all" on public.events
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "events_public_read" on public.events
  using (((studio_id = ( SELECT private.current_studio())) AND (status = 'published'::text)));

alter policy "form_assignments_admin_all" on public.form_assignments
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "form_assignments_member_read" on public.form_assignments
  using ((studio_id = ( SELECT private.current_studio())));

alter policy "form_responses_self_rw" on public.form_responses
  using (((studio_id = ( SELECT private.current_studio())) AND ((student_id = ( SELECT auth.uid() AS uid)) OR (respondent_id = ( SELECT auth.uid() AS uid)) OR private.is_my_child(student_id))))
  with check (((studio_id = ( SELECT private.current_studio())) AND (respondent_id = ( SELECT auth.uid() AS uid)) AND ((student_id = ( SELECT auth.uid() AS uid)) OR private.is_my_child(student_id))));

alter policy "form_responses_studio" on public.form_responses
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "guard_admin_all" on public.guardianships
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())))
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "guard_parent_read" on public.guardianships
  using (((studio_id = ( SELECT private.current_studio())) AND (guardian_id = ( SELECT auth.uid() AS uid))));

alter policy "guard_student_read" on public.guardianships
  using (((studio_id = ( SELECT private.current_studio())) AND (student_id = ( SELECT auth.uid() AS uid))));

alter policy "invoice_line_items_admin" on public.invoice_line_items
  using ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND (i.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND (i.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "invoice_line_items_payer_insert_own" on public.invoice_line_items
  with check ((EXISTS ( SELECT 1
   FROM invoices i
  WHERE ((i.id = invoice_line_items.invoice_id) AND (i.studio_id = ( SELECT private.current_studio())) AND (i.payer_id = ( SELECT auth.uid() AS uid)) AND (private.is_my_child(i.student_id) OR (( SELECT private.is_self_managed_student()) AND (i.student_id = ( SELECT auth.uid() AS uid))))))));

alter policy "invoice_template_line_items_admin_all" on public.invoice_template_line_items
  using ((EXISTS ( SELECT 1
   FROM invoice_templates it
  WHERE ((it.id = invoice_template_line_items.template_id) AND (it.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM invoice_templates it
  WHERE ((it.id = invoice_template_line_items.template_id) AND (it.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "invoice_templates_admin_all" on public.invoice_templates
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "inv_admin_all" on public.invoices
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "inv_parent_insert_own" on public.invoices
  with check (((studio_id = ( SELECT private.current_studio())) AND (payer_id = ( SELECT auth.uid() AS uid)) AND private.is_my_child(student_id)));

alter policy "inv_parent_read" on public.invoices
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'parent'::user_role) AND ((payer_id = ( SELECT auth.uid() AS uid)) OR private.is_my_child(student_id))));

alter policy "inv_student_insert_own" on public.invoices
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_self_managed_student()) AND (payer_id = ( SELECT auth.uid() AS uid)) AND (student_id = ( SELECT auth.uid() AS uid))));

alter policy "inv_student_update_own_sent" on public.invoices
  using (((payer_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_self_managed_student()) AND (status = ANY (ARRAY['draft'::text, 'sent'::text]))))
  with check ((payer_id = ( SELECT auth.uid() AS uid)));

alter policy "leads_admin_all" on public.leads
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "leads_staff_read" on public.leads
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = ANY (ARRAY['admin'::user_role, 'teacher'::user_role, 'office'::user_role]))));

alter policy "makeup_credits_studio" on public.makeup_credits
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "messages_admin_all" on public.messages
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "messages_mark_read" on public.messages
  using (((studio_id = ( SELECT private.current_studio())) AND (to_user_id = ( SELECT auth.uid() AS uid))));

alter policy "messages_participant" on public.messages
  using (((studio_id = ( SELECT private.current_studio())) AND ((from_user_id = ( SELECT auth.uid() AS uid)) OR (to_user_id = ( SELECT auth.uid() AS uid)))));

alter policy "ni_studio_admin" on public.network_inquiries
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "nm_parties" on public.network_messages
  using ((EXISTS ( SELECT 1
   FROM network_inquiries ni
  WHERE ((ni.id = network_messages.inquiry_id) AND ((ni.instructor_id = ( SELECT auth.uid() AS uid)) OR ((ni.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))));

alter policy "nfc_cards_ops_all" on public.nfc_cards
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())))
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "order_items_admin_all" on public.order_items
  using ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM orders o
  WHERE ((o.id = order_items.order_id) AND (o.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "orders_admin_all" on public.orders
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "parent_email_messages_admin" on public.parent_email_messages
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "parent_email_messages_parent_read" on public.parent_email_messages
  using (((studio_id = ( SELECT private.current_studio())) AND (parent_id = ( SELECT auth.uid() AS uid))));

alter policy "parent_email_threads_admin" on public.parent_email_threads
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "parent_email_threads_parent_read" on public.parent_email_threads
  using (((studio_id = ( SELECT private.current_studio())) AND (parent_id = ( SELECT auth.uid() AS uid))));

alter policy "parent_email_threads_parent_update" on public.parent_email_threads
  using (((studio_id = ( SELECT private.current_studio())) AND (parent_id = ( SELECT auth.uid() AS uid))))
  with check (((studio_id = ( SELECT private.current_studio())) AND (parent_id = ( SELECT auth.uid() AS uid))));

alter policy "notifications_studio_insert" on public.parent_notifications
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "payments_admin_all" on public.payments
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "admins read published announcements" on public.platform_announcements
  using (((published_at IS NOT NULL) AND (published_at <= now()) AND ((expires_at IS NULL) OR (expires_at > now())) AND (( SELECT private.current_user_role()) = 'admin'::user_role) AND ((target = 'all'::text) OR (target = ( SELECT studios.status
   FROM studios
  WHERE (studios.id = ( SELECT private.current_studio())))))));

alter policy "operators manage platform_announcements" on public.platform_announcements
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "operators manage platform_audit_log" on public.platform_audit_log
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "operators manage platform_feature_flags" on public.platform_feature_flags
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "operators manage platform_operators" on public.platform_operators
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "operators manage platform_owner_notes" on public.platform_owner_notes
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "platform_plan_prices_operator_read" on public.platform_plan_prices
  using (( SELECT private.is_platform_operator()));

alter policy "operators manage platform_settings" on public.platform_settings
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "admins read own support messages" on public.platform_support_messages
  using ((EXISTS ( SELECT 1
   FROM platform_support_threads t
  WHERE ((t.id = platform_support_messages.thread_id) AND (t.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "admins send support messages" on public.platform_support_messages
  with check (((sender_profile_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM platform_support_threads t
  WHERE ((t.id = platform_support_messages.thread_id) AND (t.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role))))));

alter policy "operators manage platform_support_messages" on public.platform_support_messages
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "admins create support threads" on public.platform_support_threads
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "admins read own support threads" on public.platform_support_threads
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "operators manage platform_support_threads" on public.platform_support_threads
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "operators manage platform_tasks" on public.platform_tasks
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "plb_admin_all" on public.private_lesson_bookings
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())))
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "products_admin_all" on public.products
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "products_studio_read" on public.products
  using (((studio_id = ( SELECT private.current_studio())) AND (active = true)));

alter policy "profile_badges_admin_all" on public.profile_badges
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "profile_badges_read" on public.profile_badges
  using (((recipient_id = ( SELECT auth.uid() AS uid)) OR private.is_my_child(recipient_id) OR private.teaches_student(recipient_id) OR ((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role))));

alter policy "profile_badges_teacher_delete" on public.profile_badges
  using (((studio_id = ( SELECT private.current_studio())) AND private.teaches_student(recipient_id)));

alter policy "profile_badges_teacher_write" on public.profile_badges
  with check (((studio_id = ( SELECT private.current_studio())) AND (awarded_by = ( SELECT auth.uid() AS uid)) AND private.teaches_student(recipient_id)));

alter policy "profile_stripe_customers_admin" on public.profile_stripe_customers
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "operators read all profiles" on public.profiles
  using (( SELECT private.is_platform_operator()));

alter policy "profiles_admin_all" on public.profiles
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())))
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "profiles_parent_insert_child" on public.profiles
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'parent'::user_role) AND (role = 'student'::user_role) AND (self_managed = false)));

alter policy "profiles_parent_read_children" on public.profiles
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'parent'::user_role) AND private.is_my_child(id)));

alter policy "profiles_teacher_assigned_students" on public.profiles
  using (((( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_student(id)));

alter policy "profiles_teacher_read_students" on public.profiles
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'teacher'::user_role) AND private.teaches_student(id)));

alter policy "social_connections_admin" on public.social_connections
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "staff_admin_all" on public.staff
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "staff_members_admin_all" on public.staff_members
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "staff_members_self_read" on public.staff_members
  using (((studio_id = ( SELECT private.current_studio())) AND (profile_id = ( SELECT auth.uid() AS uid)) AND (( SELECT private.current_user_role()) = ANY (ARRAY['office'::user_role, 'teacher'::user_role]))));

alter policy "staff_pay_rates_ops_all" on public.staff_pay_rates
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())))
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "staff_shifts_admin_all" on public.staff_shifts
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "staff_shifts_office_read" on public.staff_shifts
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'office'::user_role)));

alter policy "staff_shifts_self_read" on public.staff_shifts
  using (((studio_id = ( SELECT private.current_studio())) AND (staff_id = ( SELECT auth.uid() AS uid)) AND (( SELECT private.current_user_role()) = ANY (ARRAY['office'::user_role, 'teacher'::user_role]))));

alter policy "staff_time_entries_ops_all" on public.staff_time_entries
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())))
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "staff_time_entries_self_insert" on public.staff_time_entries
  with check (((staff_id = ( SELECT auth.uid() AS uid)) AND (studio_id = ( SELECT private.current_studio()))));

alter policy "stripe_connect_accounts_admin" on public.stripe_connect_accounts
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "absences_studio_admin" on public.student_absences
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "costumes_studio_admin" on public.student_costumes
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "forms_assigned_read" on public.student_forms
  using (((active = true) AND (published_at IS NOT NULL) AND (studio_id = ( SELECT private.current_studio())) AND private.form_is_for_me(id)));

alter policy "forms_studio_admin" on public.student_forms
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "progress_admin_all" on public.student_progress
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "progress_teacher_insert" on public.student_progress
  with check (((studio_id = ( SELECT private.current_studio())) AND private.teaches_student(student_id) AND (instructor_id = ( SELECT auth.uid() AS uid))));

alter policy "progress_teacher_read" on public.student_progress
  using (((studio_id = ( SELECT private.current_studio())) AND private.teaches_student(student_id)));

alter policy "schedule_admin_all" on public.student_schedule_entries
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())))
  with check (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "schedule_teacher_read" on public.student_schedule_entries
  using (((studio_id = ( SELECT private.current_studio())) AND private.teaches_student(student_id)));

alter policy "schedule_teacher_update" on public.student_schedule_entries
  using (((studio_id = ( SELECT private.current_studio())) AND private.teaches_student(student_id)))
  with check (((studio_id = ( SELECT private.current_studio())) AND private.teaches_student(student_id)));

alter policy "schedule_teacher_write" on public.student_schedule_entries
  with check (((studio_id = ( SELECT private.current_studio())) AND private.teaches_student(student_id) AND (created_by = ( SELECT auth.uid() AS uid))));

alter policy "badge_vis_admin_write" on public.studio_badge_visibility
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "badge_vis_read" on public.studio_badge_visibility
  using ((studio_id = ( SELECT private.current_studio())));

alter policy "admins write own branding" on public.studio_branding
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "studio_integrations_admin" on public.studio_integrations
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "admins manage studio invites" on public.studio_invites
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "memberships_admin_manage" on public.studio_memberships
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "memberships_admin_read" on public.studio_memberships
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "studio_modules_admin_all" on public.studio_modules
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "studio_modules_member_read" on public.studio_modules
  using ((studio_id = ( SELECT private.current_studio())));

alter policy "studio_subscriptions_admin_read" on public.studio_subscriptions
  using (((studio_id = ( SELECT private.current_studio())) AND ( SELECT private.is_studio_admin())));

alter policy "studio_subscriptions_operator_read" on public.studio_subscriptions
  using (( SELECT private.is_platform_operator()));

alter policy "studio_taxonomy_terms_admin_all" on public.studio_taxonomy_terms
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "studio_taxonomy_terms_member_read" on public.studio_taxonomy_terms
  using ((studio_id = ( SELECT private.current_studio())));

alter policy "studio_terms_admin_all" on public.studio_terms
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "studio_terms_member_read" on public.studio_terms
  using ((studio_id = ( SELECT private.current_studio())));

alter policy "studio_vocabulary_overrides_admin_all" on public.studio_vocabulary_overrides
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "studio_vocabulary_overrides_member_read" on public.studio_vocabulary_overrides
  using ((studio_id = ( SELECT private.current_studio())));

alter policy "admins update own studio" on public.studios
  using (((id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "operators read all studios" on public.studios
  using (( SELECT private.is_platform_operator()));

alter policy "operators update all studios" on public.studios
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "sub_line_items_admin" on public.subscription_line_items
  using ((EXISTS ( SELECT 1
   FROM subscriptions s
  WHERE ((s.id = subscription_line_items.subscription_id) AND (s.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM subscriptions s
  WHERE ((s.id = subscription_line_items.subscription_id) AND (s.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "subscriptions_admin_all" on public.subscriptions
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "sub_requests_admin" on public.substitute_requests
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "sub_requests_teacher_read" on public.substitute_requests
  using (((filled_by = ( SELECT auth.uid() AS uid)) OR ((status = 'open'::text) AND ((studio_id = ( SELECT private.current_studio())) OR (EXISTS ( SELECT 1
   FROM studio_memberships sm
  WHERE ((sm.user_id = ( SELECT auth.uid() AS uid)) AND (sm.studio_id = substitute_requests.studio_id) AND (sm.status = 'active'::text))))))));

alter policy "term_plan_invoices_admin" on public.term_payment_plan_invoices
  using ((EXISTS ( SELECT 1
   FROM term_payment_plans p
  WHERE ((p.id = term_payment_plan_invoices.plan_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))))
  with check ((EXISTS ( SELECT 1
   FROM term_payment_plans p
  WHERE ((p.id = term_payment_plan_invoices.plan_id) AND (p.studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))));

alter policy "term_plans_admin_all" on public.term_payment_plans
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "vertical_waitlist_operator_delete" on public.vertical_waitlist
  using (( SELECT private.is_platform_operator()));

alter policy "vertical_waitlist_operator_read" on public.vertical_waitlist
  using (( SELECT private.is_platform_operator()));

alter policy "vertical_waitlist_operator_write" on public.vertical_waitlist
  using (( SELECT private.is_platform_operator()))
  with check (( SELECT private.is_platform_operator()));

alter policy "waiver_sigs_parent_insert" on public.waiver_signatures
  with check (((signed_by = ( SELECT auth.uid() AS uid)) AND private.is_my_child(student_id) AND (EXISTS ( SELECT 1
   FROM waivers w
  WHERE ((w.id = waiver_signatures.waiver_id) AND (w.studio_id = ( SELECT private.current_studio())))))));

alter policy "waiver_sigs_read" on public.waiver_signatures
  using (((signed_by = ( SELECT auth.uid() AS uid)) OR private.is_my_child(student_id) OR ((( SELECT private.current_user_role()) = 'admin'::user_role) AND (EXISTS ( SELECT 1
   FROM waivers w
  WHERE ((w.id = waiver_signatures.waiver_id) AND (w.studio_id = ( SELECT private.current_studio()))))))));

alter policy "waiver_sigs_student_self_insert" on public.waiver_signatures
  with check (((signed_by = ( SELECT auth.uid() AS uid)) AND (student_id = ( SELECT auth.uid() AS uid)) AND ( SELECT private.is_self_managed_student()) AND (EXISTS ( SELECT 1
   FROM waivers w
  WHERE ((w.id = waiver_signatures.waiver_id) AND (w.studio_id = ( SELECT private.current_studio())))))));

alter policy "waivers_admin_all" on public.waivers
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "waivers_read" on public.waivers
  using ((studio_id = ( SELECT private.current_studio())));

alter policy "website_configs_admin_all" on public.website_configs
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)))
  with check (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "xero_connections_admin" on public.xero_connections
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));

alter policy "xero_sync_log_admin" on public.xero_sync_log
  using (((studio_id = ( SELECT private.current_studio())) AND (( SELECT private.current_user_role()) = 'admin'::user_role)));
