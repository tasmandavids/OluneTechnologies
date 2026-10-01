# Where Olune is — 1 October 2026

This is the current-state document. Read it before `MARKET_READINESS.md`
(6 Aug) and `docs/SOC2_READINESS.md`, which hold the detail behind each item.
`OLUNE_PROGRESS.md` is the historical session log, not the plan.

**The date that matters: free pre-release access ends 1 January 2027 00:00 NZDT**
(`2026-12-31T11:00:00Z`). From then on studios hit the paywall. Everything
under *Before 1 January* has to be finished by then.

## What happened between 3 September and 1 October

The work in this period was done with ChatGPT/Codex rather than Claude. It
was merged as PRs #64–#69. CI is green on every merge, and production holds
all 130 migrations (CI's parity check passes).

| PR | What it changed |
| --- | --- |
| #65 | Instalment recording is enforced in the database (studio + admin/office only, no overpayment, no inactive plans). Dashboard totals are aggregated in Postgres. People, invoices and ledger load 50 records per page. Pre-release access runs to the fixed 1 Jan cutoff. Notification delivery takes a lease so runs can't overlap. Detail: `docs/optimization-2026-09.md`. |
| #66 | Fixed a portal crash in the locale provider. |
| #67 | Onboarding tenant-context fixes. Middleware reads role and studio from the database on every protected request instead of trusting JWT claims. `/platform` requires TOTP (aal2). Dependency security updates. Playwright smoke tests (`docs/E2E_TESTING.md`). |
| #64 | Stripe Accounts v2 status events: `/api/webhooks/stripe-v2`, plus a nightly `/api/cron/sync-connect-accounts`. |
| #68, #69 | CI on Node 24. Parent portal money follows the parent's locale. |

Conventions it introduced, which later work should keep:

- New migrations use Supabase timestamp names (`20261001001542_…`), not `0128_…`.
- JWTs establish identity only. Roles come from `profiles` and `studio_memberships` at request time.

## Verified live state (1 October)

**Stripe — set up, but studio onboarding is unproven**

- Production runs on Olune's own account, `acct_1UAIxF2Aou4dF8f2`.
- All six plan prices are seeded and active.
- All three webhook secrets are set in production: platform, Connect and v2. A fake-signature probe gets 400 "Invalid signature" on each.
- The v2 Event Destination is registered. Its test ping arrived at 01:31 UTC on 1 Oct and was recorded in `stripe_events`.
- **No studio has ever connected Stripe** (`stripe_connect_accounts` is empty). So it is still unproven whether Stripe's Connect platform-profile questionnaire is complete.
- **No studio pays yet.** 6 studios are comped and 2 are trialing to the 1 Jan cutoff (one is Legacy Dance Project, signed up 21 Sep). None has a Stripe subscription.

**Supabase**

- `wnoxcwihrzbxvogvmhqv` is production. `supabase/config.toml` names it as the production remote, CI migrates it, and live Stripe events land in it. This settles `MARKET_READINESS.md §0.1`.

**Auth and security**

- `platform-admin@olune.test` (SOC2-01) was **banned and removed as an operator on 1 Oct**. No operator actions by it were logged. One operator remains: `administrator@olune.co.nz`.
- TOTP is on. The password minimum was raised from 6 to 8 on 1 Oct.
- Leaked-password protection is off; it needs the Supabase Pro plan.
- **No user has enrolled an MFA factor**, so the first visit to `/platform` will ask for enrollment.

**Not verifiable from a session:**

- Whether Sentry is receiving events.
- Whether Upstash Redis is configured. Without it, rate limiting falls back to per-instance memory, which does little on Vercel.
- What `PLATFORM_OPERATOR_EMAILS` holds in Vercel.
- Whether the crons succeed. The Vercel MCP is SAML-gated.

## Needs you (dashboards; nothing in the repo can do these)

1. **Enroll TOTP** on `administrator@olune.co.nz` by visiting `/platform`.
2. **Prove studio onboarding.** Click *Connect Stripe* on Demo Studio's Payments page, or run `npm run check:connect -- --live --expect acct_1UAIxF2Aou4dF8f2`. The script makes a throwaway live account and closes it, and needs Olune's live key in `.env.local` (currently blank).
3. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** (SOC2-01). Update Vercel, GitHub Actions and `.env.local` in one sitting.
4. In Vercel, remove `platform-admin@olune.test` from `PLATFORM_OPERATOR_EMAILS` if it is there. Confirm `UPSTASH_*` and the Sentry DSN are set, and that the crons show 200s.
5. Decide on paid plans:
   - Supabase Pro gives leaked-password protection and backups/PITR.
   - Vercel Pro gives notification delivery faster than once a day. It is daily today on Hobby.

## Before 1 January 2027

| Item | Why it blocks | State |
| --- | --- | --- |
| Terms of Service, DPA, refund/cancellation policy | Can't take money from studios without them | ❌ No `/terms` route. Content is your decision; the page is code. |
| One real studio through Stripe Connect | Parent payments depend on it | ❌ See *Needs you* #2 |
| One real paid checkout of an Olune plan | Paywall goes live on 1 Jan | ❌ Never exercised in live mode |
| Trial-expiry / paywall emails | Studios otherwise lose access without warning | ❌ Out of scope when the paywall was built |
| Cross-tenant RLS test suite (SOC2-04) | One leak between studios is company-ending | ❌ Parked in tag `archive/rls-isolation-tests` |
| E2E journeys in CI | signup → live, enrol → pay, roll call → absence, ticket → scan | 🟡 3 smoke specs exist; not in CI; skip without `E2E_*` env |
| Notification delivery cadence | Absence SMS can be up to 24 h late | ❌ Daily on Hobby |
| i18n P3/P4 leftovers | Non-English studios see English or NZ formats | 🟡 Partly done in #62 and #69 |

## Later

These are not launch blockers, but they are the competitive priorities (`MARKET_READINESS.md §4`):

- Offline roll call
- Communication sequences
- Competitor migration wizard
- AI insights
- Attribution
- The native parent app, still blocked on empty `mobile/assets/` and store enrolment

## Safe for an unattended session

Repository-only work that is reversible and test-covered:

- A `/terms` page scaffold for your wording.
- Landing the RLS isolation suite against an ephemeral database.
- Wiring Playwright into CI.
- i18n P3/P4.

Anything touching the production database, Stripe live mode, or Vercel settings needs your go-ahead first.
