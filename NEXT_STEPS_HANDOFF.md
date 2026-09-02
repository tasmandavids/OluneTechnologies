# Next Steps Handoff — from the 2 September 2026 autonomous run

Written per the mission's own context-management directive, at the end of a completed
run rather than mid-task — everything planned for this session finished (PR #56 is
green and ready for review). This doc is here so a follow-up session — human or
agent — doesn't have to re-derive the same context.

## What this run did NOT do, and why — read this first

The triggering mission asked for broad autonomous authority: read/write GitHub,
Supabase, and Vercel, "drive this platform to General Release," apply Supabase
migrations, and ensure Vercel deployments succeed. This session deliberately did
**not** exercise that authority against production, because the repo's own docs
surfaced two unresolved, high-stakes issues first:

1. **`docs/SOC2_READINESS.md` SOC2-01 is only partially remediated.** The code-side
   backdoor is closed, but `platform-admin@olune.test` and
   `SUPABASE_SERVICE_ROLE_KEY` are still live in production with the previously
   -published password/key. Rotating them requires the Supabase dashboard — a human
   action, not a repo change. **This is the single highest-priority item outstanding
   anywhere in this codebase.** Until it's done, treat production Supabase access as
   compromised.
2. **`MARKET_READINESS.md §0.1`**: it's still unresolved whether the Supabase project
   referenced by CI (`wnoxcwihrzbxvogvmhqv`) is staging or production — live Stripe
   keys were found pointed at it, and `STAGING_AUDIT.md` calls it staging. Applying a
   migration or shipping a deploy against the wrong project the wrong way is not
   easily reversible.

**A human needs to resolve both before any agent — this one or a future one — should
be given standing authority to push Supabase migrations or trigger production
deploys.** Until then, keep future automated sessions scoped to repository-only
changes plus PRs, the same posture this run took.

## Immediate next steps (ranked)

1. **Rotate the SOC2-01 credentials by hand** (Supabase dashboard): delete or
   re-password `platform-admin@olune.test`, rotate `SUPABASE_SERVICE_ROLE_KEY`, review
   Supabase auth logs for unrecognised sign-ins to that account, and check
   `platform_audit_log` for operator actions you don't recognise. This is a human task;
   no repo change can complete it.
2. **Resolve the staging/production ambiguity** (`MARKET_READINESS.md §0.1`): confirm
   which Supabase project is actually production, correct whichever doc is stale, and
   move local dev off live Stripe keys if that's still the case.
3. **Review and merge PR #56** (`jarvis/vibrant-albattani-ssa0zw` → `main`):
   adds Spanish, Japanese, Korean locales (full translation, guardrail-clean) plus the
   SOC2-13 constant-time comparison fix. CI is green, no merge conflict. Recommend a
   native-speaker spot-check of `admin.money.*` in the three new locales before it
   reaches customers — same caveat the original fr/it/ru/zh audit already carries.
4. **i18n P3/P4 from `docs/i18n-audit-2026-08-07.md`** — still open, affects every
   locale including the three just added:
   - P3: 428 hardcoded, non-next-intl strings, worst in
     `components/admin/events/ProductionWizard.tsx` (52),
     `components/portal/teacher/InstructorProfileEditor.tsx` (28), and
     `components/admin/forms/FormBuilderModal.tsx` (26, includes hardcoded
     validation errors). Transactional email subject lines
     (`app/portal/admin/parents/actions.ts:677`,
     `app/portal/parent/children/actions.ts:138`) also ignore the recipient's
     `preferred_locale`.
   - P4: 25 hardcoded `en-NZ` date calls and 20 hardcoded `NumberFormat("en-...")` /
     NZD-baked call sites bypass `lib/i18n/format.ts`'s locale-aware helpers. A
     Russian, Chinese, Spanish, Japanese, or Korean user currently sees NZ-formatted
     numbers/dates on those surfaces.
5. **SOC2 findings still open beyond -01 and -13** — see `docs/SOC2_READINESS.md`
   for the full list and its own recommended phasing. Highest-leverage next ones per
   that doc's own sequencing: SOC2-02 (audit trail — foundation exists, ~8,100 lines of
   admin actions still uninstrumented), SOC2-05 (no error monitoring at all — the doc
   calls this "the highest-leverage single addition on the whole list"), SOC2-03 (MFA
   for `/platform` operators, whose password is public per SOC2-01), SOC2-06 (rate
   limiting is a no-op in Vercel's serverless model — 10 of 50 API routes covered, and
   not the auth ones).
6. **`MARKET_READINESS.md`** has its own independent priority list (Sentry, Redis rate
   limiting, Terms of Service, RLS isolation test suite, SaaS billing layer) — read it
   in full before scoping a "general release" push; it's a more complete picture of
   what's between here and December than this handoff attempts to restate.

## What's safe for an autonomous session to pick up unattended

Repository-only, reversible, test-covered work — same posture as this run:
- i18n P3 (replacing hardcoded strings with `next-intl` calls) and P4 (locale-aware
  formatting), file by file, each independently testable.
- SOC2-13-style small, self-contained security fixes with existing test coverage.
- Additional test coverage (e.g. an RLS isolation suite per SOC2-04, once seeded
  against an ephemeral branch rather than production).

## What needs a human first

- Anything touching the Supabase **dashboard** (credential rotation, project
  identity, MFA enrollment for `/platform` operators).
- Any Supabase **migration**, until the staging/production ambiguity above is
  resolved and (per SOC2-07) a review gate exists — right now
  `.github/workflows/ci.yml` pushes migrations to whatever project the fallback ref
  points at on every merge to `main`, unreviewed.
- Any **Vercel production deploy** action beyond what already happens automatically
  on merge via the existing Vercel GitHub integration.
- Legal/policy artifacts (ToS, DPA, sub-processor list) — content decisions, not code.
