# Olune — Road to Market Perfection

**Audit date:** 6 August 2026
**Branch audited:** `ttest` (40 uncommitted files) · migration frontier **0102** · 187 commits since 22 June
**Baseline health:** `typecheck` clean · `lint` clean · CSP + security headers present · RLS in place · 38 unit test files

The engineering fundamentals here are genuinely strong. What follows is what stands between "very good product" and "category-winning product" — ordered by what will actually hurt you first.

---

## 0. Fix this week — ship blockers and live risk

### 0.1 Live Stripe keys are pointed at the staging Supabase project
`.env.local` holds `sk_live` / `pk_live`. The linked Supabase ref is `wnoxcwihrzbxvogvmhqv` — which `STAGING_AUDIT.md` calls **staging**. Either the docs are stale and this is now production, or live cards are being charged against a staging database. Resolve before another payment runs.

- Confirm which project is production. Rename or re-document the other.
- Move local dev to `sk_test` keys; keep live keys only in Vercel production env.
- Verify the Stripe webhook endpoint points at production and has `charge.refunded` enabled.

### 0.2 Uncommitted work sitting on a side branch
40 modified files plus a new migration `0102_studio_integrations.sql` are uncommitted on `ttest`. That migration is not on `main`, not in CI, not applied anywhere. You already ate migration drift once (the 0095/0096 reconcile on 23 July).

- Merge or shelve `ttest` deliberately. Never let a migration file live outside `main`.
- Run `npm run db:status` / `npm run db:verify` and record the real production frontier.

### 0.3 Documentation is six weeks behind the code
`OLUNE_PROGRESS.md` (22 June) says the frontier is 0056 — it's 0102. `README.md` says "migrations 0001–0056" and links `docs/site-builder-v2.md`, which no longer exists (the v1/v2 builders were replaced on 5 August). `STAGING_AUDIT.md` describes a world that no longer exists.

This matters more than it looks: it's the single source of truth an AI assistant, a new contractor, or future-you reads first, and right now it will actively mislead all three.

### 0.4 `next build` does not run in CI — ✅ done 7 Aug 2026
CI runs `test`, `typecheck`, `lint`. A build failure reaches Vercel unblocked. Add a build step with stub env vars.

**Done:** `.github/workflows/ci.yml` → `quality` job now runs `npm run build` (real secrets when set, well-formed stubs otherwise) followed by `npm audit --omit=dev --audit-level=high`, so a vulnerable production dependency also fails the build.

---

## 1. Production hardening — you are currently flying blind

### 1.1 No error monitoring anywhere
No Sentry, no equivalent. When a parent's payment fails at 9pm on a Sunday, you find out when they email you. **This is the highest-leverage single addition on the whole list.**

- Sentry (or Highlight/Axiom) on client, server, and edge.
- Alert on: Stripe webhook failures, cron failures, 5xx rate, unhandled server-action errors.
- Replace the 24 stray `console.log` calls in app code with structured logging.

### 1.2 Rate limiting doesn't work in production
`lib/rate-limit.ts` is an in-process `Map`. Vercel runs many isolated serverless instances — each gets its own empty map, so the limit is effectively `limit × instance_count`. It's also applied to only **3 of 43** API routes.

- Move to Upstash Redis (or Vercel KV) so the window is shared.
- Extend coverage to: login/reset-password, `/enrol` trial submission, contact forms, ticket purchase, all public POST routes.

### 1.3 Cron cadence is too slow for the product's promises
Every cron in `vercel.json` runs **once daily**. `deliver-notifications` fires at 10:00 UTC. That means an absence SMS a parent expects within minutes can be up to 24 hours late — a visible product failure, not an infra nicety.

- Vercel Pro for sub-daily crons, or move delivery to QStash / Supabase `pg_cron`.
- Add dead-letter handling and alerting when a cron pass fails.

### 1.4 No uptime or status monitoring
No external health check, no status page. Studios running a recital night need to know the ticket scanner is up.

