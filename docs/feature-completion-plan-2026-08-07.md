# Olune — Feature Completion: Plan of Attack

**Date:** 7 August 2026
**Branch:** `ttest` · migration frontier **0111** (0109 and 0111 written, not applied)
**Scope:** every surface in `app/`, traced from the button a user presses to the code that runs when they press it.
**Companion doc:** `MARKET_READINESS.md` covers operational maturity (monitoring, legal, security). This one covers **features** — what's finished, what stops one step short, and what's UI over nothing.

---

## The headline

The feature surface is genuinely wide and most of it is genuinely wired. The audit found **no fabricated data** and **no fake dashboards** — where something isn't built, the code says so in a comment and the UI says "coming soon". That's rare and worth protecting.

What it did find is a different failure mode: **features that are 90% built and stop one step short of the moment they'd actually pay off.** A QR code nobody can scan. A domain wizard that goes green and still 404s. A "Send" that doesn't send. Individually each is a day of work. Collectively they're the difference between a demo and a product, because each one breaks at the exact moment a customer is depending on it.

Twelve of these are listed below, ordered by how badly they'd hurt.

---

## Progress — 7 August 2026

| Item | Status |
|---|---|
| A1 · Domain wizard never registered with Vercel | ✅ **Fixed** — `lib/vercel/domains.ts`, self-healing re-check, 14 tests |
| A2 · Ticket QR codes nobody could scan | ✅ **Fixed** — migration 0112, `/api/events/tickets/scan`, door scanner UI |
| A8 · Substitute requests notified nobody | ✅ **Fixed** — `lib/notify/substitutes.ts`, email + SMS, both directions |
| A4 · Ad "budget" that never spent | ✅ **Fixed** — field removed, surface renamed "Social posting", migration 0113 |
| A12 · QuickBooks / MYOB connect but never sync | ✅ **Fixed** — both marked `planned`, connect disabled |
| A5 · Ad creative was paste-a-URL, TikTok unreachable | ✅ **Fixed** — image + video upload, migration 0114 |
| A7 · No way to actually send a contractor invoice | ✅ **Fixed** — real email + admin notification, alongside "Mark sent" |
| A6 · Shop orders couldn't be fulfilled | ✅ **Fixed** — fulfilment state + line items + picking filter, migration 0115 |
| A9 · Leads had no attribution and no contact action | ✅ **Fixed** — first-touch UTM capture, channel column, email/call/text, migration 0116 |
| A10 · GA4 measured page views only | ✅ **Fixed** — `generate_lead`, `purchase`, `begin_checkout` on the real conversion points |
| C4 · `payment_reminder` had no opt-out | ✅ **Fixed** — added to notification preferences |
| Dead `AdminPlaceholder.tsx` | ✅ **Deleted** — plus its orphaned keys in all five locales |

### Corrections to this document

- **A7 was overstated.** The button reads "Mark sent", not "Send" — the UI was honest about only recording a status. The real gap was that there was no way to send an invoice *at all*, and no signal to the studio that one existed. Both are now built; "Mark sent" survives for out-of-band delivery.
- **A10 was understated.** GA4 is wired correctly (per-studio measurement ID, private paths excluded); it was the conversion events that were entirely missing, not the integration.

### Bugs found *while* fixing, none of them in the original audit

- **`claimSubstituteRequest` had a silent race.** The conditional update was correct but its result was never checked, so when two teachers claimed the same class at once, both were told they had it.
- **The ticket QR payload was unsigned and self-reported `quantity`.** Anyone holding their own ticket knew an `event_id` and a `user_id`, and could mint a QR claiming any number of seats. Fixed with a per-ticket `qr_token` — the defence `class_passes` already used — plus reading party size from the row, never the scan.
- **`orders_own` RLS is `for all`, not select-only**, so a customer could have set their own order to "collected" once a fulfilment flag existed. Guarded with a trigger in 0115 rather than reworking a policy the checkout route depends on.
- **A non-HTTP referrer was stored as junk attribution** — `new URL("javascript:alert(1)")` parses fine and has no host, so it slipped past the same-site check. Caught by a test.
- **A 409 from Vercel means two different things** (already on this project vs. held by another), and checking status before error code silently swallowed the real conflict. Caught by a test.

