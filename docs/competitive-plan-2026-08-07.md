# Olune — Doing Everything They Do, Better

**Date:** 7 August 2026
**Competitors trawled:** Jackrabbit Class (7,000+ clients, $49–$245/mo, student-count tiered) · Studio Pro (6,000+ studios, $49/$79/$165 flat, unlimited students)
**Companion docs:** `MARKET_READINESS.md` (operational maturity) · `docs/feature-completion-plan-2026-08-07.md` (feature integrity)

---

## Context

A feature diff against both incumbents found 6 gaps that lose deals and ~17 that lose feature-checklist comparisons. It also found that Olune already carries a set of capabilities neither competitor has: Xero-native accounting, Stripe Connect per studio, a real website builder with domain provisioning, NFC check-in with Apple Wallet, a unified email inbox, five locales, and an instructor marketplace.

So this is not a catch-up plan. The shape of the opportunity is:

- **Their strengths are old.** Jackrabbit's staff portal, time clock and activity calendar are excellent and fifteen years old. Studio Pro's "Robo-" automation suite is their entire premium tier. Both are reachable in weeks, not quarters.
- **Their weaknesses are structural.** Jackrabbit charges by student count (penalises growth) and sells the mobile app as a $44/mo upsell. Studio Pro reaches Xero *through Zapier* and gates two-way SMS behind a $165 tier. Neither can retrofit what Olune has.

The plan below is organised so that every parity item is built on infrastructure Olune already has, and each one ships with a specific reason it beats the incumbent version rather than matching it.

**Hard rule:** none of this starts before Waves 1–2 of `feature-completion-plan-2026-08-07.md` are done. Shipping new surfaces on top of features that lie about what they do makes the problem worse, not better.

---

## The seven workstreams

| # | Workstream | Closes | Effort | Depends on |
|---|---|---|---|---|
| 1 | Instructor surface — PWA, offline roll call, time clock, payroll | Their #1 and #2 gaps | ~4 wks | Cron cadence (D1) |
| 2 | Automation engine + two-way SMS | Studio Pro's entire Elite tier | ~4 wks | Cron cadence (D1) |
| 3 | Distribution — embed widget, migration wizard, SaaS billing | Can't be adopted / can't be paid | ~4 wks | — |
| 4 | Scheduling depth — venues, appointments, self-serve makeups | Jackrabbit Activity Calendar | ~3 wks | — |
| 5 | Events depth — seating, gating, sizing, volunteers | Studio Pro Recital Wizard | ~3 wks | — |
| 6 | Skills & curriculum | Jackrabbit skill tracking | ~2 wks | WS2 (auto-emails) |
| 7 | Reporting & AI insights | Jackrabbit Enterprise BI | ~3 wks | WS4 (utilisation needs rooms) |

---

## Workstream 1 — The instructor surface

**What they have.** Jackrabbit's Staff Portal is one screen holding schedule, attendance, availability, skills, lesson plans, resources, and a time clock with hour types (regular/OT/holiday/sick/vacation/PTO), location and department per entry, a manager approval queue, actual-vs-scheduled comparison, estimated gross pay, and export to Express Payroll / QuickBooks / CSV. It costs nothing extra. Studio Pro ships a free native Manager app and a free Parent app. Jackrabbit sells its branded app at +$44/mo.

**What we have.** Roll call, availability, substitutes, private lessons, messages, progress — already in `/portal/teacher`. Plus `staff_members` and `staff_shifts` (`0046`), and an NFC tap reader at `/api/checkin/tap` writing `building_taps` (`0103`). No time clock at all: staff pay is the free-text `staff_members.pay_notes`. No manifest, no service worker; `public/` holds three hero video files.

### 1a. PWA + offline roll call

