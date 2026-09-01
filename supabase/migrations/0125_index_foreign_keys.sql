-- ============================================================================
--  0125_index_foreign_keys.sql
--
--  Clears the 72 `unindexed_foreign_keys` advisories from the performance
--  linter. Every one is a single-column foreign key with no index that leads
--  on it.
--
--  ── Why this is worth a migration, on tables that are still nearly empty ──
--
--  An unindexed foreign key does not just cost the occasional join. Postgres
--  has to enforce the constraint from the *parent* side: every DELETE or key
--  UPDATE on the referenced row scans each referencing table to find the
--  children it must cascade to, set null, or refuse. With no index that is a
--  sequential scan of the whole child table, taking row locks as it goes —
--  once per child table, per parent row deleted.
--
--  The fan-out here is the problem, and it lands on the two deletes the app
--  performs most:
--
--    Deleting a person. app/portal/admin/{parents,students,staff}/actions.ts
--    all call auth.admin.deleteUser(). That deletes auth.users, which cascades
--    to profiles (profiles_id_fkey is ON DELETE CASCADE), and from there to
--    31 unindexed children — attendance, invoices, subscriptions, orders,
--    waiver_signatures, every `created_by`/`connected_by`/`approved_by` audit
--    column. 11 more tables reference auth.users directly. So removing one
--    parent from the roster is 42 sequential scans today, and this is a
--    routine admin action, not a rare one.
--
--    Deleting a studio. app/platform/studios/actions.ts:175 deletes the
--    studios row; 8 unindexed children hang off it, plus every profile in
--    that studio, each of which re-runs the 42 scans above.
--
--  None of that is visible yet — the largest table in this database holds 168
--  rows, so a seq scan is genuinely the cheaper plan and Postgres is right to
--  pick it. It stops being cheap somewhere in the first real studio's first
--  term, and the failure mode then is a delete that takes lock waits with it.
--  Indexes on empty tables cost 16 kB each and nothing to maintain, so the
--  time to add them is before the rows arrive, not after.
--
--  ── Shape of the fix ──
--
--  Plain single-column btree, one per constraint, matching the FK column
--  exactly. That is what the referential-integrity check probes and what the
--  linter looks for. Deliberately no composites and no `where … is not null`
--  partials: several of these columns are mostly NULL and a partial index
--  would be smaller, but at this row count it saves nothing measurable and
--  the uniform shape is easier to reason about later. Composite indexes for
--  specific query shapes belong with the query that needs them, the way 0111
--  added the guardianships pair.
--
--  Grouped below by the parent table each foreign key points at.
--
--  ── The other 40 advisories: `unused_index` — deliberately not acted on ───
--
--  The same linter run flags 40 indexes as never scanned and suggests dropping
--  them. They are staying, because "never scanned" here is a statement about
--  the size of the dataset, not about the value of the index:
--
--    * The list includes primary keys and unique constraints —
--      enrollments_pkey, guardianships_pkey, subscriptions_pkey,
--      subscriptions_stripe_subscription_id_key,
--      nfc_cards_one_active_per_student. These enforce correctness and cannot
--      be dropped at all; that they show zero scans is proof the metric is
--      measuring the wrong thing.
--
--    * Every table involved is tiny (168 rows at the largest, most under 20).
--      Postgres will seq-scan a table that small no matter how good the index
--      is, so idx_scan stays at 0 by construction.
--
--    * Several back code paths that are demonstrably live but low-volume:
--      studio_invites_token_idx serves invite redemption by token,
--      class_passes_qr_token_idx and nfc_cards_token_idx serve scan-to-check-in.
--      Dropping those trades a unique-index lookup for a full scan on exactly
--      the paths that need to stay fast when they do get traffic.
--
--  This advisory becomes worth revisiting once the tables carry real volume
--  and the counters have run for a term against production traffic. Until
--  then it has nothing to say.
-- ============================================================================


-- ─── → profiles (31) ───────────────────────────────────────────────────────
-- Reached by the auth.users cascade on every parent/student/staff deletion.
create index if not exists attendance_noted_by_idx
  on public.attendance (noted_by);
create index if not exists class_passes_redeemed_by_idx
  on public.class_passes (redeemed_by);
create index if not exists email_accounts_connected_by_idx
  on public.email_accounts (connected_by);
create index if not exists event_cast_members_profile_idx
  on public.event_cast_members (profile_id);
create index if not exists event_crew_profile_idx
  on public.event_crew (profile_id);
create index if not exists event_tickets_checked_in_by_idx
  on public.event_tickets (checked_in_by);
create index if not exists events_created_by_idx
  on public.events (created_by);
create index if not exists form_responses_parent_idx
  on public.form_responses (parent_id);
create index if not exists invoices_student_idx
  on public.invoices (student_id);
create index if not exists network_inquiries_sender_idx
  on public.network_inquiries (sender_id);
create index if not exists network_messages_sender_idx
  on public.network_messages (sender_id);
create index if not exists nfc_cards_issued_by_idx
  on public.nfc_cards (issued_by);
create index if not exists orders_fulfilled_by_idx
  on public.orders (fulfilled_by);
create index if not exists platform_support_messages_sender_profile_idx
  on public.platform_support_messages (sender_profile_id);
create index if not exists profile_badges_awarded_by_idx
  on public.profile_badges (awarded_by);
create index if not exists social_connections_connected_by_idx
  on public.social_connections (connected_by);
create index if not exists staff_pay_rates_created_by_idx
  on public.staff_pay_rates (created_by);
create index if not exists staff_time_entries_approved_by_idx
  on public.staff_time_entries (approved_by);
create index if not exists staff_time_entries_created_by_idx
  on public.staff_time_entries (created_by);
create index if not exists stripe_connect_accounts_connected_by_idx
  on public.stripe_connect_accounts (connected_by);
