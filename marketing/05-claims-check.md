# Olune — Marketing Claims Check

**Checked:** 1 September 2026, against the `ttest` branch of the Olune codebase.
**Rule:** no campaign claim goes live for a feature that isn't shipped. Re-run this check before each phase.

The first draft of this campaign promised four things the product doesn't do. All four have been rewritten. This file records what was found, so it doesn't get re-introduced.

---

## 1. Claims removed from the copy — features that do not exist

| Claim | Reality | Where it was |
|---|---|---|
| **Rolls work offline / with no signal** | No offline path anywhere. `TeacherSchedule.tsx` calls the `markAttendance` server action on every tap and rolls the UI back on failure. No service worker, no manifest, no local queue. Listed as **B2, unbuilt, Wave 3 (October)** in `docs/feature-completion-plan-2026-08-07.md`. | IG Thu 17 Sept Reel · calendar Wk3/Wk11 · email D2 |
| **Offline ticket scanning at the door** | `TicketScanner.tsx` posts every scan live. Only in-memory state is a 4-second dedupe map. The A2 fix depended on B2, which never landed. | IG Thu 17 Sept · calendar Wk10 Tue 3 |
| **Automatic absence notifications to parents** | The feature does not exist. `lib/notify/messages.ts` has no absence notification type; `markAttendance()` enqueues nothing. The only absence feature is the *inverse* — a parent reporting an absence to the studio. Compounding: `deliver-notifications` runs **once daily** (`0 10 * * *`), so even existing notifications can be up to 24h late (`MARKET_READINESS.md` §1.3). | IG Mon 7 Sept Reel · email Sequence C3 |
| **Self-serve data export** | No export route, action or CSV writer exists. `MARKET_READINESS.md` §2.2: "Deletion exists; export doesn't." `ReportsDashboard.tsx` renders export as an explicit "coming soon" card. **B5, Wave 4 (November).** | IG Fri 18 Sept |
| **Scale includes competitions** | Two independent gates block it. `lib/verticals/packs/dance.ts` omits `competitions` from the dance pack — a hard gate no flag overrides — and there is no `app/portal/admin/competitions` route at all. | IG Fri 2 Oct · email A3 |

**Note:** `app/pricing/page.tsx` currently ships two of these errors itself — line 59 claims "Attendance on mobile, working offline" and line 50 lists "Competitions and venues" under Scale. **The pricing page needs the same corrections.**

---

## 2. Claims corrected — true but stated too broadly