- `app/manifest.ts` (Next metadata route), icon set, `display: standalone`, scoped to `/portal`.
- Service worker: app-shell precache + an IndexedDB write-behind queue.
- **Architectural call:** `markAttendance` is a server action (`app/portal/teacher/actions.ts:19`) and server actions don't replay cleanly from a service worker. Add a thin `POST /api/attendance` carrying the same Zod schema and the same three authorisation checks, and have both the action and the SW replay call one shared function. Do not duplicate the auth logic.
- Reuse the same queue for the event ticket scanner (A2) and the class pass scanner — recital night in a venue with no signal is the exact scenario.
- Conflict rule: last-write-wins per `(class_id, student_id, date)`, which the existing upsert already gives us. Surface a "synced N minutes ago" indicator rather than hiding it.

**Better how:** installable, works with no signal, and free. Jackrabbit's equivalent is a browser page, and its app is an upsell.

### 1b. Time clock

New migration (`~0117_staff_time_clock.sql`):

- `staff_time_entries` — `studio_id`, `staff_id`, `entry_date`, `clock_in_at`, `clock_out_at`, `hour_type` enum (`regular|overtime|holiday|sick|vacation|unpaid`), `location_name`, `department`, `source` enum (`manual|portal|nfc`), `approved_by`, `approved_at`, `note`.
- `staff_pay_rates` — `staff_id`, `effective_from`, `rate_cents`, `currency`. Supersedes `pay_notes` as the source of truth; keep the notes field.
- RLS: reuse `public.is_studio_admin()` from `0046`, plus a self-read/self-insert policy mirroring `staff_members_self_read`.

Surfaces: clock in/out on the teacher portal home; an approval queue on `/portal/admin/staff`; scheduled-vs-actual variance rendered against `staff_shifts`, which we already have and Jackrabbit had to build separately.

**Better how — two leapfrogs:**

1. **Clock in by tapping the reader.** The NFC infrastructure already exists for students. Issue staff a card, `/api/checkin/tap` writes a `staff_time_entries` row with `source='nfc'`. No competitor can do this; it removes the single biggest source of time-clock fraud and the single biggest source of "I forgot to clock in".
2. **Push timesheets to Xero Payroll, not just CSV.** We hold a deep Xero OAuth connection (19 files in `lib/xero/`). Jackrabbit exports to QuickBooks and Express Payroll — both US-only. Xero Payroll covers NZ, AU and UK, which is our market and their blind spot.

---

## Workstream 2 — The automation engine

**What they have.** Studio Pro's Elite tier ($165/mo) is Lead Center workflows, trial→enrolment automation, Robo-mailer / Robo-text / Robo-dial, campaigns, landing pages, and a centralised two-way SMS inbox on a studio-owned number with 3,000 texts/mo. Jackrabbit auto-emails on skill progression and declined payments.

**What we have.** The whole substrate and none of the product: `notifications` with delivery tracking, retry counts and error capture (`0008`, `0024`); per-user per-type opt-out (`0071`); Resend + Twilio with per-studio credentials (`lib/notify/`); and `OluneEventType` in `lib/integrations/events.ts` — already the exact trigger vocabulary an automation engine needs.

### 2a. Sequences

New migration:

- `automation_sequences` — `studio_id`, `name`, `trigger_type`, `trigger_filter jsonb`, `active`.
- `automation_steps` — `sequence_id`, `position`, `delay_minutes`, `channel` (`email|sms|inapp|task`), `subject`, `body`.
- `automation_runs` — `sequence_id`, `subject_id`, `subject_type`, `current_step`, `next_run_at`, `state`. This is the runtime; index on `(state, next_run_at)`.

Extend `OluneEventType` with `lead.created`, `trial.booked`, `attendance.missed`, `term.ending`, `student.inactive`. The trigger list *is* the product surface — it's what a studio owner reads when deciding whether this can replace their spreadsheet.

**Architectural call — the thing that makes this cheap:** automations do not send anything. `/api/cron/run-automations` drains due runs and writes `notifications` rows. Delivery, per-type opt-out, retry, delivery audit and the notification bell all come for free from the pipeline that already exists. Building a second sending path would be the mistake here.