create index if not exists student_absences_reported_by_idx
  on public.student_absences (reported_by);
create index if not exists student_forms_created_by_idx
  on public.student_forms (created_by);
create index if not exists student_progress_instructor_idx
  on public.student_progress (instructor_id);
create index if not exists student_schedule_entries_created_by_idx
  on public.student_schedule_entries (created_by);
create index if not exists studio_integrations_connected_by_idx
  on public.studio_integrations (connected_by);
create index if not exists subscriptions_student_idx
  on public.subscriptions (student_id);
create index if not exists substitute_requests_filled_by_idx
  on public.substitute_requests (filled_by);
create index if not exists substitute_requests_posted_by_idx
  on public.substitute_requests (posted_by);
create index if not exists term_payment_plans_payer_idx
  on public.term_payment_plans (payer_id);
create index if not exists waiver_signatures_signed_by_idx
  on public.waiver_signatures (signed_by);
create index if not exists xero_connections_connected_by_idx
  on public.xero_connections (connected_by);

-- ─── → auth.users (11) ─────────────────────────────────────────────────────
-- Platform-operator audit columns; scanned by the same deletion.
create index if not exists platform_announcements_created_by_idx
  on public.platform_announcements (created_by);
create index if not exists platform_audit_log_operator_idx
  on public.platform_audit_log (operator_id);
create index if not exists platform_feature_flags_updated_by_idx
  on public.platform_feature_flags (updated_by);
create index if not exists platform_owner_notes_updated_by_idx
  on public.platform_owner_notes (updated_by);
create index if not exists platform_settings_updated_by_idx
  on public.platform_settings (updated_by);
create index if not exists platform_support_messages_sender_operator_idx
  on public.platform_support_messages (sender_operator_id);
create index if not exists platform_support_threads_assigned_to_idx
  on public.platform_support_threads (assigned_to);
create index if not exists platform_support_threads_created_by_idx
  on public.platform_support_threads (created_by);
create index if not exists platform_tasks_assigned_to_idx
  on public.platform_tasks (assigned_to);
create index if not exists platform_tasks_created_by_idx
  on public.platform_tasks (created_by);
create index if not exists studio_invites_invited_by_idx
  on public.studio_invites (invited_by);

-- ─── → studios (8) ────────────────────────────────────────────────────────
-- Also the tenant filter these tables are read by, so these earn their keep
-- on SELECT as well as on DELETE.
create index if not exists contractor_invoices_studio_idx
  on public.contractor_invoices (studio_id);
create index if not exists device_tokens_studio_idx
  on public.device_tokens (studio_id);
create index if not exists instructor_expenses_studio_idx
  on public.instructor_expenses (studio_id);
create index if not exists makeup_credits_studio_idx
  on public.makeup_credits (studio_id);
create index if not exists parent_email_messages_studio_idx
  on public.parent_email_messages (studio_id);
create index if not exists parent_notifications_studio_idx
  on public.parent_notifications (studio_id);
create index if not exists platform_feature_flags_studio_idx
  on public.platform_feature_flags (studio_id);
create index if not exists platform_tasks_studio_idx
  on public.platform_tasks (studio_id);

-- ─── → billing_products (5) ───────────────────────────────────────────────
-- Retiring a product from the catalogue scans all five.
create index if not exists billing_product_components_component_product_idx
  on public.billing_product_components (component_product_id);
create index if not exists invoice_template_line_items_product_idx
  on public.invoice_template_line_items (product_id);
create index if not exists private_lesson_bookings_product_idx
  on public.private_lesson_bookings (product_id);
create index if not exists products_billing_product_idx
  on public.products (billing_product_id);
create index if not exists subscription_line_items_product_idx
  on public.subscription_line_items (product_id);

-- ─── → classes (5) ────────────────────────────────────────────────────────
-- Deleting or archiving a class at term rollover.
create index if not exists student_absences_class_idx
  on public.student_absences (class_id);
create index if not exists student_absences_makeup_class_idx
  on public.student_absences (makeup_class_id);
create index if not exists student_costumes_class_idx
  on public.student_costumes (class_id);
create index if not exists subscriptions_class_idx
  on public.subscriptions (class_id);
create index if not exists substitute_requests_class_idx
  on public.substitute_requests (class_id);

-- ─── → the long tail, one or two children each ────────────────────────────
-- studio_terms, badge_definitions, email_messages, email_threads,
-- event_cast_members, invoices, nfc_cards, private_clients, student_absences,
-- student_schedule_entries, term_payment_plans.
create index if not exists billing_products_term_idx
  on public.billing_products (term_id);
create index if not exists subscriptions_last_invoiced_term_idx
  on public.subscriptions (last_invoiced_term_id);
create index if not exists studio_badge_visibility_badge_idx
  on public.studio_badge_visibility (badge_id);
create index if not exists parent_email_messages_source_email_message_idx
  on public.parent_email_messages (source_email_message_id);
create index if not exists parent_email_threads_source_email_thread_idx
  on public.parent_email_threads (source_email_thread_id);
create index if not exists event_act_participants_cast_member_idx
  on public.event_act_participants (cast_member_id);
create index if not exists private_lesson_bookings_invoice_idx
  on public.private_lesson_bookings (invoice_id);
create index if not exists building_taps_card_idx
  on public.building_taps (card_id);
create index if not exists contractor_invoices_private_client_idx
  on public.contractor_invoices (private_client_id);
create index if not exists makeup_credits_absence_idx
  on public.makeup_credits (absence_id);
create index if not exists private_lesson_bookings_schedule_entry_idx
  on public.private_lesson_bookings (schedule_entry_id);
create index if not exists payments_term_payment_plan_idx
  on public.payments (term_payment_plan_id);
