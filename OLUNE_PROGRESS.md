# Olune — Build Progress

## Stack Decision Log
The starter codebase uses **Supabase** (not Prisma) as the ORM/database layer, with PostgreSQL RLS for multi-tenancy. Next-Auth was replaced by Supabase Auth. All architecture decisions follow this pattern.

---

## ✅ PHASE 1 — COMPLETE (pre-existing)

### 1.1 Database Schema (Supabase migrations)
- `0001_tenant_branding.sql` — `studios` table, `studio_branding` table, custom domain support
- `0002_core_tables_and_rls.sql` — `profiles`, `classes`, `enrollments`, `guardianships`, `invoices`, full RLS policies + helper functions (`current_studio()`, `current_user_role()`, `is_my_child()`, `teaches_class()`, `teaches_student()`), JWT hook
- `0003_attendance_and_capacity_view.sql` — `attendance` table + `class_capacity` view (live enrolled counts)

### 1.2 Auth + Middleware
- `middleware.ts` — Supabase session refresh + role-based portal routing (`/portal/admin`, `/portal/teacher`, `/portal/parent`, `/portal/student`)
- `lib/tenant.ts` — resolves studio from subdomain (`slug.olune.app`) or custom domain

### 1.3 Branding System
- `lib/branding.ts` — `derivePalette()`, `brandingToCssVars()`, `getBranding()`
- Root layout injects CSS custom properties (`--brand`, `--brand-hot`, `--brand-deep`, `--base`, `--surface`, etc.) server-side per tenant

### 1.4 Portal Pages (pre-existing)
- `/portal/admin` — Dashboard: stats cards, capacity heatmap, drag-and-drop schedule builder (mock data)
- `/portal/admin/branding` — Live branding editor with colour picker + font selector
- `/portal/admin/settings` — Studio identity editor (name/slug)
- `/portal/teacher` — Schedule view + interactive roll-call with optimistic attendance marking
- `/portal/parent` — Family hub: children cards + invoice table
- `/portal/student` — Timetable: today's classes + weekly grid + all classes list

---

## ✅ SESSION 1 — COMPLETE (2026-06-15)

### Admin Classes Management
**Files created:**
- `app/portal/admin/classes/page.tsx` — Server component: fetches `class_capacity` view + price data + teacher names
- `app/portal/admin/classes/actions.ts` — `createClass`, `updateClass`, `deleteClass` server actions with Zod validation + admin guard
- `components/admin/classes/ClassesManager.tsx` — Full client UI: searchable table, slide-over create/edit form (name, discipline, level, day, time, capacity, price, teacher), delete confirm dialog

### Admin Students Management + Enrollment
**Files created:**
- `app/portal/admin/students/page.tsx` — Server component: all studio students with their active enrollments + class options dropdown data
- `app/portal/admin/students/actions.ts` — `enrollStudent` (with capacity check), `unenrollStudent`, `addStudent` server actions
- `components/admin/students/StudentsManager.tsx` — Student grid with search, detail slide-over showing enrolled classes + enroll/unenroll controls

### Portal Navigation Update
- `components/portal/PortalShell.tsx` — Added **Classes** and **Students** nav items to admin sidebar

### TypeScript
- Clean build (`tsc --noEmit` → no errors)

---

## ✅ SESSION 2 — COMPLETE (2026-06-15)

### ScheduleBuilder — Wired to Real DB (Phase 2.1)
**Files created/updated:**
- `app/portal/admin/classes/schedule-actions.ts` — `rescheduleClass(classId, dayOfWeek, startTime)` server action
- `components/admin/dashboard/types.ts` — Updated `ClassBlock` interface; added `SCHEDULE_DAYS` + `SCHEDULE_SLOTS`
- `components/admin/dashboard/ScheduleBuilder.tsx` — Rewritten to accept real `ClassBlock[]` prop; Day×Time grid; calls `rescheduleClass` on drop
- `components/admin/dashboard/AdminDashboard.tsx` — Added `scheduleClasses` prop
- `app/portal/admin/page.tsx` — Added 5th parallel query for classes → maps to `ClassBlock[]`

### Enrollment Flow — Parent Portal (Phase 2.2)
**Files created:**
- `supabase/migrations/0004_waivers.sql` — `waivers` + `waiver_signatures` tables with RLS
- `app/portal/parent/enroll/actions.ts` — `getAvailableClasses()`, `getActiveWaivers()`, `signWaiver()`, `enrollChildInClass()`
- `components/portal/parent/EnrollModal.tsx` — 4-step modal (class → waivers → payment → confirmation)
- `components/portal/parent/ParentHub.tsx` — Added `+ Enroll` button

### Stripe Integration (Phase 3)
**Files created:**
- `lib/stripe.ts` — Singleton Stripe client
- `supabase/migrations/0005_stripe_fields.sql` — `stripe_payment_intent_id`, `stripe_customer_id` on profiles/invoices; new `payments` table
- `app/api/payments/create-intent/route.ts` — POST endpoint
- `app/api/webhooks/stripe/route.ts` — Handles `payment_intent.succeeded`, `invoice.paid`, `customer.subscription.deleted`
- `app/portal/admin/billing/page.tsx` + `components/admin/billing/BillingDashboard.tsx` — Invoice table + monthly Recharts bar chart

### Leads CRM (Phase 4.1)
**Files created:**
- `supabase/migrations/0006_leads.sql` — `leads` table with RLS
- `app/portal/admin/leads/actions.ts` — `createLead`, `updateLeadStatus`, `updateLeadNotes`, `deleteLead`
- `app/portal/admin/leads/page.tsx` + `components/admin/leads/LeadsBoard.tsx` — Kanban board with `@hello-pangea/dnd`

### Navigation
- Added **Billing** + **Leads** nav items to admin sidebar

### Packages installed: `stripe@22.2.1`, `recharts@3.8.1`
### TypeScript: Clean build

---

## ✅ SESSION 3 — COMPLETE (2026-06-15)

### Phase 4.2 — Internal Messaging (SSE)
**Files created:**
- `supabase/migrations/0007_messages.sql` — `messages` table with RLS (participant read, admin all, insert with studio check, update for mark-read)
- `app/api/messages/route.ts` — GET (fetch thread + auto-mark-read) + POST (send message)
- `app/api/messages/stream/route.ts` — SSE endpoint using Supabase Realtime `postgres_changes`; heartbeat every 25s; cleans up on client disconnect
- `app/portal/admin/messages/page.tsx` — Server shell: fetches contacts + recent messages
- `components/admin/messages/MessagesPanel.tsx` — Two-pane chat UI: contact list (sorted by unread then recency) + thread view with SSE auto-append; optimistic send; Enter to send/Shift+Enter new line

### Phase 4.3 — Automated Notifications
**Files created:**
- `supabase/migrations/0008_notifications.sql` — `notifications` table + 3 DB triggers: enrollment_confirmed (insert on enrollments), invoice_overdue (update status on invoices), message_received (insert on messages)
- `app/api/notifications/route.ts` — GET (recent 30, includes unread count) + POST (mark read — specific ids or all)
- `components/admin/notifications/NotificationBell.tsx` — Bell icon with unread badge; polls every 60s; dropdown list; marks all read on open; navigates to link on item click
- `components/portal/PortalShell.tsx` — Added notification bell in top bar (admin-only); added **Messages** nav item

### Phase 5.1 — Event & Recital Wizard
**Files created:**
- `supabase/migrations/0009_events.sql` — `events` + `event_tickets` tables; trigger to auto-sync `sold_tickets`; RLS (admin all, public published-only read)
- `app/portal/admin/events/actions.ts` — `createEvent`, `updateEvent`, `publishEvent`, `cancelEvent`, `deleteEvent`
- `app/portal/admin/events/page.tsx` — Server shell
- `components/admin/events/EventsManager.tsx` — Event list (upcoming/past), 4-step creation wizard (Basic Info → Venue → Tickets & Pricing → Review & Publish), inline publish/cancel/delete actions
- `app/api/events/purchase/route.ts` — POST ticket purchase: free = reserve immediately with QR; paid = Stripe PaymentIntent + reserved row; QR code is base64 PNG via `qrcode` npm
- Added **Events** nav item

### Phase 5.2 — Merchandise POS
**Files created:**
- `supabase/migrations/0010_products.sql` — `products`, `orders`, `order_items` tables; trigger to decrement stock on order paid; RLS (admin all, studio members browse active products)
- `app/portal/admin/shop/actions.ts` — `createProduct`, `updateProduct`, `adjustStock`, `toggleProductActive`, `deleteProduct`
- `app/portal/admin/shop/page.tsx` — Server shell
- `components/admin/shop/ShopManager.tsx` — Product grid (search + category filter) + stock ±1 controls + slide-over create/edit form; recent orders table
- `components/portal/parent/ParentShop.tsx` — Parent-facing product grid with cart (React state), add/remove/qty controls, slide-over cart, calls `/api/shop/checkout`
- `app/api/shop/checkout/route.ts` — Creates order + line items; free = paid immediately; paid = Stripe PaymentIntent returned
- Added **Shop** + **Events** nav items

### Packages installed: `qrcode`, `@types/qrcode`
### TypeScript: Clean build (`tsc --noEmit` → no errors)

---

## ✅ SESSION 4 — COMPLETE (2026-06-15)

### Priority 1 — ParentShop mounted in Parent Portal
- `app/portal/parent/page.tsx` — Resolves the parent's `studio_id`, then fetches active `products` (studio-scoped) and renders `<ParentShop products={products} />` in a new section below `ParentHub`. Added `ShopProduct` export type.

### Priority 2 — Event ticket purchase in Parent Portal
- `components/portal/parent/EventsTickets.tsx` (new) — Grid of published events; detail/purchase modal with qty stepper; calls `/api/events/purchase`; renders the returned QR-code PNG on success. Shows "Ticket held" + existing QR for events the parent already has.
- `app/portal/parent/page.tsx` — Fetches published events + the parent's existing `event_tickets`, maps to `ParentEvent[]` (with `ticketsRemaining` and `myTicket`), renders `<EventsTickets>`.

### Priority 3 — Stripe webhook order + ticket confirmation
- `app/api/webhooks/stripe/route.ts` — `payment_intent.succeeded` now branches on metadata: `invoice_id` (existing), `order_id` → marks `orders.status = 'paid'` (fires stock-decrement trigger), `event_id` → promotes the reserved `event_tickets` row (matched by intent id + user) to `'paid'` (fires sold_tickets sync trigger).