**Better how:** Studio Pro gates this at $165/mo. It's also the cheapest switching cost available — once a studio has built a trial drip and a recital countdown inside Olune, leaving means rebuilding all of it. `MARKET_READINESS.md` already identifies this as the highest-leverage moat item; the competitive read confirms it.

### 2b. Two-way SMS

- `POST /api/webhooks/twilio/sms` — validate the Twilio signature, match `From` against profile phone numbers within the studio, write into the existing `messages` table.
- Add a `channel` column to `messages` (`inapp|sms|email`) and render channel per bubble.
- Per-studio number provisioning: `lib/notify/providers.ts` already supports per-studio Twilio credentials; add purchase-a-number to the Connections hub.

**Better how:** Studio Pro runs a *separate* SMS inbox. Ours lands in the same thread as in-app messages and the email archive, keyed by family, using the topic model from `0065`. One conversation per family regardless of how they replied. That's a genuinely better design, not a feature-tick.

### 2c. Hard dependency

`vercel.json` runs every cron **once daily**. An automation step with a 15-minute delay that fires up to 24 hours later isn't a slow feature, it's a broken one. **D1 (cron cadence) must land before WS1 reminders, WS2, and the makeup notifications in WS4.** Vercel Pro sub-daily crons, QStash, or Supabase `pg_cron` — pick one and do it first.

---

## Workstream 3 — Distribution

Three things that gate whether any of the rest can be sold.

### 3a. Embeddable class listings + registration

Jackrabbit's "Online Integration" drops live listings and a registration form into whatever site the studio already has. We built a whole website builder — better, but it assumes the studio will replace a site they may like. That's an objection at the worst moment in a sales call.

- `app/embed/[slug]/classes/page.tsx` — self-contained, iframe-able, `X-Frame-Options` relaxed for this route only.
- A `<script>` loader that injects a sized iframe.
- Reuse `getSiteScheduleClasses` from `lib/public-classes.ts` and the tenant-scoped public catalogue RLS (`0054`) — the read path already exists.

**Better how:** the embed inherits the studio's `website_configs` colours and fonts, so it matches the host site instead of looking like a bolted-on iframe from another vendor.

### 3b. Migration wizard (B7)

Both competitors export CSV; Jackrabbit advertises free data imports and Studio Pro answers "can my students be imported" as a headline FAQ. We have generic CSV import in `lib/setup/{csv-file,parsers}.ts`.

Add per-competitor column-mapping presets — Jackrabbit family/student/class exports, Studio Pro's equivalents — with a preview-and-confirm step, plus a dry-run that reports what would be created before anything is written.

**Better how:** theirs is a support ticket and a queue. Ours is self-serve inside the setup wizard at 11pm on a Sunday, which is when studio owners actually do this.

### 3c. SaaS billing (B1)

Neither the plan nor the pricing exists. Both competitors have published pricing, self-serve signup and free trials (Studio Pro 30 days, Jackrabbit a 90-day money-back guarantee).

- Plan tiers wired to `lib/verticals/modules.ts` — the 21-module entitlement system already exists and is wired to nothing commercial. This is mostly plumbing.
- Olune-side Stripe subscription per studio, trial expiry, dunning, grace period, `/pricing`, upgrade/downgrade with proration.

**Better how — the pricing model is itself a competitive weapon.** Jackrabbit prices on student count, so a studio pays more every time it succeeds; studios resent it and say so in reviews. Studio Pro is flat but bundles crudely (two-way SMS only at $165). Our module system supports flat-and-modular: unlimited students always, pay for the capabilities you switch on. Lead with "we don't charge you for growing."

---

## Workstream 4 — Scheduling depth

**What they have.** Jackrabbit's Activity Calendar prevents double-booking of rooms *and* instructors, and its Appointments product books private lessons, room rentals, tours and birthday parties against real availability, with fees posted at booking or at service. Parents self-serve makeup bookings against studio-set rules.