**Verified:** `tsc` clean · `eslint` clean · 431 tests passing · `next build` clean · `check:i18n` clean (3531 keys × 5 locales).

**Not yet done — needs you:**
1. **Migrations 0109 and 0111–0116 are unapplied.** 0111 is the RLS security fix; 0112 gates ticket scanning; 0114 gates creative upload; 0115 gates shop fulfilment; 0116 gates lead attribution (that one degrades gracefully — the enrolment form retries without the columns rather than losing a real enquiry). `npm run db:push` when you're ready — I haven't run it.
2. **`VERCEL_API_TOKEN` + `VERCEL_PROJECT_ID` need setting in Vercel.** Without them the domain wizard degrades honestly ("Olune needs to finish this — contact support") instead of registering automatically.
3. **Five integration libraries are still uncommitted** (`ai`, `analytics`, `credentials`, `events`, `mailchimp`) — Twilio per-studio SMS, GA4, Mailchimp and Zapier all depend on them.
4. **Paid conversions are still unmeasured in GA4.** Shop and ticket purchases complete in the Stripe webhook, where there is no browser to report from; the client fires `begin_checkout` instead. Closing that needs GA4 Measurement Protocol server-side — worth doing, but it's its own piece of work.

---

# Part A — Available in the UI, not actually wired

## Tier 1 — will visibly fail in front of a paying customer

### A1. The custom domain wizard never tells Vercel about the domain 🔴

**Where:** [app/portal/admin/site/domain/actions.ts](app/portal/admin/site/domain/actions.ts), [lib/domain-setup.ts](lib/domain-setup.ts)

`saveCustomDomain` stores the domain. `checkDomainDns` resolves it and confirms the A/CNAME record points at Olune. The wizard turns green and tells the studio *"DNS looks good — your domain points to Olune."*

There is **no call to the Vercel Domains API anywhere in the repository** — zero matches for `api.vercel.com`, `VERCEL_API_TOKEN`, or `VERCEL_PROJECT_ID`. Vercel does not know the domain exists, so it issues no TLS certificate and serves no content for it. The studio has correctly-configured DNS pointing at a 404.

This is the single worst finding, because it fails *after* the studio has done everything right, and the app has explicitly told them they succeeded.

**Fix:** `POST /v10/projects/{projectId}/domains` on save → poll `GET /v9/.../domains/{domain}/config` for verification and cert issuance → surface three real states in the wizard (added / verifying / live) instead of one DNS lookup. `removeCustomDomain` must also `DELETE` from the project. Roughly 1–2 days including the wizard states.

---

### A2. Ticket QR codes are generated and nothing on earth can scan them 🔴

**Where:** [app/api/events/purchase/route.ts:63](app/api/events/purchase/route.ts), [supabase/migrations/0009_events.sql:34](supabase/migrations/0009_events.sql)

Every ticket purchase renders a QR PNG and stores it on the row. Then:

- `event_tickets` has **no** `checked_in_at`, `scanned_at`, or `checked_in_by` column.
- There is **no scan endpoint** — the only redeem route is `/api/passes/redeem`, and `PassScanner` is class passes, not tickets.
- There is no door-scanning UI anywhere in `/portal/admin`.

So on recital night the studio has a phone, a queue of parents, and 200 QR codes that are decorative. `MARKET_READINESS.md` lists "ticket purchase → QR scan at door" as one of the four paths that lose you customers if they break — it isn't broken, it was never connected.