### Priority 4 — Student Progress Tracker (Phase 5.3)
- `supabase/migrations/0011_student_progress.sql` (new) — `student_progress` table (studio_id, student_id, instructor_id, notes, level, certifications jsonb, logged_at) + RLS: admin all, teacher read/insert via `teaches_student()`, student self-read, parent `is_my_child()` read.
- `app/portal/admin/students/[id]/actions.ts` (new) — `logProgress` (admin or teacher; stamps instructor_id + studio_id so both RLS policies pass) + `deleteProgress`, Zod-validated.
- `app/portal/admin/students/[id]/page.tsx` (new) — Student detail header + progress timeline.
- `components/admin/students/ProgressTracker.tsx` (new) — Log form (notes, level select, cert badge input) + reverse-chronological timeline.
- `components/admin/students/StudentsManager.tsx` — Added "View progress & profile" link in the detail slide-over.

### Priority 5 — Teacher progress access
- `app/portal/teacher/students/[id]/page.tsx` (new) — Reuses `ProgressTracker` (delete hidden via `readOnlyDelete`); RLS scopes data to the teacher's own students, so no extra guard needed.
- `components/portal/teacher/TeacherSchedule.tsx` — Student names in roll-call now link to the teacher progress page.

### Also fixed
- `app/api/events/purchase/route.ts` — Stripe customer name now reads `full_name` (the real `profiles` column) instead of the non-existent `first_name`/`last_name`.

### TypeScript: Clean build (`tsc --noEmit` → no errors)

---

## ✅ SESSION 5 — COMPLETE (2026-06-15)

### Priority 1 — Real card capture (Stripe PaymentElement) ✅
**Packages installed:** `@stripe/react-stripe-js@^6.6.0` (v6 is the first line whose peer range allows the already-installed `@stripe/stripe-js@9`; v3 caps at `<8` → ERESOLVE).

**Files created:**
- `lib/stripe-client.ts` — browser-side `getStripe()` singleton (memoised `loadStripe`). Resolves to `null` when `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is unset so callers degrade gracefully.
- `components/payments/CheckoutForm.tsx` — shared client component. Wraps `<Elements>` (PaymentIntent-first / clientSecret mode) around `<PaymentElement>` + submit button; calls `stripe.confirmPayment({ elements, redirect: "if_required" })` so card payments stay inline and only redirect when the method requires it. Fires `onSuccess()` on `succeeded`/`processing`. NOTE: deliberately does **not** call `elements.submit()` — that is only valid in the deferred-intent flow and errors in clientSecret mode.

**Files updated:**
- `components/portal/parent/ParentShop.tsx` — paid checkout now stores `data.clientSecret` and renders `<CheckoutForm>` in the cart slide-over footer; `onSuccess` clears cart + shows "Order confirmed".
- `components/portal/parent/EventsTickets.tsx` — paid branch stores `clientSecret` + `pendingQr`; modal shows `<CheckoutForm>`; `onSuccess` reveals the QR (free branch still confirms immediately).
- `components/portal/parent/EnrollModal.tsx` — `Step3Payment` rewritten as a 2-phase ("summary" → "pay") self-contained step: enrolls first (to reserve the spot + learn waitlist status), then for paid + non-waitlisted enrollments creates an invoice + PaymentIntent and shows `<CheckoutForm>`. Free/waitlisted skip payment. Removed the old `doEnroll`/`submitError` path from the parent modal.
- `app/portal/parent/enroll/actions.ts` — new `createEnrollmentIntent(studentId, classId, className, priceCents)` server action: creates a `sent` invoice (7-day due date) + Stripe customer (if needed) + PaymentIntent with `metadata.invoice_id` (so the existing `payment_intent.succeeded` webhook marks it paid and records the payment row).
- `.env.local.example` — documented `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`.

**Decisions made autonomously:**
- Enrollment charges in `aud` to stay consistent with the existing shop/events PaymentIntents (whole Stripe integration is AUD). EnrollModal display still uses the `en-NZ`/NZD `Intl` formatter inherited from before — both render `$`, so no visible mismatch, but the display currency vs charge currency should be unified studio-wide (see notes).
- For paid enrollments the child is enrolled *before* payment (spot reserved); an unpaid enrollment leaves a `sent` invoice. Acceptable for a studio; revisit if you want pay-to-confirm semantics.

### TypeScript: Clean build (`tsc --noEmit` → no errors)

---

## ✅ SESSION 6 — COMPLETE (2026-06-16)

Closed out the remaining Phase 2.4 + Phase 3.2/3.3 priorities. Clean `tsc --noEmit`.

### Priority 1 — Waitlist auto-promotion (Phase 2.4) ✅
- `supabase/migrations/0012_waitlist_autopromote.sql` (new) — `promote_waitlist()` SECURITY DEFINER trigger fn + `waitlist_promote_trigger` on `enrollments` (AFTER UPDATE OR DELETE). When an `active` enrollment leaves (hard delete via admin unenroll, or status moves away from `active`), it promotes the oldest `waitlisted` student (by `enrolled_at`) to `active` — looping until the class is full or the waitlist empties — and inserts a `waitlist_promoted` notification for each promoted student. Recursion-safe (inner promotions see `old.status = 'waitlisted'` and early-return).
- No app code change needed: the existing admin `unenrollStudent` (hard DELETE) already fires the trigger.

### Priority 2 — Recurring class generation (Phase 2.4) ✅
- **Decision:** kept the weekly-recurring `classes` model (no `class_sessions` table) to avoid rewiring the capacity view / attendance / enrollments / ScheduleBuilder. Recurrence is expressed at the class level via a shared `recurring_group_id`.
- `supabase/migrations/0013_recurring_classes.sql` (new) — adds nullable `recurring_group_id uuid` + index to `classes`.
- `app/portal/admin/classes/actions.ts` — added `createRecurringClasses` (generates one weekly class row per selected weekday, all sharing a new `recurring_group_id`; de-dupes days) + `deleteRecurringGroup` (deletes the whole linked set).
- `components/admin/classes/ClassesManager.tsx` — create slide-over now uses a multi-select day-chip picker (edit mode keeps the single-day select). Selecting >1 day calls `createRecurringClasses`; 1 day falls back to `createClass`.

### Priority 3 — Auto-pay subscriptions (Phase 3.2) ✅
- `supabase/migrations/0014_subscriptions.sql` (new) — `subscriptions` table (studio_id, payer_id, student_id, class_id, stripe_subscription_id, plan_label, amount_cents, currency, interval, status, current_period_end, cancel_at_period_end) + RLS (admin all, payer read/insert).
- `app/portal/parent/subscriptions/actions.ts` (new) — `createEnrollmentSubscription` creates a Stripe **Product** + monthly inline-price **Subscription** (`payment_behavior: default_incomplete`, `save_default_payment_method: on_subscription`), returns the first-invoice clientSecret (read defensively from `confirmation_secret` or legacy `payment_intent`), and mirrors a `subscriptions` row. Plus `cancelSubscription` (sets `cancel_at_period_end`).
- `app/api/webhooks/stripe/route.ts` — now handles `customer.subscription.created/updated/deleted`, syncing `status` / `current_period_end` / `cancel_at_period_end` onto the `subscriptions` row.
- `components/portal/parent/AutoPaySetup.tsx` (new) + `app/portal/parent/page.tsx` — parent portal lists paid enrolled classes with "Set up monthly auto-pay" (card captured via the shared `CheckoutForm`) and a cancel action for active auto-pay. Page now fetches `subscriptions` + class `price_cents` and renders `<AutoPaySetup>`.

### Priority 4 — Sibling discount logic (Phase 3.3) ✅
- `supabase/migrations/0015_sibling_discount.sql` (new) — adds `sibling_discount_pct int (0–100, default 0)` to `studios`.
- `app/portal/parent/enroll/actions.ts` — `createEnrollmentIntent` now reads `studios.sibling_discount_pct`; if the family already has ≥1 OTHER student with an `active` enrollment, it applies the % discount to both the invoice `amount_cents` and the Stripe PaymentIntent `amount`.
- `app/portal/admin/settings/actions.ts` — added `updateSiblingDiscount` (admin-guarded, Zod 0–100).
- `components/admin/AdminSettings.tsx` + `app/portal/admin/settings/page.tsx` — new "Billing" section with the sibling-discount field; page now selects + passes `sibling_discount_pct`.

### Migrations to apply (in order): 0012, 0013, 0014, 0015
### TypeScript: Clean build (`tsc --noEmit` → no errors)

---

## ✅ SESSION 7 — COMPLETE (2026-06-16)

Closed out all four carried-over priorities from Session 6. Clean `tsc --noEmit`.

### New shared infrastructure
- `lib/supabase/admin.ts` (new) — `createAdminClient()` service-role client (bypasses RLS). For webhook + cron handlers only; requires `SUPABASE_SERVICE_ROLE_KEY`.
- `lib/currency.ts` (new) — single source of truth: `CURRENCY` (`nzd`), `CURRENCY_CODE`/`CURRENCY_LOCALE`, `GST_RATE` (0.15), `formatMoney(cents)`, `gstComponentCents(gross)`.
- `app/api/webhooks/stripe/route.ts` — `getServiceSupabase()` now uses `createAdminClient()` when `SUPABASE_SERVICE_ROLE_KEY` is set (falls back to anon in dev).

### Priority 1 — Time-based notifications (Phase 4.3) ✅
- `supabase/migrations/0016_cron_notifications.sql` (new) — adds `profiles.birthday`; **fixes the latent 0008 `notify_enrollment_confirmed` trigger** (was `new.user_id` + `status='enrolled'`; now `new.student_id` + `status='active'`, studio_id read off the enrollment row). Enrollment-confirmed notifications now actually fire.
- `app/api/cron/notifications/route.ts` (new) — GET, service-role. Generates `class_reminder` (active enrollees of classes scheduled tomorrow, deduped per user/class/day), sweeps `sent` invoices past due → `overdue` (fires the 0008 invoice trigger), and `birthday_greeting` (profiles whose birthday is today, deduped). Auth via `CRON_SECRET` Bearer token (or `?secret=`), fails closed in prod.
- `app/api/webhooks/stripe/route.ts` — added `invoice.payment_failed` → marks our matching invoice `overdue` + inserts a `payment_failed` notification (resolves recipient via `subscriptions` then `invoices`).
- `vercel.json` (new) — daily cron `0 8 * * *` → `/api/cron/notifications`.
- `.env.local.example` — documented `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET`.

### Priority 2 — Recurring groups in the UI ✅
- `app/portal/admin/classes/page.tsx` — `ClassRow` gains `recurringGroupId`; fetched alongside `price_cents` from the base `classes` table.
- `components/admin/classes/ClassesManager.tsx` — "↻ Series" badge on grouped classes; delete dialog offers "Delete the entire recurring series" (wired to `deleteRecurringGroup`); button label switches to "Delete series".

### Priority 3 — Admin subscription management ✅
- `app/portal/admin/subscriptions/page.tsx` + `components/admin/subscriptions/SubscriptionsManager.tsx` (new) — studio-wide subscriptions table (plan, payer, student, amount, status badge, next charge), active-count + monthly-recurring summary cards, status filter.
- `app/portal/admin/subscriptions/actions.ts` (new) — `adminCancelSubscription(stripeSubId, immediate)` (admin-guarded; cancel-at-period-end or immediate).
- `components/portal/PortalShell.tsx` — added **Subscriptions** nav item.

### Priority 4 — Currency / GST unification ✅
- Standardised studio-wide on **NZD** (matches NZ GST + `en-NZ` locale + `html lang`).
- All Stripe charges now use `CURRENCY` (`nzd`): enrollment intent, subscriptions price + row, shop checkout, events purchase, payments/create-intent.
- All display formatters now NZD: ParentShop, AutoPaySetup, EventsTickets, admin ShopManager, admin EventsManager (previously `en-AU`/AUD). ClassesManager price uses `formatMoney`.
- `createEnrollmentIntent` now stamps `invoices.gst_cents` via `gstComponentCents(chargeCents)` (15% inclusive).

### Migrations to apply: 0016
### Env to set: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`
### TypeScript: Clean build (`tsc --noEmit` → no errors)