**What we have.** `classes.room` is free text. The `venues` module is declared in `lib/verticals/modules.ts` and has no routes and no tables. `private_lesson_bookings` (`0085`) handles one booking kind. `makeup_credits` and `student_absences` (`0078`) exist with no parent-facing booking flow.

- **Venues and rooms.** New tables, migrate `classes.room` text → `room_id` with a backfill. Conflict detection on `(room, weekday, time range)` and `(teacher, weekday, time range)`, enforced at write time, surfaced in the class form.
- **Appointments.** Generalise `private_lesson_bookings` with a `kind` (`private_lesson|room_rental|tour|party|assessment`) and an optional fee that posts to `invoices` at booking or at service. Jackrabbit is right that this is revenue-generating: it fills the gaps between classes.
- **Self-serve makeups.** Studio-set rules (booking window, max per term, eligible classes), then a parent booking UI over the existing `class_capacity` view. Small build, immediately visible in a demo.

**Better how:** multi-venue is table stakes for them and unbuilt for us — but doing it now means our room model is timezone-correct per studio from day one (`0017`), which theirs is not, and it unlocks the utilisation reporting in WS7 that Jackrabbit charges $245/mo for.

---

## Workstream 5 — Events depth

Studio Pro's Recital Wizard is their most-praised feature; testimonials cite $1,000 of admin time saved per recital. Our Production Wizard (`0076`) is comparable in ambition and arguably better built. Four gaps around it:

- **Assigned seating.** `event_seat_maps` + `event_seats`, seat assigned on ticket. Studio Pro charges to build the chart for you — make the editor good enough that nobody needs to.
- **Sale gating.** Parent-vs-public sale windows, and gate purchase on account paid-in-full. Small, and it's exactly what their testimonials call out ("you can require everyone to be completely paid in full in order to purchase tickets").
- **Costume sizing ("Robo-Sizer").** `student_measurements` + a size chart per costume → auto-assign size → ordering chart export. `student_costumes` already exists.
- **Volunteers.** Extend `event_crew` from `0076` with signup slots and a parent-facing signup surface.

**Better how:** our ticket QR is signed per-ticket (`qr_token`) with a real door scanner and, after WS1, an offline queue. Neither competitor scans offline, and recital venues are exactly where signal dies.

---

## Workstream 6 — Skills and curriculum

Jackrabbit: skills required per level, instructor tracking in class, a branded Skills Progress Report PDF, renameable progress labels, and automated parent emails on progression. Plus lesson plans and a staff resource library in the Staff Portal, and a curriculum partner (LEAP!).

We have `student_progress` (`0011`), certificate PDF generation (`lib/certificates/`, `pdf-lib`) and badges (`0088`).

- Skill sets scoped to level/programme, with progression gating.
- Branded progress report PDF — reuse the certificate generator.
- Auto-email on progression — a trigger into WS2, not a bespoke sender.
- Lesson plans + resource library on the teacher portal.

**Better how:** we already have badges and XP (`0088`). Jackrabbit sends the parent a PDF for the fridge; we can do that *and* award the badge, notify the family, and show the streak — provided A11 (automatic badge awarding) lands, which is already in the Wave 2 plan.

---

## Workstream 7 — Reporting and AI insights

Jackrabbit reserves its Business Intelligence dashboard (30+ multi-location KPIs) for the $245/mo Enterprise tier, plus staff login and portal-activity reports. Our reporting is Xero-backed financials and a dashboard widget grid.

The advantage here is that `0101_dashboard_layouts` already gives us a draggable, per-studio persisted widget grid. This is queries and widgets, not new UI framework.

KPI set: enrolment trend, retention/churn, class utilisation (needs WS4 rooms), attendance rate, revenue per class and per programme, student LTV, trial→enrolment conversion, lead-source conversion (the `0116` attribution work makes this possible).