| Was | Now | Why |
|---|---|---|
| Website builder "Included" | "Included from the Studio plan" | `site` is in `STUDIO_MODULES`, not `SOLO_MODULES`. It's not in the NZ$29 plan. |
| Events/ticketing/costumes listed flat under a NZ$29 headline | Marked as Scale-plan features | `production` and `costumes` are `SCALE_MODULES` only. |
| "One studio can never see another's data" | "Isolated at the database level, with row-level security on every table" | RLS is genuinely in place, but there is **no test** proving tenant isolation, and two tenancy holes were patched in the last month (migration 0111's invoice-counter gap; the `orders_own` `for all` policy). "Can never" is an unproven absolute in the sentence a school's lawyer will read. |
| "No cut of your fees" | "...once you've connected your Stripe account, money settles straight into it" | Substantively true — no `application_fee_amount` anywhere. But per `docs/STRIPE_CONNECT.md`, studios who haven't completed Connect onboarding are charged through the Olune platform account, so "you keep your money" isn't literally true on day one. |
| "A Xero connection that isn't held together with Zapier" | "A Xero connection built in rather than bolted on" | Olune's half is true (real OAuth, `stage: "live"`, 19 files in `lib/xero/`). The competitor half appears once in `docs/competitive-plan-2026-08-07.md` with no source and no date. State only our own side. |
| Solo/Studio/Scale module lists | Expanded to match `lib/plans/catalog.ts` | Studio also unlocks `forms`, `shop`, `availability` and `substitutes`; Scale also adds private lessons and badges. We were underselling Studio by four modules. |
| "A studio going from 180 to 240 students pays around NZ$100/mo more" | Jackrabbit's published brackets, stated as published, in USD | **This figure was invented.** Per `lib/content/compare.ts` (verified 2026-08-11), Jackrabbit's tiers are US$49 (0–100), US$89 (101–250), US$129 (251–500). 180 → 240 sits *inside* one bracket: the bill doesn't move. A fabricated competitor invoice figure in a cold email to that competitor's customers was the single highest-risk line in the campaign. |
| "Four hours a week" presented as a measured average | Reframed as illustrative, from conversations | 48+55+70+67 = exactly 240 minutes, which reads as derived. No source exists. The strategy doc says this campaign invents no numbers — so it can't. |
| `olune.app` throughout | `olune.co.nz` | Production uses `olune.co.nz` (`.env.local`, `mobile/eas.json`, `docs/APP_STORE_SUBMISSION.md`). Setting SPF/DKIM/DMARC on the wrong domain would have authenticated nothing. |
| "Sixty studios built this with us" (hard-coded in a caption written 3 months early) | `{{n}}` placeholder | That's the target, not a fact. |

---

## 3. Blockers — not copy problems, ops problems

These must be resolved before the phases that depend on them.

### 3.1 "Free until general release" is not what the code does — **fix before Sequence B batch 2**
`supabase/migrations/0119_studio_plans.sql` gives every new studio a **14-day** trial on `scale`; `lib/plans/gate.ts` then returns `locked` with `reason: "trial_expired"`. The only free-past-14-days mechanism is an operator manually comping each studio. A campaign that lands 60 signups in September produces 60 lockouts on day 15.

**Either** auto-comp at signup until the GA date, **or** change the promise everywhere (campaign copy *and* `app/pricing/page.tsx`, which makes this claim in four places).

### 3.2 No Terms of Service, DPA or refund policy — **launch blocker**
Only `/privacy`, `/faq` and `/data-deletion` exist. Sequence D converts strangers to paid, and Olune is a processor of children's data for every studio. `MARKET_READINESS.md` §2.1 has flagged this since 6 August. Also note `app/pricing/page.tsx` already promises "no lock-in contracts and no cancellation fees" with no policy behind it.

### 3.3 No monitoring, ahead of recital-season reliability content — **fix before Week 9**
No error monitoring, no uptime checks, no status page (`MARKET_READINESS.md` §1.1, §1.4). Rate limiting is an in-process `Map` covering 3 of 43 routes — and the ticket-purchase and `/enrol` endpoints this campaign drives traffic to are among the uncovered ones. Weeks 9–10 sell dependability at exactly the moment failure is most visible.

### 3.4 Custom domain provisioning is not configured — **fix before Week 11**
`VERCEL_API_TOKEN` and `VERCEL_PROJECT_ID` are commented out in `.env.local.example` and absent from `.env.local`. Without them, `app/portal/admin/site/domain/actions.ts` tells the studio "the last step has to be finished by Olune — contact support." The Week 11 website reveal promises a self-serve custom domain.

### 3.5 The founder biography is unverifiable from anything published — **fix before Week 1 Wed**
Nothing corroborates Vaganova, eleven years, Mariinsky/Bolshoi, or a co-founded school, and the public `/team` page names no founder at all — so the launch Reel and the website will contradict each other on day one. Two specific fixes: drop "first New Zealander" unless it's documented (it's a checkable superlative a journalist will check), and settle whether the school is named or unnamed — the drafts currently do both.

---

## 4. Verified correct — no change needed

- **All pricing.** `lib/plans/catalog.ts` gives 2900/5900/12000 and 29000/59000/120000 cents → NZ$29/59/120 and NZ$290/590/1,200. "Two months free" checks out on all three tiers. GST-inclusive and NZD are explicit in the type comments and on the pricing page. No setup fee, no lock-in: confirmed in the pricing FAQ.
- **Unlimited students on every plan.** Structurally true — `PLANS` has no seat or headcount field anywhere. Tiers gate only `modules`.
- **Solo = classes, rolls, billing, messaging.** Exactly `SOLO_MODULES`.
- **14 days free, no card.** `grant_studio_trial()` in migration 0119; no payment method collected at signup.
- **Shipped and safe to claim:** leads and enrolment forms, shop and orders, class passes, payment plans and instalments, production, costumes, progress, the parent portal, the website builder, Xero, and Stripe Connect settlement.
- **The migration copy** (IG Fri 11 + Fri 25, email A4). Honest — CSV import genuinely exists in `lib/setup/`, and the copy correctly promises hand migration rather than an automated wizard, which is unbuilt.
- **"No cut of your fees."** Zero occurrences of `application_fee_amount` anywhere; `resolveDestinationCharge()` returns only `transfer_data` + `on_behalf_of`.

---

## 5. Deliberately not used

- **"Jackrabbit charges $44/mo for their mobile app."** The two internal sources disagree — `competitive-plan` says +$44/mo, the more recent and date-stamped `compare.ts` says a one-time US$169 setup fee. And `compare.ts` concedes Jackrabbit offers a custom-branded parent app that Olune does not. Don't counter-position on apps.
- **Any feature-count comparison.** It's their game and it contradicts wedge 4.

---

## The standing rule

`lib/content/compare.ts` sets it for the product, and it applies to the campaign identically:

> Everything asserted about another company must be something published on their own site and verifiable. A stale claim here is a claim Olune is publishing.

Same for claims about ourselves.