---

## ✅ SESSION 8 — COMPLETE (2026-06-16)

Closed out all four carried-over priorities from Session 7. Clean `tsc --noEmit`.

### Priority 1 — Per-studio timezone for the cron ✅
- `supabase/migrations/0017_studio_timezone.sql` (new) — adds `studios.timezone text not null default 'Pacific/Auckland'` (IANA name).
- `app/api/cron/notifications/route.ts` — rewritten to be timezone-aware. Fetches all studios + their timezone, computes each studio's local `today`/`tomorrow`/`mm-dd` via `Intl.DateTimeFormat` (`localDateInfo` helper, falls back to UTC for an invalid tz). Class reminders now match each class against its studio's local *tomorrow* weekday; the overdue sweep groups studios by their local date and runs one `<due_date` update per distinct date; birthdays match each profile against its studio's local *today*. Dedup floor stays UTC-midnight (cron runs once daily).
- `app/portal/admin/settings/actions.ts` — new `updateStudioTimezone` (admin-guarded; Zod validates the IANA name via `Intl.DateTimeFormat`).
- `components/admin/AdminSettings.tsx` + `app/portal/admin/settings/page.tsx` — new "Localization" section with a timezone `<select>` (common IANA list; keeps any current non-listed value). Page now selects + passes `timezone`.

### Priority 2 — Mirror subscription invoices into `invoices` ✅
- `app/api/webhooks/stripe/route.ts` — `invoice.paid` now: (1) tries to finalise an existing `invoices` row by `stripe_invoice_id` (one-off flow, unchanged); (2) if none matched AND the Stripe invoice has a `subscription`, looks up our `subscriptions` row and inserts a NEW per-charge `invoices` row (status `paid`, `gst_cents` via `gstComponentCents`, stamped with `stripe_invoice_id` + `stripe_payment_intent_id`) **plus** a `payments` row. Idempotent: skips if a row with that `stripe_invoice_id` already exists. (Subscription PaymentIntents carry no `invoice_id`/`order_id`/`event_id` metadata, so `payment_intent.succeeded` ignores them — no double-count.)

### Priority 3 — Reusable Stripe Product/Price per class ✅
- `supabase/migrations/0018_class_stripe_price.sql` (new) — adds `classes.stripe_product_id`, `stripe_price_id`, `stripe_price_cents`.
- `app/portal/parent/subscriptions/actions.ts` — new `getOrCreateClassPrice()` creates one reusable Stripe Product + monthly Price per class and caches the ids on the `classes` row; if the tuition changed since the cached Price was minted (`stripe_price_cents !== priceCents`) it mints a fresh (immutable) Price and updates the cache. `createEnrollmentSubscription` now subscribes with `items: [{ price: priceId }]` instead of inline `price_data` + throwaway Product.

### Priority 4 — Soft-cancel enrollments + sibling discount coverage ✅
- `lib/discounts.ts` (new) — single source of truth for the sibling discount: `siblingDiscountInfo()` (returns `{ applies, pct, discountedCents }`) + `siblingDiscountedCents()` wrapper.
- `app/portal/parent/enroll/actions.ts` — `createEnrollmentIntent` now calls `siblingDiscountedCents()` (inline block removed).
- `app/portal/parent/subscriptions/actions.ts` — sibling discount now also applies to **auto-pay subscriptions**. Reusable Prices are immutable, so the family discount is applied via a reusable forever percent-off Stripe **coupon** (`getOrCreatePercentCoupon`, stable id `olune-sibling-<pct>pct`) attached with `discounts: [{ coupon }]`. The mirrored `subscriptions.amount_cents` + `plan_label` reflect the discounted figure.
- `app/portal/admin/students/actions.ts` — new `dropEnrollment()` soft-cancel: sets `status='dropped'` (instead of hard delete), which fires the 0012 waitlist auto-promote trigger. Re-enrolling later goes through `enrollStudent`'s upsert (unique-constraint-safe).
- `components/admin/students/StudentsManager.tsx` — enrollment rows now show **Drop** (soft, amber) alongside **Remove** (hard delete, red), with tooltips.

### Migrations to apply (in order): 0017, 0018
### TypeScript: Clean build (`tsc --noEmit` → no errors)

---

## ✅ SESSION 9 — COMPLETE (2026-06-16)

Closed out all four carried-over priorities from Session 8. Clean `tsc --noEmit`.

### Priority 1 — Family discount for shop & events ✅
- **Decision:** extending the tuition sibling discount to merch/tickets is a separate business call, so it's **opt-in per studio** (off by default), not automatic. Shop orders and event tickets aren't tied to a specific student, so the new helper keys off "buyer has ≥1 active-enrolled student" instead of the sibling-exclusion rule.
- `supabase/migrations/0019_family_retail_discount.sql` (new) — adds `studios.family_discount_on_retail boolean not null default false`.
- `lib/discounts.ts` — new `familyDiscountInfo(supabase, studioId, buyerId, priceCents)`: applies `sibling_discount_pct` only when the studio opted in AND the buyer has an active enrollment. Same `SiblingDiscount` shape.
- `app/api/shop/checkout/route.ts` — applies `familyDiscountInfo` to the order total before creating the order + PaymentIntent.
- `app/api/events/purchase/route.ts` — applies `familyDiscountInfo` to the ticket charge (free-check + Stripe amount + reserved row all use the discounted `totalCents`).
- `app/portal/admin/settings/actions.ts` — new `updateFamilyRetailDiscount` (admin-guarded, Zod boolean).
- `components/admin/AdminSettings.tsx` + `app/portal/admin/settings/page.tsx` — new "Also apply to shop & event tickets" checkbox in the Billing section (optimistic toggle, reverts on failure); page selects + passes `family_discount_on_retail`.

### Priority 2 — Stripe Price/Product archival hygiene ✅
- `app/portal/parent/subscriptions/actions.ts` — `getOrCreateClassPrice` now archives the previous Price (`stripe.prices.update(old, { active: false })`) when minting a fresh one after a tuition change. Existing subscriptions keep billing on the old Price object. Non-fatal on failure.
- `app/portal/admin/classes/actions.ts` — new `archiveClassStripeProducts()` helper; `deleteClass` and `deleteRecurringGroup` capture `stripe_product_id`(s) before deletion and archive the Stripe Product(s) afterward (archiving a Product also deactivates its Prices). Non-fatal on failure.

### Priority 3 — Pay-to-confirm hygiene: sweep unpaid reservations ✅
- **Decision:** kept reserve-then-pay semantics but added an automated release sweep rather than switching to pay-to-confirm (less disruptive to existing flows).
- `app/api/cron/sweep-unpaid/route.ts` (new) — GET, service-role, `CRON_SECRET`-auth (fails closed in prod). Grace window default 2h (`?hours=N`, 1–168). For each stale reservation it re-checks the PaymentIntent (skips if `succeeded`/`processing`), then: `orders` `pending` → cancel PI + set `cancelled`; `event_tickets` `reserved` → cancel PI + delete row (frees `sold_tickets` via the 0009 sync trigger); `invoices` `sent` w/ a `stripe_payment_intent_id` → reads PI metadata (`student_id`+`class_id`, present only for enrollment reservations), cancels the PI, drops the held enrollment (`status='dropped'` → fires the 0012 waitlist auto-promote trigger), voids the invoice. Generic owed invoices (no enrollment metadata) are left untouched.
- `vercel.json` — added hourly cron `0 * * * *` → `/api/cron/sweep-unpaid`.