**Fix:** migration adding `checked_in_at` / `checked_in_by` / `check_in_count` → `POST /api/events/tickets/scan` validating the signed payload, studio-scoped, idempotent, rejecting duplicates loudly → a door-mode scanner screen modelled on `PassScanner`, with an offline queue (see D2). 2–3 days.

---

### A3. "Scheduled" ad campaigns are never published 🟠

**Where:** [app/portal/admin/advertising/actions.ts:91](app/portal/admin/advertising/actions.ts), [vercel.json](vercel.json)

`createCampaign` sets `status: "scheduled"` whenever `scheduledAt` is present. `vercel.json` defines five crons — notifications, subscription-invoices, sweep-unpaid, deliver-notifications, sync-email. **None of them publishes advertising.** A scheduled campaign stays scheduled forever.

Mitigating: `AdComposer` never sends `scheduledAt`, so the path is currently unreachable from the UI. That makes it a landmine rather than a live bug — the day someone adds a date picker, it silently swallows campaigns.

**Fix:** either add `/api/cron/publish-scheduled-ads` and a date picker together, or delete the `scheduled` status until you build it. Do not leave it half-present.

---

### A4. Ad "budget" is stored, displayed, and never spends a cent 🟠

**Where:** [lib/advertising/publish.ts](lib/advertising/publish.ts), [app/portal/admin/advertising/page.tsx:57](app/portal/admin/advertising/page.tsx)

`budget_cents` is in the schema, in `AdCampaign`, and rendered on the advertising page. The publish path posts **organically** — Facebook Page feed, Instagram media publish, TikTok video init. There is no Marketing API call, no ad set, no spend, anywhere in the codebase.

A studio owner reading "Budget: $200" will reasonably conclude Olune is spending $200 on their behalf. It is posting a free organic post.

**Fix (pick one, this week):** rename the surface to "Posts" / "Social publishing" and drop the budget field entirely — that's honest and takes an hour. Or commit to Meta Marketing API + TikTok Ads API, which is a multi-week project with an app-review dependency. Recommend the former now, the latter as a deliberate later bet.

---

### A5. Ad creative is paste-a-URL only, which makes TikTok unusable 🟠

**Where:** [components/admin/advertising/AdComposer.tsx:235](components/admin/advertising/AdComposer.tsx)

`imageUrl` and `videoUrl` are bare text inputs. There is no upload, no media picker, no reuse of the Supabase storage bucket that the site builder already uses for images (`createWebsiteImageUploadUrl` exists and works).

`publish.ts:313` hard-rejects a TikTok campaign without a `videoUrl`. Since no studio owner has a hosted video URL to hand, TikTok — listed as a **live** integration — is effectively unreachable.

**Fix:** reuse the existing signed-upload flow from the site builder for both image and video. ~1 day.

---

## Tier 2 — the feature stops one step short of being useful

### A6. Shop orders can be viewed and refunded, never fulfilled 🟠

**Where:** [components/admin/shop/ShopManager.tsx:344](components/admin/shop/ShopManager.tsx), [app/portal/admin/shop/actions.ts](app/portal/admin/shop/actions.ts)

The orders tab shows customer, total, status, date, and a refund button. Status comes straight from the payment lifecycle (`pending`/`paid`/`cancelled`/`refunded`). There is **no fulfilment state at all** — no "ready for collection", no "collected", no "posted", no picking list, no per-order item view.

Actions available on the shop: create/update/delete product, adjust stock, toggle active. That's a catalogue, not a shop. The studio selling leotards from the front desk cannot use this to run the front desk.

**Fix:** `fulfilment_status` on `orders` + an action to advance it + expand the row to show line items + a "to fulfil" filter. 1–2 days.

### A7. A contractor's "Send invoice" sends nothing 🟠

**Where:** [app/portal/teacher/invoices/actions.ts:53](app/portal/teacher/invoices/actions.ts)

```ts
export async function markInvoiceSent(id: string) {
  // update status -> 'sent'
}
```