### 1.5 Test coverage has a shaped hole
38 unit test files is respectable, but they're pure-logic. The 3 integration tests skip without a live DB and don't run in CI. There is **no browser-level test at all** (no Playwright).

- Playwright E2E on the four paths that lose you customers if they break: signup → studio live; parent enrol → pay → invoice; roll call → absence notification; ticket purchase → QR scan at door.
- Get the integration suite running in CI against an ephemeral Supabase branch.

---

## 2. Legal and trust — required to sell, not optional

### 2.1 No Terms of Service
You have `/privacy`, `/data-deletion`, `/faq`. There is no ToS. You cannot responsibly onboard a paying studio without one.

Also needed:

- **DPA / data processing agreement** — you're a processor of children's data for every studio.
- **Refund and cancellation policy** — for the SaaS subscription and for studio-level transactions.
- **Cookie / tracking notice** — you ship Vercel Analytics and Meta/TikTok OAuth.

### 2.2 Compliance posture is undefined
You ship `fr`, `it`, `ru` and now `zh` locales, which signals EU and international studios. That means GDPR applies, on top of NZ Privacy Act 2020.

- No self-serve **data export** (GDPR portability). Deletion exists; export doesn't.
- Data retention policy — how long do you keep a departed student's records?
- Sub-processor list (Supabase, Stripe, Resend, Twilio, Vercel, OpenAI).
- If US studios are a target: **COPPA**, and per-state student-privacy laws.

### 2.3 Audit logging is thin
An `audit_log` exists but is referenced in only 3 files. For a multi-tenant platform holding minors' data, you want every privileged cross-tenant action, every refund, every role change, and every data export logged immutably.

### 2.4 No documented backup / restore runbook
Supabase takes backups. Have you ever restored one? Write and rehearse the runbook: point-in-time recovery, RTO/RPO targets, and what you tell studios during an outage.

---

## 3. Security — the existential category

You're holding children's names, addresses, photos, medical notes, and guardian payment details across many tenants. One RLS hole is not a bug, it's a company-ending event.

### 3.1 CSP still allows `unsafe-inline` and `unsafe-eval`
Your own config comment flags this. Move to nonce-based script loading. Until then any XSS is fully weaponisable.

### 3.2 No systematic RLS verification
102 migrations of hand-written policies with no test that proves tenant A cannot read tenant B. Build a per-table RLS test suite that asserts isolation for every table, run in CI. Then commission an external penetration test before general release — the report itself becomes a sales asset with schools.

### 3.3 No MFA
No 2FA on studio owner or platform admin accounts. Supabase Auth supports TOTP; wire it, and make it mandatory for `/platform` operators.

### 3.4 Secret hygiene
`.env.local` correctly gitignored, good. Add: key rotation procedure, and confirm `SUPABASE_SERVICE_ROLE_KEY` is never reachable from a client bundle.

---

## 4. The moat — your own strategic priorities, still unbuilt

From your ten-priority list (June), these remain untouched or partial:

| # | Priority | Status |
|---|----------|--------|
| 5 | **AI Studio Insights** — churn risk, class utilisation, trial conversion drops | Not built |
| 6 | **Competitor migration wizard** — branded Jackrabbit / StudioPro import | CSV import only |
| 8 | **Communication automation sequences** — trial drip, re-engagement, recital countdown, term renewal | Not built |
| 9 | **Attribution tracking** — site visit → lead source → conversion → LTV | Missing |
| 10 | **Mobile roll call as near-native** — PWA, offline queue, haptics | **Nothing.** No manifest, no service worker. `/mobile` is a marketing page only |

Two of these deserve emphasis:

**Communication sequences (#8) are your switching cost.** Once a studio has built a trial drip and a recital countdown chain inside Olune, leaving means rebuilding all of it. Nothing else on this list creates lock-in that cheaply.

**Offline roll call (#10) is your word-of-mouth moment.** Instructors use it daily, studio WiFi is unreliable, and it's the thing they demo to instructors at other studios. It's also the smallest of the five to build.

---

## 5. Quality and consistency

### 5.1 Translation drift
`en` has 4,289 lines of messages; `fr` 3,871, `it` 3,861, `ru` 3,861, `zh` 4,180. Roughly 400 lines untranslated — almost certainly the Aurora Glass redesign, the Money hub, and the new integrations surfaces, all shipped in the last two weeks. Shipping a half-English French portal is worse than shipping no French portal.

- Add a CI check that fails when locale key sets diverge from `en`.

### 5.2 SEO is 10% done
Only **9 of 95** pages export metadata. `/programmes` and `/enrol` — two of your highest-intent public pages — have none. There are **no OpenGraph or Twitter images anywhere**, so every share of a studio site or enrolment link renders as a blank card.

This costs you twice: once for olune.com, and once for every studio site you host (which is supposed to be a selling point).

- Metadata on every public route, per-studio dynamic OG images (`opengraph-image.tsx`), sitemap per studio subdomain.
- `JsonLd` is wired on 5 pages — extend to class listings and events.

### 5.3 No accessibility tooling
No `eslint-plugin-jsx-a11y`, no axe, no audit. 182 aria attributes across 331 components is thin. You sell to schools and community organisations — accessibility complaints are a real commercial risk, and in some markets a procurement blocker.

- Add `eslint-plugin-jsx-a11y` to the lint config, then fix the fallout.
- Run axe over the parent portal and public site; target WCAG 2.1 AA.
- Keyboard-navigate the roll call and the checkout end to end.

### 5.4 Client/server component balance
192 of 331 components are `"use client"`. Your own project guidance says prefer Server Components. Worth an audit pass — it's the cheapest performance win available, especially on the parent portal where families are on phones and patchy connections.

### 5.5 Maintainability hotspots
`BillingDashboard.tsx` (1,237 lines), `ProductionWizard.tsx` (1,060), `SetupWizard.tsx` (1,023), `EmailInbox.tsx` (972). These are the files that will slow you down in six months.

---

## 6. The gap nobody has flagged: Olune has no way to get paid

Stripe Connect handles studios collecting from families. Module gating and vertical packs exist. But there is **no SaaS billing layer** — no plan tiers, no Olune subscription, no trial expiry, no dunning, no upgrade path. Migration `0080_studio_billing_periods` is about studios invoicing families, not about studios paying you.

Before general release in December you need:

- Plan tiers wired to the existing entitlements/module system (the gating infrastructure is already there — this is mostly plumbing).
- Olune-side Stripe subscription per studio, with trial period and expiry.
- Dunning and grace-period behaviour when a studio's card fails.
- A public pricing page.
- Upgrade/downgrade flows with proration.

---

## Suggested sequencing to December

**August — de-risk**
Resolve the live-keys/staging question. Merge `ttest`. Rewrite the three stale docs. Add Sentry. Add `next build` to CI. Draft ToS + DPA.

**September — harden**
Redis rate limiting. Cron cadence fix. Playwright on the four critical paths. RLS isolation test suite. MFA. Locale drift CI check.

**October — moat**
Communication automation sequences. PWA + offline roll call. AI studio insights v1.

**November — commercial**
SaaS billing and pricing page. SEO and OG images. Accessibility pass. External penetration test.

**December — launch**
Migration wizard as a sales tool. Attribution tracking. Backup restore rehearsal. Status page live.

---

## The honest summary

You do not have a feature problem. The feature surface is already wider than most funded competitors — Recital Wizard, Xero, Stripe Connect, class passes, site builder, advertising hub, multi-vertical packs, five locales.

What you have is an **operational maturity gap**. The three things that would most change your risk profile tomorrow are: error monitoring, working rate limiting, and a Terms of Service. None of them are interesting to build. All of them are what separates a product from a business.
