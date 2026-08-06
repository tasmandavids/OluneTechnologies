# seed-demo-studio.mjs

Seeds a complete, realistic, fake **promotional demo studio** — "Aurora Dance
Collective" (Wellington, NZ, slug `aurora-dance`) — for product demos and
screenshots. Every person, email, and phone number is obviously fake and
lives under the `@auroradance.demo` domain, which cannot collide with a real
inbox.

## What it creates

- **Studio**: Aurora Dance Collective, `active`, Pacific/Auckland timezone,
  branding themed on the Aurora Glass violet (`#8B7CF0`), dark base.
- **People** (real `auth.users` + `profiles` rows, since `profiles` is 1:1
  with `auth.users` for every role including students):
  - 1 owner/admin — **Mia Sinclair** (`owner@auroradance.demo`) — this is the
    login meant for demoing the product.
  - 3 teachers across Ballet, Hip-Hop, and Contemporary/Jazz.
  - 9 parents with NZ-flavoured names.
  - 13 kid students in sibling groupings across mixed ages/levels, linked to
    their parent via `guardianships` (with `relationship` set).
  - 2 adult self-managed students (18+, no guardian, `self_managed = true`
    per `0056_adult_student_self_service.sql`).
- **Classes**: 7 across the week (Ballet Pre/Primary/Intermediate/Advanced,
  Hip-Hop Juniors/Teens, Contemporary & Jazz), varied capacity and rooms.
- **Enrollments**: mostly `active`, 2 `waitlisted` to exercise that state.
- **Waivers**: liability + photo/video consent, signed by guardians for every
  minor and self-signed by both adult students.
- **Invoices**: 14 total — 8 `paid` (this month), 4 `sent` (upcoming due),
  2 `overdue` — each with line items, and a `payments` row for every paid
  invoice. Includes one 3-installment **term payment plan**
  (`term_payment_plans` / `term_payment_plan_invoices`), installment 1 paid,
  2 more upcoming.
- **Class passes**: one purchased-and-unredeemed, one purchased-and-redeemed
  (`class_passes` is single-use per `0091_class_passes.sql` — there's no
  multi-credit "pack" concept in the schema, so this is the closest
  representation of "partially used").
- **Badges**: 9 awards pulled from the existing global badge catalogue
  (`badge_definitions`, seeded in `0089_badge_catalog_seed.sql`) — no new
  badge types invented.
- **NFC cards + building taps**: 7 students issued an active card, with a
  handful of realistic tap-in/tap-out pairs over the last few days (plus one
  student left "tapped in" with no tap-out yet).
- **Leads**: 3 prospective families across `new` / `contacted` / `trial`
  stages.
- **Messages**: 4 `parent_email_threads` / `parent_email_messages` threads
  between parents and the admin (read/unread mix). This uses the
  parent-portal message-archive tables rather than `email_accounts` /
  `email_threads`, because the latter models a *real connected inbox*
  (OAuth-style `credentials_encrypted`, a live Gmail/Microsoft/iCloud/Mail.ru
  sync) — there's no fake-but-valid way to populate that without a real
  provider connection, and it isn't what "internal messages between parents
  and admin" is describing anyway.
- **Website config**: one published `website_configs` row (the "Aria" split
  template, matching the studio's brand colour) with custom headline,
  tagline, eyebrow, and section visibility — so the public marketing site
  isn't blank.

## Running it

```
node --env-file=.env.local scripts/seed-demo-studio.mjs
```

Requires `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in
`.env.local` (same convention as `scripts/seed-platform-admin.mjs`).

## Idempotency

- **People** are found-or-created by email via the Supabase admin API and are
  never duplicated on rerun (matches `seed-platform-admin.mjs`'s pattern).
- **Everything else** is scoped entirely to this one studio's `studio_id`.
  Each run deletes that studio's existing rows for every dependent table
  (children before parents — taps before cards, line items before invoices,
  etc.) and reinserts fresh. This is a wipe-and-reseed rather than per-row
  upserts (there isn't a clean natural key to upsert most of these tables on
  given how many are involved), but the net effect is the same guarantee:
  rerunning the script never grows or duplicates the demo data.

The owner's password is freshly generated and reset on every run (printed at
the end) — the studio's data doesn't change, but the login credential does.
All other demo accounts share one fixed password, also printed at the end,
so you can log in as a teacher, parent, or student to demo those views too.