### Priority 4 — Webhook idempotency ledger ✅
- `supabase/migrations/0020_stripe_event_ledger.sql` (new) — `stripe_events` table (id text PK = Stripe `event.id`, type, received_at). RLS enabled, no policies → service-role only.
- `app/api/webhooks/stripe/route.ts` — after signature verification, inserts `event.id` into `stripe_events`. Unique-violation (`23505`) → replay: ack 200 and short-circuit. Any other ledger error (e.g. table not yet migrated) is logged and processing continues (fail-open so a missing migration doesn't drop events).

### Migrations to apply (in order): 0019, 0020
### Env (no new vars): the sweep cron reuses `SUPABASE_SERVICE_ROLE_KEY` + `CRON_SECRET` + `STRIPE_SECRET_KEY`.
### TypeScript: Clean build (`tsc --noEmit` → no errors)

---

## ✅ SESSION 10 — COMPLETE (2026-06-16)

**New direction (Tasman):** ship per-studio website editability ASAP — clients build their own fully-custom public pages. **Decision (Tasman, via clarifying Q):** **custom block system** (no 3rd-party page builder — max control, zero external dependency, fully decoupled from the portal) + **full multi-page** site builder. Built the foundation + a working end-to-end vertical slice. Clean `tsc --noEmit`.

### Architecture
- The public website is entirely separate from the authenticated portal: a page is an ordered array of content **blocks** stored as JSON, rendered on the public host route with the studio's existing branding tokens. Nothing in billing/scheduling/webhooks imports it, so functionality is untouched.

### DB + block model
- `supabase/migrations/0021_site_pages.sql` (new) — `site_pages` (studio_id, slug, title, blocks jsonb, status draft|published, is_home, show_in_nav, nav_label, nav_order, seo_title, seo_description). Partial unique index = one home per studio. RLS: admin full access; **anon read of published pages** (so logged-out prospects see the site).
- `lib/site/blocks.ts` (new) — single source of truth: `BlockType` union, per-type **default props** + **field schema** (drives the editor's auto-generated forms), `BLOCK_LIBRARY`/`BLOCK_MAP`, `makeBlock`, `normalizeBlocks`. 9 block types: hero, richText, features, classGrid (data-driven), gallery, testimonials, cta, faq, contact.
- `lib/site/props.ts` (new) — typed accessors (`str/num/bool/list`) so block components read loose JSON props without `any`.
- `lib/site/queries.ts` (new) — public reads: `getPublishedHome`, `getPublishedPage`, `getNavLinks`, `getSiteClasses`.

### Public rendering + routing
- `components/site/BlockRenderer.tsx` (new) — server component rendering all 9 block types with branding tokens; `classGrid` reads pre-fetched classes from context (no fetching inside the renderer).
- `components/site/SiteChrome.tsx` (new) — public header (logo/name + nav from published pages + Sign in) and footer.
- `components/site/PublicSite.tsx` (new) — assembles branding + nav + classes + blocks.
- `app/page.tsx` — studio home now renders the published `is_home` page if one exists; **falls back** to the old branded Hero otherwise (no regression for studios that haven't built a site).
- `app/[siteSlug]/page.tsx` (new) — catch-all sub-pages (`/about`, etc.) with `generateMetadata` (SEO title/description). Static routes (`/portal`, `/login`, `/enrol`, `/onboarding`, `/programmes`, `/api`) take precedence; unknown slugs `notFound()`.

### Admin editor (`/portal/admin/site`)
- `app/portal/admin/site/actions.ts` (new) — `createPage`, `updatePageMeta`, `savePageBlocks` (server-side `normalizeBlocks` validation), `publishPage`/`unpublishPage`, `setHomePage` (demote-then-promote for the partial unique index), `deletePage`. Admin-guarded, Zod-validated, slugified with a RESERVED_SLUGS guard.
- `app/portal/admin/site/page.tsx` + `components/admin/site/SiteManager.tsx` (new) — page list with create (incl. "create as homepage"), publish/unpublish, set-home, delete-with-confirm, and Edit links.
- `app/portal/admin/site/[pageId]/page.tsx` + `components/admin/site/PageEditor.tsx` (new) — the visual editor: drag-to-reorder block list (`@hello-pangea/dnd`), add-block menu from `BLOCK_LIBRARY`, **auto-generated inspector** from each block's field schema (scalar + list fields w/ add/remove/reorder items), **live preview** via `BlockRenderer` (mock classes), page-settings drawer (title/slug/nav/SEO), Save draft + Publish.
- `components/portal/PortalShell.tsx` — added **Website** nav item.

### Also fixed (pre-existing latent type errors surfaced by the fuller recheck)
- `components/portal/PortalShell.tsx` — `usePathname()` is `string | null` in Next 15 → `pathname={pathname ?? ""}` at both call sites.
- `app/login/page.tsx` — `useSearchParams()` is nullable → `useSearchParams()?.get("next")`.
- (These were hidden by the TS incremental cache; the new files forced a full recheck. Build is now genuinely green from a cold `--incremental false` run.)

### Migrations to apply: 0021
### TypeScript: Clean build (`tsc --noEmit --incremental false` → no errors)

---

## ✅ SESSION 11 — COMPLETE (2026-06-16)

Closed out Session 10's Priority 1 (image uploads) + Priority 2 (starter homepage). Clean `tsc --noEmit --incremental false`.

### Priority 1 — Image uploads for the site builder ✅
- `supabase/migrations/0022_site_images_storage.sql` (new) — creates the **public** `site-images` storage bucket (idempotent upsert) + RLS on `storage.objects`: public read of the bucket; insert/update/delete restricted to the studio's own admins (`current_user_role()='admin'` AND first path segment = `current_studio()`). Files are namespaced `site-images/<studio_id>/<random>.<ext>`.
- `app/portal/admin/site/upload-actions.ts` (new) — `createSiteImageUploadUrl(contentType, sizeBytes)`: admin-guarded server action that validates the MIME type (jpg/png/webp/gif/svg/avif) + size (≤8 MB), mints a **signed upload URL** via the service-role admin client, returns `{ path, token, publicUrl }`. Bytes never pass through the Next server — the browser uploads straight to Storage.
- `components/admin/site/ImageInput.tsx` (new) — reusable upload-or-paste control: thumbnail preview, Upload/Replace/Remove buttons, manual-URL fallback input. Uploads via the browser client's `uploadToSignedUrl(path, token, file)`. Surfaces validation/upload errors inline.
- `components/admin/site/PageEditor.tsx` — inspector now renders `<ImageInput>` for `type:"image"` fields, both **scalar** (hero background) and **list items** (gallery images). Other field types unchanged.

**Decision:** signed-upload URL (service-role) over direct authenticated-client upload — works even if the storage-RLS DDL in 0022 can't be applied in a given environment (the signed token authorises the write). The RLS policies are defence-in-depth + enable a direct-upload fallback.

### Priority 2 — Starter homepage template ✅
- `app/portal/admin/site/actions.ts` — new `createStarterHomepage()`: admin-guarded; refuses if a homepage already exists; seeds a draft `is_home` page with the default block stack **hero → features → classGrid → testimonials → cta → contact** (built via `makeBlock`, so each block carries its sensible default props). `show_in_nav=false` (home isn't a nav item).
- `components/admin/site/SiteManager.tsx` — when the studio has no homepage, a prominent "Create starter homepage" banner calls the action and routes straight into the editor. Empty-state copy updated.

### Migrations to apply: 0022
### Env: no new vars (reuses `SUPABASE_SERVICE_ROLE_KEY` for the signed-upload mint).
### TypeScript: Clean build (`tsc --noEmit --incremental false` → no errors)

---

## ✅ SESSION 12 — COMPLETE (2026-06-17)

Closed out Session 10/11's Priority 1 (site-builder polish) and Priority 2 (image management niceties). Clean `tsc --noEmit --incremental false`.

### Priority 1 — Site builder polish ✅
- **(a) Move up/down + (b) Duplicate** — `components/admin/site/PageEditor.tsx`: each block row now has ↑ / ↓ (disabled at ends), ⧉ duplicate (inserts a deep-cloned copy right after, fresh id, auto-selected), and ✕ delete — alongside the existing drag handle (mobile-friendly). New `moveBlock`/`duplicateBlock` handlers; `cloneBlock` added to `lib/site/blocks.ts`.
- **(c) Unsaved-changes guard** — `beforeunload` listener while `dirty` (tab close / reload / external nav) **plus** a `confirm()` on the "← Pages" back link (router pushes don't fire `beforeunload`).
- **(d) Per-block background/spacing** — content blocks (richText, features, classGrid, gallery, testimonials, faq, contact) flagged `appearance: true`. Shared `APPEARANCE_FIELDS` (`_bg`: page / surface / brand-tint; `_spacing`: compact / normal / spacious) render in a new "Appearance" inspector section. `BlockRenderer` wraps those blocks in `<BlockShell>` applying the bg (`bg-surface` / brand `color-mix` tint) + vertical padding. `APPEARANCE_DEFAULTS` preserves each block's original look; `makeBlock` seeds new blocks, `PageEditor.seedAppearance` seeds DB blocks that predate the feature. Hero & CTA keep bespoke banner styling (no shell).
- **(e) richText links/lists** — `BlockRenderer.renderRichBody` is a tiny dependency-free markdown-lite parser: blank-line paragraphs, `- `/`* ` bullets, `1. ` numbered lists, `**bold**`, `[text](url)` links (external → `target=_blank rel=noopener`). Default body copy + field help document the syntax.
- **New field type:** `select` (with `options`) added to the block field schema + rendered as `<select>` (used by appearance + richText alignment).

### Priority 2 — Image management ✅
- **(a) next/image** — `next.config.ts` sets `images.remotePatterns` for the Supabase Storage public host (derived from `NEXT_PUBLIC_SUPABASE_URL`, path `/storage/v1/object/public/**`). Gallery images render via a new `FillImage` helper: `next/image` (`fill` + `sizes`) for our Storage host, plain `<img>` fallback for arbitrary pasted external URLs (not in `remotePatterns`, so optimisation would 500 on them).
- **(b) Orphan cleanup** — new `deleteSiteImage(publicUrl)` server action (`upload-actions.ts`): admin-guarded, **only** deletes when the object lives under the caller's own `<studioId>/` namespace (foreign / external URLs are no-ops). `ImageInput` calls it best-effort on **replace** (after the new upload succeeds) and on **remove**.
- **(c) Client-side downscale** — `ImageInput.maybeDownscale` downscales raster uploads (jpeg/png/webp) to ≤1920px longest edge via `createImageBitmap` + canvas (q 0.85) before upload; SVG/GIF and already-small images pass through; any failure falls back to the original file.

### Files touched
- `lib/site/blocks.ts` — `select` field type + `SelectOption`; `BlockDef.appearance`; `APPEARANCE_FIELDS` + `APPEARANCE_DEFAULTS`; `cloneBlock`; `makeBlock` seeds appearance; richText default copy/help; `appearance: true` on 7 content blocks.
- `components/site/BlockRenderer.tsx` — `BlockShell`, `renderInline`/`renderRichBody`, `FillImage` (+ `next/image`), all 7 content blocks wrapped in `BlockShell`; removed the old `SECTION` constant.
- `components/admin/site/PageEditor.tsx` — move/duplicate/guard handlers + row buttons; appearance section + `select` rendering; `seedAppearance`.
- `components/admin/site/ImageInput.tsx` — downscale + replace/remove cleanup.
- `app/portal/admin/site/upload-actions.ts` — `deleteSiteImage` + `bucketPathForStudio`.
- `next.config.ts` — `images.remotePatterns`.

### Migrations: none this session.
### TypeScript: Clean build (`tsc --noEmit --incremental false` → no errors).

---

## ✅ SESSION 13 — COMPLETE (2026-06-17)

Closed out Session 12's Priority 1 (templates beyond the homepage) and Priority 2 (richText toolbar). Clean `tsc --noEmit --incremental false`.

### Priority 1 — Site templates beyond the homepage ✅
- `lib/site/templates.ts` (new) — single source of truth for page templates. `PageTemplate` type (meta + ordered block recipe with per-block prop overrides) + `buildTemplateBlocks()` (turns a recipe into real `Block`s via `makeBlock`, so each block still gets its defaults + appearance props, then applies defined overrides). Pure data — no server-only imports, safe on client + server.
  - **3 home themes:** `home-classic` (the old starter stack: hero → features → classGrid → testimonials → cta → contact), `home-showcase` (image-led: bold hero → classGrid → gallery → testimonials[tint] → cta → contact), `home-minimal` (hero → richText[spacious, centered] → classGrid → cta).
  - **3 sub-page templates:** `page-about` (hero → richText → features → testimonials → cta), `page-classes` (hero → classGrid[limit 24] → faq → cta), `page-contact` (hero → contact → faq). Each carries title/slug/navLabel/showInNav + SEO title/description.
  - Exports `SITE_TEMPLATES`, `TEMPLATE_MAP`, `HOME_TEMPLATES`, `PAGE_TEMPLATES`.
- `app/portal/admin/site/actions.ts` — new `createPageFromTemplate(templateId)` (admin-guarded; one-home-per-studio guard for home templates; slugify + RESERVED_SLUGS check for sub-pages; seeds meta + blocks; 23505 → friendly "already exists"). `createStarterHomepage()` kept as a thin backward-compatible alias → `createPageFromTemplate("home-classic")`. Removed the old inline `STARTER_STACK`.
- `components/admin/site/SiteManager.tsx` — replaced the single "Create starter homepage" banner with a **"Choose a homepage style"** 3-card grid (shown only when no homepage exists) + an always-visible **"Add a page from a template"** grid (About/Classes/Contact). New `TemplateCard` presentational component; `onUseTemplate(id)` routes straight into the editor on success. Empty-state copy updated.

### Priority 2 — richText editor toolbar ✅
- `lib/site/blocks.ts` — `FieldDef` gains an optional `toolbar?: boolean`; set `toolbar: true` on the richText `body` field.
- `components/admin/site/PageEditor.tsx` — new `RichTextArea` component rendered for `textarea` fields flagged `toolbar`. Selection-aware toolbar: **B** (wraps selection in `**…**`), **🔗 Link** (inserts `[text](url)` and drops the caret over the URL), **• List** / **1. List** (prefix every selected line with `- ` / `N. `). Caret/selection is restored after the controlled re-render via a `pendingSel` ref + `useEffect`. Inserts the exact markdown-lite syntax `BlockRenderer.renderRichBody` already parses (no renderer change needed). Textarea switched to monospace for legible syntax. Plain `textarea` path unchanged for non-toolbar fields.

### Migrations: none this session (templates live entirely in the existing `blocks` JSON; toolbar is editor-only).
### TypeScript: Clean build (`tsc --noEmit --incremental false` → no errors).

---

## ✅ SESSION 14 — COMPLETE (2026-06-17)

Tackled the billing items carried from Session 9/12 P3: **admin-initiated Stripe refunds** (with stock/capacity restore) and **revenue-by-source reporting + MRR**. Clean `tsc --noEmit --incremental false`.

### Priority 1 — Admin-initiated Stripe refunds ✅
- `supabase/migrations/0023_refunds.sql` (new) — adds `refunded_at`, `refund_amount_cents`, `stripe_refund_id` to `invoices`, `orders`, `event_tickets`; adds `stripe_refund_id` to `payments`. New `restock_on_order_refund()` trigger restores `products.stock_qty` when an order flips `paid → refunded` (mirror of the 0010 decrement trigger). Event-ticket capacity needs no new trigger — the 0009 `sync_event_sold_tickets` already only counts `reserved`/`paid`, so a `refunded` ticket frees the seat automatically. Adds `'refunded'` as a valid `invoices.status` (the column is free-text).
- `app/portal/admin/billing/refund-actions.ts` (new) — `refundSale(kind, id, amountCents?)`: admin-guarded + studio-scoped. Loads the sale (invoice/order/ticket; ticket studio resolved via `events!inner`), guards `status='paid'` + not-already-refunded + has a PaymentIntent, issues `stripe.refunds.create` (supports partial via `amountCents`), flips the row to `refunded` (fires the triggers), and records a **negative** `payments` ledger row (idempotent on `stripe_refund_id`). If Stripe succeeds but the DB update fails it surfaces the reconciliation gap rather than swallowing it.
- `app/api/webhooks/stripe/route.ts` — new `charge.refunded` case reconciles **dashboard-initiated** refunds: matches the local row by `stripe_payment_intent_id` across invoices→orders→tickets, flips to `refunded`, inserts the negative ledger row. Idempotent on `stripe_refund_id` (no double-count with the admin action).
- `components/admin/billing/BillingDashboard.tsx` — `Refund` button on every paid invoice row (confirm dialog, inline error, optimistic row→refunded), new `refunded` status badge + filter option. (Order/ticket refunds use the same `refundSale` action; UI buttons in ShopManager/EventsManager are a quick follow-up — see next session.)

### Priority 2 — Revenue-by-source reporting + MRR ✅
- `app/portal/admin/billing/page.tsx` — now fetches trailing-12-month paid **invoices** (tuition + auto-pay mirror), paid **orders** (merch), paid **event_tickets** (events), and active **subscriptions**. Computes a `SourceBreakdown` + normalised **MRR** (yearly plans ÷ 12). Refunded rows leave `paid` status so they're netted out automatically. Added `stripePaymentIntentId` to `InvoiceRow` so the refund button only shows when a card payment exists.
- `BillingDashboard` — new **MRR** stat card (`N active auto-pay`) + a **"Revenue by source"** stacked bar (Tuition / Merchandise / Events) with per-segment legend + 12-month total.

### Migrations to apply: 0023
### Env: no new vars (refunds reuse `STRIPE_SECRET_KEY`; webhook reconciliation needs the `charge.refunded` event enabled on the Stripe endpoint).
### TypeScript: Clean build (`tsc --noEmit --incremental false` → no errors)

---

## ✅ SESSION 15 — COMPLETE (2026-06-18)

Closed out Session 14's Priority 1 — **refund buttons in ShopManager + EventsManager**. Clean `tsc --noEmit --incremental false`.

### Refund button — ShopManager (orders) ✅
- `app/portal/admin/shop/page.tsx` — orders query now also selects `stripe_payment_intent_id`.
- `components/admin/shop/ShopManager.tsx` — `Order` interface gains `stripe_payment_intent_id`; `recentOrders` prop is now held in local state (`orders`) so a refund can flip the row optimistically. New `OrderRefundButton` (mirrors `BillingDashboard.RefundButton`): shows only for `paid` orders with a PaymentIntent, confirm dialog, inline error, calls `refundSale("order", id)` → `markOrderRefunded`. Added a trailing Actions column to the recent-orders table (header + cell; colspan bumped 4→5).

### Refund button — EventsManager (per-ticket) ✅
- **Design:** EventsManager only loaded event-level rows, so refunds operate on individual tickets via a new per-event ticket viewer (reuses the pre-existing-but-unused `viewTickets` state).
- `app/portal/admin/events/actions.ts` — new `getEventTickets(eventId)` server action (admin-guarded, studio-scoped via `events!inner(studio_id)`; joins `profiles!event_tickets_user_id_fkey` for the buyer name) + exported `TicketRow` type.
- `components/admin/events/EventsManager.tsx` — new **Tickets** button on every event row (upcoming + past) opens a right-hand slide-over that lazy-loads tickets, lists buyer / qty / amount / date / status, and shows a `TicketRefundButton` (only for `paid` tickets w/ a PaymentIntent) calling `refundSale("ticket", id)` → `markTicketRefunded`. Loading + error + empty states handled. Ticket status badge map added.

### Notes
- Both buttons issue **full** refunds (no partial UI yet — `refundSale` still accepts `amountCents` if a partial input is added later). Stock restore (orders, via 0023 trigger) and seat release (tickets, via 0009 sync trigger) happen automatically when the row flips to `refunded`.
- No migration this session; reuses migration 0023 (refund columns) which must already be applied.

### TypeScript: Clean build (`tsc --noEmit --incremental false` → no errors)

---

## ✅ SESSION 16 — COMPLETE (2026-06-18)

Tackled NEXT-SESSION Priority 1: stood up an automated **test harness** and built the **EMAIL/SMS delivery layer**. Clean `tsc --noEmit --incremental false`; `npm test` → 36 passing.

### Part A — Vitest test harness ✅
- **Packages installed:** `vitest@2.1.9` (devDependency). No jsdom — tests are pure-function / mocked-Supabase, Node environment only.
- `vitest.config.ts` (new) — Node env, `include: tests/**/*.test.ts`, `@/*` alias mirrors tsconfig (→ repo root) so test imports match app imports.
- `package.json` — added `"test": "vitest run"` + `"test:watch": "vitest"`.
- `tests/helpers/supabaseMock.ts` (new) — minimal chainable Supabase mock: `.from(table)` returns a builder that is chainable (every filter returns `this`), awaitable (resolves to the table's `list` response — drives `.in()/.eq()` count queries + plain selects), and exposes `.single()`. Lets the discount helpers run every branch with zero DB.
- **24 money-flow unit tests:**
  - `tests/currency.test.ts` — `formatMoney` (incl. nullish guard), `gstComponentCents` (15% inclusive math + rounding), currency constants.
  - `tests/branding.test.ts` — `derivePalette` (hot/deep derivation + lightness clamp on near-white), `brandingToCssVars` (full var set, light vs dark surfaces), `getBranding` (defaults fallback + snake_case→shape mapping, via the mock).
  - `tests/discounts.test.ts` — `siblingDiscountInfo` + `familyDiscountInfo` + `siblingDiscountedCents`: every branch (free class, pct 0, no siblings/kids, siblings-not-active, applies + rounding, retail opt-in gate).

### Part B — EMAIL/SMS notification delivery ✅
- **Decision:** delivery is a **separate outbound fan-out** over the existing `notifications` rows (the in-app row already exists the moment a trigger/cron creates it). A new deliver-cron flushes un-delivered rows. Providers use **REST via `fetch`** (Resend for email, Twilio for SMS) — **no new SDK dependencies**. Everything **no-ops gracefully** when keys are unset, so dev/test environments are unaffected.
- `supabase/migrations/0024_notification_delivery.sql` (new) — adds `delivered_at`, `email_sent_at`, `sms_sent_at`, `delivery_attempts` (default 0), `delivery_error` to `notifications` + a partial index over the un-delivered queue. No RLS change (deliver cron is service-role).
- `lib/notify/config.ts` (new) — single place that reads delivery env; `getEmailConfig`/`getSmsConfig` (null when unset) + `isEmailConfigured`/`isSmsConfigured`.
- `lib/notify/messages.ts` (new, **pure/IO-free**) — `channelsForType(type)` routing (class_reminder + waitlist_promoted → email+SMS; enrollment_confirmed/payment_failed/invoice_overdue/birthday_greeting → email; message_received + unknown → in-app only), `renderNotificationEmail` (HTML-escaped, abs-link CTA via `NEXT_PUBLIC_APP_URL`), `renderNotificationSms` (joined + 320-char truncation).
- `lib/notify/providers.ts` (new, server-only) — `sendEmail` (Resend `POST /emails`) + `sendSms` (Twilio `POST /Messages.json`, Basic auth). Discriminated `SendResult`: `{ok}` / `{ok:false,skipped:true}` (not configured) / `{ok:false,error}`.
- `app/api/cron/deliver-notifications/route.ts` (new) — GET, service-role, `CRON_SECRET`-auth (fails closed in prod), `?limit=N` (default 200). Pulls `delivered_at is null` oldest-first, resolves recipient email/phone in one `profiles` query, sends per `channelsForType`. Terminal (mark delivered) when: no outbound channels, no recipient address, or provider unconfigured (skipped). Real send errors stay queued and retry up to `MAX_ATTEMPTS=3`, then give up keeping the last error. Returns a per-run summary.
- `vercel.json` — added `*/15 * * * *` cron → `/api/cron/deliver-notifications`.
- `.env.local.example` — documented `NEXT_PUBLIC_APP_URL` (for abs links) + optional `RESEND_API_KEY`/`RESEND_FROM` + `TWILIO_ACCOUNT_SID`/`TWILIO_AUTH_TOKEN`/`TWILIO_FROM`.
- **12 delivery unit tests** (`tests/notify.test.ts`) — channel routing, email render (escaping, abs link, no-link CTA omission), SMS render (join + truncation), config gates (require ALL keys).

### Migrations to apply: 0024
### Env (optional — delivery no-ops without them): `NEXT_PUBLIC_APP_URL`, `RESEND_API_KEY`, `RESEND_FROM`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`
### TypeScript: Clean build (`tsc --noEmit --incremental false` → no errors). Tests: `npm test` → 36 passing.

---

## ✅ SESSION 17 — COMPLETE (2026-06-18)

Advanced NEXT-SESSION Priority 1 by doing its DB-free half: **extracted the Stripe webhook's branch-selection + Stripe-object normalisation into a pure, fully unit-tested helper module.** No live DB needed, so this was the right slice to land autonomously. Clean `tsc --noEmit --incremental false`; `npm test` → **58 passing** (was 36; +22 new).

### Pure webhook helpers ✅
- `lib/webhooks/stripe-events.ts` (new, **pure / IO-free**) — extracts every *decision* the webhook route made inline:
  - `classifyPaymentIntent(meta)` → discriminated `PaymentIntentTarget` (`invoice` / `order` / `ticket` / `none`). Encodes the route's precedence (invoice → order → ticket), the `supabase_user_id ?? user_id` payer fallback, and treats empty/whitespace metadata strings as absent so a stray `invoice_id=""` can't shadow a real `order_id`.
  - `expandedId(ref)` → id from a Stripe expandable reference (string | `{id}` | null). Backs `subscriptionIdFromInvoice`, `paymentIntentIdFromInvoice`, and the refund PI lookup — replaces the four hand-rolled `typeof x === "string" ? … : x?.id ?? null` ladders.
  - `invoiceAmountCents(inv)` → `amount_paid ?? total ?? 0` (preserves a real `0`).
  - `subscriptionStatusFor(eventType, sub)` → `deleted` ⇒ `"canceled"`, else mirror status; `subscriptionPeriodEndEpoch` / `subscriptionPeriodEndIso` → top-level `current_period_end` with the newer per-item fallback.
  - `refundDescriptor(charge)` → `{ paymentIntentId, refundId (charge.id fallback so the idempotency key is always defined), refundedCents }`.
- `app/api/webhooks/stripe/route.ts` — refactored all five `case` blocks to call the helpers. **Behaviour-preserving** (same DB writes, same log lines, same precedence); the route now reads as persistence-only.
- `tests/webhooks.test.ts` (new) — **22 tests** covering every branch: classification precedence + payer fallback + empty-string guard + `none`; `expandedId` string/object/null/empty; invoice normalisers incl. the `amount_paid: 0` edge; subscription status mapping; period-end top-level vs item-level vs null vs ISO; refund descriptor incl. expanded PI, charge-id fallback, and missing PI.

### Notes / decisions
- **Why not the rest of Priority 1 (true integration tests):** webhook idempotency replay, refund netting + restock/seat-release triggers, and waitlist auto-promotion all exercise **SQL triggers**, which need a live Postgres/Supabase — unavailable in this autonomous sandbox. Extracting the pure logic (the route's explicit follow-up) was the verifiable slice; the trigger-level tests still need a disposable Supabase + seed script next.
- **Why not Priority 3 (partial-refund UI) this session:** `refundSale` already accepts `amountCents`, but a partial refund flips the row to `refunded`, and `billing/page.tsx` nets revenue by *excluding refunded rows* (`.eq("status","paid")`) rather than subtracting `refund_amount_cents`. Shipping the partial UI without first reworking that netting would silently drop the **full** sale from revenue + the monthly chart on any partial refund — a financial-reporting bug. Netting rework must land first (see Priority 3 below).

### Migrations to apply: none this session.
### Env: no new vars.
### TypeScript: Clean build (`tsc --noEmit --incremental false` → no errors). Tests: `npm test` → 58 passing.

---

## ✅ SESSION 18 — COMPLETE (2026-06-18 – 2026-06-19)

Platform operator console, studio onboarding extensions, and production hardening.

### Platform admin console (migration 0026) ✅
- `/platform` — cross-tenant overview, studios directory, owners directory, support inbox, ops tasks board, feature flags, announcements, platform settings, audit log.
- `scripts/seed-platform-admin.mjs` — seeds platform test admin; wired into GitHub Actions DB workflow.

### Studio setup (migrations 0031–0032) ✅
- Post-onboarding `/setup` wizard — guided studio setup with progress tracking (`setup_progress`).
- OAuth profile names (0030), site page background (0029), light theme default (0028), studio member registration (0027).

### Security & build hardening ✅
- RLS migrations (0039, 0047–0048) — initplan fixes, policy consolidation, security linter remediation.
- Production build fixes — lazy Stripe init, ParticleBackground client wrapper, `outputFileTracingRoot`.
- Canonical `APP_URL` normalization for OAuth (email, Xero, Meta/TikTok callbacks); `www` prefix for `.co.nz` apex domains.

### Migrations to apply: 0026–0032, 0039
### Tests: expanded to ~125 unit tests across site builder, Xero, email, app-url, parent archive, etc.

---

## ✅ SESSION 19 — COMPLETE (2026-06-19)

Email inbox, Xero accounting, billing hub depth, and parent CRM.

### Connected email inbox (migrations 0033–0035) ✅
- Admin + parent email views; Gmail/Microsoft/iCloud via IMAP/OAuth; sync cron (`/api/cron/sync-email`).
- Parent email archive — known-parent emails copied to independent parent portal copies (0035).

### Xero integration (migration 0036) ✅
- `/portal/admin/accounting` — OAuth connect, invoice sync, reports; `docs/XERO_SETUP.md`.

### Billing & subscriptions ✅
- Admin billing hub refinements; subscription plans (0038); invoice overdue notify fix (0037).
- Admin parent profiles — family management, billing, messaging (0040–0042 guardian relationships).

### Advertising hub (migration 0041) ✅
- Meta/TikTok OAuth, AI ad generation, SEO audits at `/portal/admin/advertising`.

### Migrations to apply: 0033–0038, 0040–0042, 0041

---

## ✅ SESSION 20 — COMPLETE (2026-06-19)

Site-wide i18n, office role, staff management, and observability.

### Site-wide i18n (migration 0043) ✅
- `next-intl` — English, French, Italian, Russian across public site + portal (`messages/{en,fr,it,ru}/`).
- `preferred_locale` on profiles; `LanguageSwitcher` component.

### Office role + staff (migrations 0045–0049) ✅
- New `office` role — front-desk dashboard at `/portal/office`; scoped admin access to parents/students/leads/classes/messages.
- Staff management — HR records, shift calendar at `/portal/admin/staff` (0046).
- Office client-ops RLS via `is_studio_admin()` (0049); waiver signatures policy consolidation (0044).

### Observability & UX ✅
- Vercel Speed Insights on root layout.
- Public site hover prefetch + loading states.

### Migrations to apply: 0043–0049

---

## ✅ SESSION 21 — COMPLETE (2026-06-21)

Engineering hygiene — CI, lint cleanup, docs sync.

### CI workflow ✅
- `.github/workflows/ci.yml` — runs `npm test`, `npm run typecheck`, `npm run lint` on PRs + pushes to `main`.
- `package.json` — added `"typecheck": "tsc --noEmit --incremental false"`.

### ESLint cleanup ✅
- Fixed `react/no-children-prop` — renamed parent-portal `children` data prop to `familyChildren` (`ParentHub`, `EnrollModal`, parent page).
- Batch `<a>` → `<Link>` in marketing, onboarding, login, programmes, admin settings.
- Triage `react-hooks/exhaustive-deps` in site builder (`PageEditor`, `WebsiteSetupWizard`).
- Removed `eslint.ignoreDuringBuilds` from `next.config.ts` — lint now gates production builds.

### Documentation ✅
- `README.md` — migrations 0001–0049, features list, CI section.
- `OLUNE_PROGRESS.md` — Sessions 18–21 captured (this entry).

### Migrations to apply: none this session.
### TypeScript: Clean. Tests: `npm test` → 125 passing. Lint: zero warnings/errors.

---

## ✅ SESSION 22 — COMPLETE (2026-06-21)

Public `/enrol` trial funnel — class picker + CRM lead capture.

### Public enrol flow ✅
- Rebuilt `/enrol` — two-step UI: discipline filter + class picker, then parent/child contact form.
- `app/enrol/actions.ts` — `submitTrialRequest` creates a `trial` lead with `source=enrol-page`.
- `lib/enrol/trial-request.ts` — pure name-split + notes builder (6 unit tests).
- `supabase/migrations/0050_public_enrol_leads.sql` — anon insert RLS for public trial requests.
- i18n updated for en/fr/it/ru; `EnrolNoStudio` fallback on marketing root.

### Migrations to apply: 0050
### Tests: `npm test` → 131 passing.

---

## ✅ SESSION 23 — COMPLETE (2026-06-21) · Build 1.5 Sole Traders

Independent instructor accounts for contractors who teach across multiple studios.

### Database (migration 0052) ✅
- `studios.kind` — `studio` | `instructor`
- `profiles.account_kind`, `profiles.active_studio_id`
- `studio_memberships` — multi-studio relationships with backfill from existing profiles
- `create_instructor_workspace_for_user` RPC
- Updated `create_studio_for_user`, `accept_studio_invite`, `register_studio_member` for instructor multi-membership
- Cross-studio teacher RLS on classes, enrollments, attendance, profiles, student_progress
- JWT hook derives role from active membership

### Onboarding system picker ✅
- New first step: Studio owner vs Independent instructor
- Branched copy + `create_instructor_workspace_for_user` → `/portal/teacher`
- `lib/account/kinds.ts`, `lib/account/memberships.ts`

### Teacher portal ✅
- Cross-studio schedule with studio badges on every class
- `/portal/teacher/affiliations` — list memberships + accept invite tokens
- Attendance uses class studio_id (not home workspace)

### Future sole-trader tools (roadmap)
- Private client roster, contractor invoicing, income dashboard, availability calendar, compliance vault, expense log, personal profile page, substitute board

### Migrations to apply: 0052
### Tests: membership helpers unit tests added

---

## ✅ SESSION 24 — COMPLETE (2026-06-21) · i18n coverage + advertising/site refactor

Full-locale UI coverage and a modular rebuild of the advertising hub and site editor.

### Internationalization ✅
- Completed i18n so **every** UI surface respects the selected locale — landing/marketing copy, portal sidebar, admin dashboard, billing, leads, subscriptions, office, staff, students, progress tracker, email inbox, messages, enrol funnel.
- Full `fr` / `it` / `ru` translation passes for landing, dashboard, sidebar, and the full admin portal.
- Fixed nav label collisions where marketing **section** keys overwrote flat labels (`e80d3a8`, `fd19978`).
- Dashboard locale resolved on the client via `StatData` label types (`b6aee34`, `45bab43`).

### Advertising hub modularization ✅
- Split the 695-line `AdvertisingHub` monolith into panels: `AdComposer`, `CampaignsPanel`, `ConnectHub`, `PlatformPreview`, `SeoPanel`, `AdvertisingOverview`, plus a `TelegramWizard`.
- Migration **0051** extends the `social_platform` enum with `telegram` for channel publishing.

### Site editor refactor ✅
- Broke up the 1033-line `BlockRenderer`; reworked `EditorBlockPreview` / `EditorCanvas` / `PageEditor`.

### Instructor affiliations ✅
- `/portal/teacher/affiliations` panel + actions; onboarding wizard branching for instructor workspaces (carry-over from Session 23).

### Migrations to apply: 0051
### Tests: `npm test` green; i18n is render-layer only.

---

## ✅ SESSION 25 — COMPLETE (2026-06-22) · Go-live platform

Self-service join, realtime messaging, and adult students who manage their own enrollment/billing.

### Join flow ✅
- Public `/join` — `JoinStudioFlow` + `app/join/actions.ts` let invited users attach to a studio without the full onboarding wizard.

### Realtime messaging ✅
- Migration **0055** adds `messages` to the `supabase_realtime` publication and makes `notify_message_received` role-aware (correct portal link per recipient role).
- `MessageStreamProvider` wires the admin Messages hub to live updates; parent + student message pages added.

### Adult student self-service ✅
- Migration **0056** adds `profiles.self_managed` + `is_self_managed_student()`; RLS lets adult students self-enroll, self-waiver, and self-bill (uses `private.current_studio()` after the 0048 refactor — see fix `9db35fa`).
- Parent hub gains `AddChildModal` + `PayInvoiceModal`; student portal gains self-enroll + own billing.

### Migrations to apply: 0055, 0056
### Tests: `npm test` green.

---

## ✅ SESSION 26 — COMPLETE (2026-06-22) · Build 1.5.1–1.5.3 hardening

Tenant-scoping fixes, admin delete flows, and CI/security hardening ahead of go-live.

### Tenant scoping (Build 1.5.1, migrations 0053–0054) ✅
- **0053** aligns `private.current_studio()` with the JWT hook — RLS now scopes to `active_studio_id` first, falling back to `studio_id`.
- **0054** restricts the public catalog policies (`classes`, `events`) to **anon only** — closes a leak where a logged-in admin could read every studio's catalog rows; authenticated portal users go through studio-scoped policies.
- Admin delete flows: `DeleteStudentButton`, staff delete actions, schedule-builder edits.
- Fixed portal login by disambiguating profiles→studios embeds (`683e819`); fixed font loading via Google Fonts CSS instead of the `next/font` registry (`c77dd04`).

### Security audits (Builds 1.5.2, 1.5.3) ✅
- **1.5.2** — dependency patches; auth-gated the Xero status endpoint.
- **1.5.3** — eliminated the remaining `postcss` vulnerability; repo hygiene (`.gitignore`, lockfile trim).

### CI / infra ✅
- Pinned **Node 22.x** for Vercel, CI, and local (`.nvmrc`).
- CLI-free migration verifier (`scripts/verify-migrations.mjs`) wired into CI sync checks; `npm run db:verify`.
- Enforce full production sync on every `main` push (`defdca8`); fixed seed scripts hanging in Node 20 CI (ws transport, Realtime disabled in seed).

### Migrations to apply: 0053, 0054
### Tests: `npm test` green; `npm run staging:verify` passes Phase 0.

---

## 🔄 NEXT SESSION — Start here

> **Migration frontier:** local + remote are at **0056**. Per `STAGING_AUDIT.md`, staging
> `wnoxcwihrzbxvogvmhqv` had 0001–0050 applied as of 2026-06-21 — **0051–0056 still need to be
> applied to staging** (run `npm run db:status` / `npm run db:verify` to confirm before treating
> any feature as live there).

### Priority 1: Staging / production readiness (ops — needs dashboard access)
- **Apply migrations 0051–0056** to staging Supabase (`npm run db:push:remote` or dashboard), then `npm run db:verify`.
- **Replace placeholder Stripe keys** with real test/live keys and configure the webhook endpoint (`charge.refunded` enabled). This is the **last blocker** for all payment flows — everything else is wired.
- **Confirm Vercel env mirrors production:** `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, Stripe keys, `NEXT_PUBLIC_APP_URL`, `RESEND_*` / `TWILIO_*`, Xero/advertising encryption keys.
- **Seed test data** (`TEST_ACCOUNTS.md`) and re-run the smoke matrix in `STAGING_AUDIT.md`.

### Priority 2: Integration tests for money flows (carried from Session 17)
- Webhook idempotency replay (`stripe_events` 23505), refund netting + restock triggers, waitlist auto-promotion (0012 trigger).
- Harness exists under `tests/integration/` but skips without a service-role key + migrated DB; pure helpers in `lib/webhooks/stripe-events.ts` are ready to compose. Run `npm run test:integration` with `INTEGRATION_TEST=1`.

### Priority 3: Partial-refund revenue netting + UI
- `refundSale()` currently flips the row to `refunded` even for a partial refund, so netting treats a partial as a full removal. Subtract `refund_amount_cents` before exposing a partial-refund UI in the dashboard buttons. **Most self-contained code win.**

### Priority 4: Public `/enrol` paid enrollment (optional upgrade)
- ✅ Trial lead capture + class picker shipped (Session 22). Optional next: Stripe checkout for paid trial classes on the public page (depends on Priority 1 Stripe keys).

### Priority 5: Notification delivery — verify end-to-end + preferences
- Delivery cron + Resend/Twilio are wired (Session 16). On staging, trigger an enrollment → `deliver-notifications` cron → confirm `email_sent_at` / `sms_sent_at` stamping. Then add per-user/per-studio delivery preferences (routing is still global per type).

### Priority 6: Sole-trader tooling (from Session 23 roadmap)
- Private client roster, contractor invoicing, income dashboard, availability calendar, compliance vault, expense log, personal profile page, substitute board.

### Priority 7: Optional polish
- richText WYSIWYG (Session 13 carry-over); template live thumbnails; `next build` in CI with stub env vars.

---

## ⚠️ Known Decisions / Notes
- `addStudent` in students/actions.ts inserts a `profiles` row without a linked `auth.users` row. Production should call Supabase Edge Function with service-role key → `supabase.auth.admin.inviteUserByEmail()`.
- ✅ Card capture is now wired (Session 5) — EnrollModal, ParentShop, and EventsTickets all use `components/payments/CheckoutForm.tsx`. Paid flows now actually charge the card via Stripe PaymentElement; the webhook finalises invoice/order/ticket on `payment_intent.succeeded`.
- Stripe webhook + the notifications cron now use `createAdminClient()` (`lib/supabase/admin.ts`) when `SUPABASE_SERVICE_ROLE_KEY` is set; the webhook falls back to the anon key in dev. **Set `SUPABASE_SERVICE_ROLE_KEY` in production** — the cron route requires it and will 500 without it.
- `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` + `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env vars must be set before billing/shop/events/enrollment-payment features work. The publishable key is required client-side for the PaymentElement to render.
- Currency inconsistency: shop/events/enrollment PaymentIntents all charge `aud`, but EnrollModal's summary uses the `en-NZ`/NZD `Intl` formatter and the invoices table comments mention NZ GST. Pick one currency studio-wide and align display + charge + GST before production.
- The ScheduleBuilder slots are hardcoded to 3:30–7:30pm. Update `SCHEDULE_SLOTS` in `types.ts` if Tasman's studio uses different hours.
- Live messages are a Supabase Realtime `postgres_changes` subscription opened by the browser in `MessageStreamProvider` — the `/api/messages/stream` SSE relay it used to go through has been removed. Ensure Supabase Realtime is enabled on the `messages` table in the Supabase dashboard (Database → Replication → `messages`); without it the client subscribes and silently receives nothing.
- Notification bell polling interval is 60s. For more real-time behaviour, wire it to the SSE stream too.
- Migration `0011_student_progress.sql` must be applied to Supabase before the progress tracker works.
- Paid event tickets / shop orders / enrollments are reserved on PaymentIntent creation and confirmed by the webhook on `payment_intent.succeeded`. With the PaymentElement now wired, the card is actually charged, so the webhook fires once Stripe CLI / endpoint is configured. To test locally: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` and use test card `4242 4242 4242 4242`.
- `EventsTickets`/`ParentShop`/`EnrollModal` reveal success (QR / "Order confirmed" / "Enrolled") on the client `confirmPayment` success. The DB row is promoted to `paid` asynchronously by the webhook — if the webhook is down the user still sees success but the row stays `reserved`/`sent`. Consider polling the row or showing "payment processing" until the webhook confirms for stricter UX.
- `CheckoutForm` uses `redirect: "if_required"`, so redirect-based payment methods (some 3DS / bank redirects) need a `return_url`. Currently none is set — if you enable such methods, add `confirmParams.return_url` in `components/payments/CheckoutForm.tsx`.
- **Session 6 — migrations 0012–0015 must be applied to Supabase** before waitlist auto-promotion, recurring classes, subscriptions, and sibling discounts work.
- Waitlist auto-promotion fires off the existing **hard-DELETE** unenroll path (and any status change away from `active`). ✅ **Session 8** added a soft-cancel `dropEnrollment` (`status='dropped'`) which also fires the trigger; re-enrolling a dropped row uses `enrollStudent`'s `upsert` (the `(student_id, class_id)` unique constraint blocks a plain re-insert).
- ✅ **Fixed (Session 8):** auto-pay subscriptions now reuse one Stripe Product + Price per class (cached on `classes.stripe_product_id`/`stripe_price_id`/`stripe_price_cents`, migration 0018) instead of minting a throwaway Product per subscription. A tuition change mints a fresh immutable Price; the old Price is left unreferenced but **not archived** (see next-session Priority 2).
- ✅ **Fixed (Session 8):** subscription recurring invoices ARE now mirrored — `invoice.paid` for subscription invoices inserts per-charge `invoices` + `payments` rows (idempotent on `stripe_invoice_id`).
- Sibling discount triggers when the paying guardian already has ≥1 OTHER child with an `active` enrollment. ✅ **Session 8** extracted it to `lib/discounts.ts` and extended it to auto-pay **subscriptions** (via a reusable percent-off coupon). It still does NOT apply to shop orders or event tickets.
- ✅ **Fixed (Session 7):** the latent `0008` `notify_enrollment_confirmed` trigger (referenced non-existent `new.user_id`, guarded by `status='enrolled'`) is rewritten in `0016` against `new.student_id` + `status='active'`; enrollment-confirmed notifications now fire.
- Currency is unified to **NZD** studio-wide (charges + display + GST). Migration `0016` must be applied (adds `profiles.birthday`, fixes the enrollment trigger).
- ✅ **Fixed (Session 8):** the cron (`/api/cron/notifications`) is now **per-studio timezone-aware** (migration 0017 adds `studios.timezone`; settable in admin Settings → Localization). The 08:00-UTC cron computes each studio's local today/tomorrow for reminders, birthdays and overdue sweeps.
- **Session 8 — migrations 0017 + 0018 must be applied to Supabase** before per-studio timezones and reusable class Prices work.
- ✅ **Session 10 (site builder):** per-studio public websites are a **custom block system** (Tasman's choice over Puck/Builder.io — no external dependency). Pages = JSON block arrays in `site_pages` (migration **0021**). Public render at `/` (home) + `/[siteSlug]`; admin editor at `/portal/admin/site`. The public site is fully decoupled — no portal/billing code imports it. Studios with no published homepage fall back to the old branded Hero, so there's no regression. **Apply migration 0021** before the Website tab works. Block image fields are URL-only for now (Storage upload is next-session Priority 1).
- ✅ **Session 9:** sibling/family discount now optionally extends to shop orders + event tickets via the per-studio opt-in `family_discount_on_retail` (migration 0019, toggle in admin Settings → Billing). Off by default. Uses `familyDiscountInfo` in `lib/discounts.ts` ("buyer has an active-enrolled student"), distinct from the enrollment-specific `siblingDiscountInfo`.
- ✅ **Session 9:** stale Stripe Prices are archived when tuition changes (`getOrCreateClassPrice`), and per-class Products are archived on class/series delete. All non-fatal — Stripe failures only `console.warn`.
- ✅ **Session 9:** new hourly sweep `/api/cron/sweep-unpaid` releases abandoned reservations (pending orders, reserved tickets, unpaid enrollment invoices) after a grace window (default 2h, `?hours=N`). It re-checks each PaymentIntent before acting so in-flight/succeeded payments are never released. **Reserve-then-pay is still the model** — this is cleanup, not pay-to-confirm.
- ✅ **Session 9:** Stripe webhook is now idempotent via the `stripe_events` ledger (migration 0020). Replays short-circuit with 200. **Fail-open:** if the ledger table is missing (un-migrated env), the handler logs and still processes — so apply 0020, but a missing migration won't silently drop events.
- **Session 9 — migrations 0019 + 0020 must be applied to Supabase** before the retail discount toggle and webhook idempotency ledger work.
- ✅ **Session 11:** site-builder `image` fields now upload to Supabase Storage (public `site-images` bucket, migration **0022**) via a service-role **signed upload URL** (`app/portal/admin/site/upload-actions.ts`) — admin-guarded, MIME + 8 MB validated, files namespaced `site-images/<studio_id>/<file>`. The inspector's `<ImageInput>` does upload-or-paste with a preview. **Apply migration 0022** and ensure `SUPABASE_SERVICE_ROLE_KEY` is set before image upload works (without the key the control shows "uploads not configured" and the manual-URL field still works). Images are `<img>` (not `next/image`) for now — see next-session Priority 2 for optimisation + orphan cleanup.
- ✅ **Session 11:** studios with no homepage get a one-click **"Create starter homepage"** (`createStarterHomepage`) that seeds a full draft block stack; publish to go live.
- ✅ **Session 12 (site polish):** blocks now support move ↑/↓, duplicate, and per-block appearance (`_bg` / `_spacing`, content blocks only — hero/CTA excepted). richText body is **markdown-lite** (paragraphs, `-`/`1.` lists, `**bold**`, `[links](url)`). Editor warns on unsaved navigate-away. **No migration** — `_bg`/`_spacing` live inside the existing `blocks` JSON; old blocks are seeded with their original defaults on load so there's no visual change until edited.
- ✅ **Session 14 (refunds):** `refundSale()` always flips the row to `refunded` even for a partial refund (`amountCents < total`), so source-revenue netting treats a partial refund as a full removal. If partial refunds become common, switch to subtracting `refund_amount_cents` rather than excluding by status. **Apply migration 0023** and enable the `charge.refunded` event on the Stripe webhook endpoint so dashboard-initiated refunds reconcile.
- ✅ **Session 12 (images):** gallery uses `next/image` **only** for our Supabase Storage host (configured in `next.config.ts` `images.remotePatterns`, derived from `NEXT_PUBLIC_SUPABASE_URL`); arbitrary pasted URLs fall back to plain `<img>` (they're not allow-listed, so optimising them would 500). Replacing/removing an uploaded image now deletes the old object (`deleteSiteImage`, scoped to the studio's own namespace), and raster uploads are downscaled to ≤1920px client-side before upload. **If you change Supabase projects, no code change needed** — the host is read from env at build.
- ✅ **Session 16 (tests):** `npm test` runs Vitest (`vitest.config.ts`, Node env, `tests/**/*.test.ts`, `@/*` alias). Current coverage is **pure-logic only** — discounts, currency/GST, branding, and notification routing/render — via a chainable Supabase mock (`tests/helpers/supabaseMock.ts`). Webhook/refund/waitlist **integration** tests still need a live DB (next-session Priority 1). Tests are excluded from the Next build (they live under `tests/`, not `app/`).
- ✅ **Session 16 (EMAIL/SMS delivery):** outbound delivery runs off the existing `notifications` rows via `/api/cron/deliver-notifications` (15-min Vercel cron, service-role, `CRON_SECRET`). Routing per type in `lib/notify/messages.ts` (`channelsForType`); providers are **REST `fetch`** — Resend (email) + Twilio (SMS), **no SDK deps** — and **no-op when keys are unset**. **Apply migration 0024** (delivery columns on `notifications`). Set `NEXT_PUBLIC_APP_URL` (for absolute links) + `RESEND_API_KEY`/`RESEND_FROM` + `TWILIO_*` to actually send; without them in-app notifications are unaffected and rows are marked delivered (skipped). Routing is **global per type** — no per-user opt-out yet (next-session Priority 2). Real send errors retry up to 3 cron passes before giving up.