That's the whole thing. No email, no PDF, no notification to the studio owner, no row in the studio's payables, no ledger entry. The teacher believes they've invoiced; the admin has no idea an invoice exists unless they go looking.

**Fix:** render the invoice (the invoice PDF/HTML machinery already exists in `lib/invoices`), email it via `sendEmail`, enqueue a notification to studio admins, and surface contractor invoices in Money → a payables view. 2 days.

### A8. Substitute requests notify nobody 🟠

**Where:** [app/portal/admin/substitutes/actions.ts:17](app/portal/admin/substitutes/actions.ts)

`createSubstituteRequest` inserts a row and returns. No notification is enqueued, no email, no SMS. Teachers discover the request only if they independently open the substitutes board.

This is a *same-day, time-critical* workflow — a teacher is sick and a class starts in four hours. Polling a board is not a mechanism.

**Fix:** enqueue a `notifications` row per eligible teacher on create (email + SMS via `channelsForType`), and notify the poster on claim. Depends on cron cadence (see D1) — an SMS that arrives up to 24 hours later is worse than none. ~1 day once cadence is fixed.

### A9. The lead funnel has no top and no exit 🟠

**Where:** [app/enrol/actions.ts:57](app/enrol/actions.ts), [components/admin/leads/LeadsBoard.tsx](components/admin/leads/LeadsBoard.tsx)

- **No attribution in:** `createLead` hardcodes `source: "enrol-page"`. No UTM parameters, no referrer, no landing page, no campaign. Every lead looks identical, so no acquisition channel can ever be evaluated.
- **No action out:** the board offers expand, edit notes, change status, delete. There is no email, no SMS, no call-logging, no convert-to-enrolment, no follow-up task.

So the leads board records that a lead existed and nothing else. It cannot answer "where do our customers come from" or "who haven't we called back".