Then **B4 — AI insights** on top: churn risk per family, under-filled classes worth merging, trial conversion drop-off. `lib/integrations/ai.ts` and per-studio BYO model keys already exist.

**Better how:** they sell a dashboard of numbers at $245/mo. We can ship the numbers at every tier and put a layer on top that says *which three families are about to leave and why* — a thing neither competitor has any path to.

---

## What we are deliberately not building

Carried forward from the completion plan and confirmed by the competitive read:

- **Paid ads APIs.** Meta Marketing + TikTok Ads + app review, so a studio can spend $50 boosting a post they could boost in the Instagram app in four taps.
- **Bank reconciliation.** Weeks of work to rebuild what Xero already does for our connected studios.
- **Merchant financing / next-day payout** (Jackrabbit Capital, Jackrabbit Pay). Balance-sheet products, not software.
- **Curriculum content.** Jackrabbit partners (LEAP!) rather than authoring. So should we.
- **A branded native app as a paid upsell.** The PWA covers the job. Charging +$44/mo for an app, as Jackrabbit does, is a worse offer than including it — say so in the pitch.

---

## Sequencing

Slotting into the existing waves. Waves 0–2 are unchanged and remain the prerequisite.

| Wave | Window | Contents |
|---|---|---|
| 0–2 | Aug–Sep | **Unchanged.** Feature integrity per `feature-completion-plan`. Nothing below starts first. |
| 3 | Oct | **D1 cron cadence** (blocks everything) → **WS1** PWA + offline roll call + time clock → **WS2a** sequences |
| 4 | Nov | **WS3** embed widget, SaaS billing, pricing page → **WS2b** two-way SMS → B5 data export, B6 MFA |
| 5 | Dec | **WS4** venues + appointments + makeups → **WS3b** migration wizard as a sales tool |
| 6 | Q1 | **WS5** events depth (ahead of recital season) → **WS6** skills → **WS7** reporting + AI insights |

Two deliberate re-orderings against the current plan:

- **Time clock pulled forward into Wave 3.** It wasn't on the roadmap at all. It's a small schema on tables that already exist, it's the largest single thing a competitor gives away free that we don't have, and the NFC tie-in makes it a demo moment rather than a checkbox.
- **Embed widget pulled forward into Wave 4.** It's roughly two days of work and it removes a live sales objection. It was on no list.

---

## Verification

Per workstream, before it counts as done:

- **WS1** — Playwright: roll call with the network disabled, then reconnect and assert the attendance row exists. Time clock: clock in via NFC tap and assert a `staff_time_entries` row with `source='nfc'`. Xero Payroll push against the Xero demo company.
- **WS2** — an integration test that runs a full sequence with a mocked clock, asserting one `notifications` row per step and that a user who has opted out of that type gets none. Twilio inbound: signature validation must reject an unsigned POST.
- **WS3** — embed rendered inside a third-party origin in a real browser. Billing: Stripe test-mode subscribe → trial expiry → dunning → downgrade, asserting module entitlements actually change.
- **WS4** — RLS isolation tests on every new table (per `MARKET_READINESS.md` §3.2); double-booking rejected at write time, not just hidden in the UI.
- **WS5** — seat map → purchase → QR → offline scan at the door, end to end.
- **WS7** — each KPI checked against a hand-computed figure on a seeded studio. A reporting number that's subtly wrong is worse than no number.

Standing gates for all of it: `tsc`, `eslint`, `npm run check:i18n` across all five locales, and `next build` — all already enforced in the `quality` CI job.

---

## The one-line version

Their moat is fifteen years of staff-portal polish and an automation suite behind a $165 paywall — both reachable in about eight weeks on infrastructure we already have. Ours is Xero, Stripe Connect, NFC, the site builder and five locales, none of which they can retrofit. Build the two things they'd charge us for, keep the five they can't copy, and stop charging studios for growing.