**Fix:** capture UTM + referrer + landing path at enquiry and persist to the lead → add contact actions and a convert-to-student action to the board → a source column and a per-source conversion count. 2–3 days. This is the foundation for the attribution priority (#9 on the strategic list).

### A10. GA4 measures page views and literally nothing else 🟡

**Where:** [components/analytics/StudioAnalytics.tsx](components/analytics/StudioAnalytics.tsx)

GA4 is properly wired — per-studio measurement ID from the Connections hub, private paths correctly excluded, SPA page views fired manually. Good work. But `gtag('event', …)` appears **only** for `page_view`. There are zero conversion events across the entire app.

Enquiry submitted, trial booked, enrolment completed, checkout paid, ticket purchased — none are measured. A studio connects GA4 and gets a page-view counter, which is the one thing they could have got from anywhere.

**Fix:** a tiny `trackEvent()` helper + events on the six conversion moments that matter, mapped to GA4 recommended event names so the standard funnel reports light up. Half a day, and it makes A9 measurable.

### A11. Badges never award themselves 🟡

**Where:** [app/actions/badges.ts:59](app/actions/badges.ts), [components/portal/shared/BadgeAwarder.tsx](components/portal/shared/BadgeAwarder.tsx)

`awardBadge` and `revokeBadge` are real and work. They are called from exactly one place: a manual awarding panel. Nothing awards a badge on an attendance streak, a level completion, a term completed, or a first performance.

Manual badges are an admin chore, so they'll be used twice and abandoned. Automatic badges are the retention feature people actually mean when they say "badges".

**Fix:** a small rules table (`trigger_type`, `threshold`) + evaluation on attendance-marked and progress-recorded, ideally as a DB trigger to match the existing notification pattern. 2 days.

### A12. QuickBooks and MYOB connect, code, and never sync 🟡

**Where:** [lib/accounting/provider.ts:44](lib/accounting/provider.ts)

The code is scrupulously honest — `syncSupported: false`, with a comment explaining exactly this. But the *product* isn't: both appear in Connections as `stage: "beta"` next to a live Xero, OAuth completes successfully, and `lineItemCoding: true` means a studio can code its entire product catalogue for QuickBooks. Everything says "working" except the part that pushes invoices, which silently does nothing.

**Fix (order of preference):** (1) mark both `planned` in the catalog and disable connect until sync lands — 30 minutes, removes the trap; (2) implement QBO invoice sync behind the existing resolver — the abstraction is already correct, so it's genuinely just the driver, ~1 week.

---

## Tier 3 — honestly labelled "coming soon" (not defects — scope for the plan)

These are already flagged in the UI. Listing them so the completion plan is complete.

| Surface | Where |
|---|---|
| Money → **Reconcile** (bank-feed matching) | `app/portal/admin/money/page.tsx:42` |
| Money → Reports: **per-programme P&L** | `ReportsDashboard.tsx:319` |
| Money → Reports: **custom-range export** (CSV/PDF) | `ReportsDashboard.tsx:320` |
| Connections marked `planned`: GoCardless, Windcave, YouTube, WhatsApp, Google Calendar, Outlook Calendar | `lib/integrations/catalog.ts` |

**Also:** [components/admin/AdminPlaceholder.tsx](components/admin/AdminPlaceholder.tsx) has **zero usages**. Delete it.

---

# Part B — Whole features with no UI at all

| # | Missing | Consequence |
|---|---|---|
| B1 | **SaaS billing.** No plan tiers, no Olune subscription, no trial expiry, no dunning, no `/pricing` page. `lib/verticals/modules.ts` gating exists and is wired to nothing commercial. | You cannot charge for Olune. |
| B2 | **PWA / offline roll call.** No manifest, no service worker. `public/` holds three hero video files and nothing else. | The daily-use instructor surface dies on bad studio WiFi. |
| B3 | **Communication automation sequences.** Trial drip, re-engagement, recital countdown, term renewal. | The cheapest switching cost available, unbuilt. |
| B4 | **AI studio insights.** `lib/integrations/ai.ts` exists (uncommitted) and is used for ad copy and email summaries only. No churn risk, no utilisation, no trial-conversion analysis. | The differentiator in the pitch deck. |
| B5 | **Data export (GDPR portability).** Deletion exists; export doesn't. | Blocks EU sales; you ship four EU-relevant locales. |
| B6 | **MFA.** Not on studio owners, not on `/platform` operators. | Platform operators can cross tenants with a password alone. |
| B7 | **Migration wizard.** CSV import only — no branded Jackrabbit/StudioPro path. | The thing that unsticks a competitor's customer. |

---

# Part C — Loose ends that will bite before any of the above

1. **Five integration libraries are uncommitted.** `ai.ts`, `analytics.ts`, `credentials.ts`, `events.ts`, `mailchimp.ts` are all `??` in git. Twilio per-studio SMS, GA4, Mailchimp sync, and Zapier/webhook dispatch **all** depend on them. One `git clean` and four integrations disappear.
2. **Migrations 0109 and 0111 are written and applied nowhere.** 0111 closes the invoice-counter RLS hole from this morning's briefing — that gap is still open in production.
3. **Translations are 66–88% effective.** fr 71%, it 66%, ru 67%, zh 88% (`docs/i18n-audit-2026-08-07.md`). The missing third is concentrated in the Money hub and parent portal — the two highest-traffic surfaces. ~35 `common.*` strings × 3 locales is an hour's work for the largest visible win.
4. **`payment_reminder` has no preference toggle.** It's produced by billing actions and delivered by the cron, but `app/settings/notifications/page.tsx` doesn't list it — so it cannot be turned off. Minor, but it's a compliance-shaped hole in a billing message.

---

# Part D — Plan of attack

Sequenced so each wave leaves the product shippable, and so blockers land before the things that depend on them.

## Wave 0 — this week (protect what exists) · ~2 days

- **Commit the five integration libraries.** Nothing else on this list is safe until this is done.
- **Apply 0109 and 0111.** The RLS gap is live.
- **A4 decision:** rename Advertising → "Social posting" and remove the budget field. One hour, removes a promise you're not keeping.
- **A12 decision:** flip QuickBooks and MYOB to `planned` and disable connect. Thirty minutes, removes a trap.
- Delete `AdminPlaceholder.tsx`.
- Translate the ~35 `common.*` strings in fr/it/ru.

## Wave 1 — August (close the humiliating gaps) · ~2 weeks

The four things that fail in front of a customer, in order.

1. **A1 — Vercel Domains API.** (2d) Nothing else matters if a studio's own domain doesn't resolve.
2. **A2 — ticket scanning.** (3d) Migration + endpoint + door-mode screen.
3. **D1 — cron cadence.** (1d) Move `deliver-notifications` to at least 15-minute cadence (Vercel Pro, or QStash / `pg_cron`). **Blocks A8** and quietly undermines every notification promise in the product.
4. **A5 — creative upload.** (1d) Reuse the site builder's signed-upload flow; makes TikTok reachable.
5. **A3 — scheduled ads.** (1d) Cron + date picker, or delete the status.

## Wave 2 — September (finish the stop-short features) · ~2 weeks

6. **A8 — substitute notifications.** (1d) Now that cadence is fixed.
7. **A7 — contractor invoice send.** (2d) Email + PDF + admin notification + payables view.
8. **A6 — shop fulfilment.** (2d)
9. **A9 + A10 — attribution end to end.** (3d) UTM capture → lead source → contact actions → convert-to-student → GA4 conversion events. Do these together; separately each is half a feature.
10. **A11 — automatic badges.** (2d)

At the end of Wave 2 there is no feature in the product that lies about what it does. That's the milestone worth naming.

## Wave 3 — October (the moat) · ~4 weeks

11. **B2 — PWA + offline roll call.** Manifest, service worker, offline attendance queue, and reuse the same queue for the Wave 1 ticket scanner. Smallest of the strategic five, highest word-of-mouth.
12. **B3 — communication sequences.** Trigger → delay → template → audience, on top of the existing `notifications` table and `dispatchStudioEvent`. The switching cost.
13. **B4 — AI insights v1.** Churn risk, class utilisation, trial conversion. `lib/integrations/ai.ts` and per-studio model access already exist.

## Wave 4 — November (get paid) · ~3 weeks

14. **B1 — SaaS billing.** Plan tiers wired to `lib/verticals/modules.ts` (the gating is already built — this is mostly plumbing), Olune-side Stripe subscription per studio, trial expiry, dunning, `/pricing`, upgrade/downgrade with proration.
15. **B5 — data export**, **B6 — MFA**. Both are sales blockers before they're features.
16. Money → Reports export and per-programme P&L.

## Wave 5 — December (sell)

17. **B7 — migration wizard** as a sales tool.
18. Money → Reconcile, or defer it explicitly — bank-feed matching is a large project and Xero already does it for connected studios.
19. **A12(2)** — QuickBooks sync, if the demand is there.

---

## What I'd cut

Three things on the roadmap earn their keep less than they cost:

- **Paid ads (A4 done properly).** Meta Marketing API plus TikTok Ads API plus app review, to let a dance studio spend $50 boosting a post they could boost in the Instagram app in four taps. Organic scheduling is the valuable half; build that, skip the rest.
- **Money → Reconcile.** Weeks of work to rebuild what Xero already does well, for the studios that most need a ledger and are therefore most likely to have one.
- **The remaining `planned` connections.** GoCardless, Windcave, YouTube, WhatsApp, calendar sync — six integrations, no demonstrated demand. Leave them greyed as roadmap signalling, which is exactly what they're doing now. Google Calendar is the only one I'd revisit, and only if studios ask twice.

---

## The one-line version

Nothing here is a rewrite. Twelve half-finished paths, about five weeks of work to close all of them, and the first two — the domain wizard and the ticket scanner — are the ones that would embarrass you in front of a customer this month.
