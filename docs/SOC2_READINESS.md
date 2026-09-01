# SOC 2 Readiness Assessment — Olune

**Assessment date:** 31 August 2026
**Scope:** `tasmandavids/NZAD` @ `main` (commit `29cc340`) — application code, database
schema (119 migrations), CI/CD pipeline, and repository documentation.
**Framework:** AICPA Trust Services Criteria (2017, rev. 2022) — Security (common
criteria), Availability, Confidentiality, Processing Integrity, Privacy.
**Status:** SOC2-01 partially remediated on this branch (31 Aug 2026); its credential
rotation remains outstanding. SOC2-02 foundation landed 1 Sep 2026 with partial call-site
coverage. Every other finding is as-assessed.
**Type:** Readiness / gap assessment. This is *not* an audit opinion and confers no
attestation. It identifies what an auditor would test and where the evidence is
currently absent.

---

## Executive summary

Olune's *engineering* controls are materially stronger than its *governance* controls.
Row-level security is enabled on all 108 application tables, every inbound webhook is
signature-verified, third-party credentials are held under AES-256-GCM envelope
encryption, and CI blocks a merge on tests, typecheck, lint, build, and a
high-severity production dependency audit. Those are real, testable controls.

The gap is that SOC 2 tests *operating effectiveness over a period*, and Olune
currently produces almost no evidence of operation. There is no tenant-scoped audit
trail, no MFA, no security monitoring or alerting, no access-review cadence, and none
of the policy set (CC1–CC3, CC9) that an examination opens with. An auditor would not
be able to start fieldwork today.

One finding is severe enough to be treated as a live incident rather than a gap:
**CI provisions a cross-tenant superuser with a publicly documented password into the
production database on every merge to `main`** (SOC2-01). That should be remediated
before any other work on this list.

### Findings by severity

| # | Finding | TSC | Severity |
|---|---------|-----|----------|
| SOC2-01 | CI seeds a cross-tenant superuser with a published static password | CC6.1, CC6.2, CC6.3 | **Critical** |
| SOC2-02 | No tenant-scoped audit trail | CC7.2, CC6.1 | **High** |
| SOC2-03 | No MFA on any account, including cross-tenant operators | CC6.1 | **High** |
| SOC2-04 | No automated proof of tenant isolation | CC4.1, CC7.1 | **High** |
| SOC2-05 | No security monitoring, alerting, or incident detection | CC7.2, CC7.3, CC7.4 | **High** |
| SOC2-06 | Rate limiting is non-functional in production | CC6.6, CC6.7 | **High** |
| SOC2-07 | Unreviewed schema changes auto-apply to production | CC8.1 | **Medium** |
| SOC2-08 | No key management or rotation procedure | CC6.1, C1.1 | **Medium** |
| SOC2-09 | No data retention, disposal, or portability capability | CC6.5, P4.2, P6.1 | **Medium** |
| SOC2-10 | CSP permits `unsafe-inline` and `unsafe-eval` | CC6.6 | **Medium** |
| SOC2-11 | No documented or tested backup/restore capability | A1.2, A1.3 | **Medium** |
| SOC2-12 | Governance and policy set does not exist | CC1.x, CC2.x, CC3.x, CC9.x | **High** (blocking) |
| SOC2-13 | Non-constant-time secret comparison | CC6.1 | **Low** |

---

## Controls observed to be operating

Recorded because an examination needs the positive evidence as much as the gaps.

| Control | Evidence |
|---------|----------|
| RLS enabled on every application table | 108 of 108 `create table` statements in `supabase/migrations/` have a matching `enable row level security` |
| Inbound webhooks authenticated | `app/api/webhooks/stripe/route.ts:42`, `app/api/webhooks/stripe-connect/route.ts:54` (Stripe `constructEvent`); `app/api/webhooks/xero/route.ts:46` (HMAC via `lib/xero/webhook-verify`) |
| Third-party credentials encrypted at rest | AES-256-GCM envelope in `lib/integrations/crypto.ts`, mirrored in `lib/email/crypto.ts`, `lib/advertising/crypto.ts`; only the last 4 chars ever reach the browser (`secretTail`) |
| Production secret presence enforced | `lib/env/required-secret.ts` — 9 secrets rejected if unset in production, with `tests/env-required-secrets.test.ts` failing if a call site is added without an entry |
| Service-role blast radius contained | `SUPABASE_SERVICE_ROLE_KEY` confined to 14 server-only modules; `lib/supabase/admin.ts` documents the contract; never referenced from a client component |
| Transport and browser hardening | `next.config.ts` — HSTS (2y, `includeSubDomains`, `preload`), CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` |
| Secrets never committed | Broad `.env*` gitignore; no `sk_live`/JWT/private-key material in any tracked file or in history |
| Change gate in CI | `.github/workflows/ci.yml` — unit tests, typecheck, lint, i18n parity, `next build`, `npm audit --omit=dev --audit-level=high` |
| Input validation | Zod schemas on API bodies (e.g. `app/api/email/send/route.ts:9-13`), UUID validation, PostgREST filter sanitization (`app/api/portal/search/route.ts:20-22`) |
| Cron secrets kept out of URLs | `lib/cron/auth.ts:21-24` — query-string secret accepted in local dev only |

---

## Findings

### SOC2-01 — CI provisions a cross-tenant superuser with a published password · **Critical**
**TSC:** CC6.1 (logical access), CC6.2 (credential issuance), CC6.3 (least privilege)

> **Status: partially remediated (31 Aug 2026).** The code-side exposure is closed on
> this branch — see *Remediation applied* below. **The credential itself is still live
> and must be rotated by hand**; that requires Supabase dashboard access and is not
> something a repository change can do.

`.github/workflows/ci.yml:126-130` ran `scripts/seed-platform-admin.mjs` on **every
push to `main`**, against the production Supabase project (`secrets.NEXT_PUBLIC_SUPABASE_URL`
+ `secrets.SUPABASE_SERVICE_ROLE_KEY`), and `.github/workflows/supabase-database.yml:60`
ran the same step on manual dispatch. The script:

- creates `platform-admin@olune.test` with the hardcoded password `testadmin123`
  (`scripts/seed-platform-admin.mjs:13-14`);
- grants `permissions: ["*"]` in `platform_operators` (line 75) — cross-tenant access
  to every studio's data via `/platform/*`;
- sets `email_confirm: true`, bypassing verification;
- **resets the password on every run**, so rotation by an operator is silently undone
  at the next merge;
- prints the password to stdout, i.e. into GitHub Actions logs readable by anyone with
  repo access;
- has **no environment guard** — no `NODE_ENV`, `VERCEL_ENV`, or explicit-opt-in check.

`TEST_ACCOUNTS.md` publishes the credentials in the repository and explicitly instructs
running the script "against your **production** Supabase project."

`lib/platform/auth.ts:23` compounds this: `PLATFORM_OPERATOR_EMAILS` grants operator
rights on a matching email string alone, with no table row required.

This is a standing, unremovable backdoor to every tenant's data — which for this
product means minors' names, addresses, photos, medical notes, and guardian payment
details. An auditor would treat it as a reportable exception regardless of remediation
date; a breach notification obligation may already exist.

#### Remediation applied

1. The `Seed platform test admin` step is removed from **both** workflows
   (`ci.yml`, `supabase-database.yml`). The `migrate-and-seed` job name is kept so any
   existing branch-protection rule keeps matching; it now only pushes migrations.
2. `scripts/seed-platform-admin.mjs` refuses to run unless
   `ALLOW_PLATFORM_ADMIN_SEED=1` is set explicitly on every run, takes
   `PLATFORM_ADMIN_PASSWORD` from the environment with no default and a 16-character
   minimum, rejects the published `testadmin123` by name, and **refuses outright when
   `$CI` is set** — so re-adding a workflow step fails loudly instead of silently
   reprovisioning the account. It no longer prints the password, and it names the
   target host before writing.
3. Credentials are removed from `TEST_ACCOUNTS.md`, `docs/SETUP_DATABASE.md`, and
   `scripts/setup-all.sh`, each replaced with the generate-your-own invocation.
4. `tests/seed-platform-admin-guard.test.ts` holds the refusals in CI, including the
   ordering that makes the burned-password message reachable.

#### Still outstanding — needs dashboard access

1. **Rotate or delete `platform-admin@olune.test`.** It exists in production now with
   the published password. Nothing in this repository can change that.
2. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** — it has been used from CI in runs that also
   logged the password.
3. **Review Supabase auth logs** for sign-ins to that account that were not yours, and
   `platform_audit_log` for operator actions you do not recognise.
4. **Remove the `PLATFORM_OPERATOR_EMAILS` bypass** (`lib/platform/auth.ts:23`), which
   grants operator rights on an email match alone with no table row and no audit trail.
   Left in place deliberately: if any current operator is configured by env var without
   a `platform_operators` row, removing it locks them out of `/platform`. Confirm the
   roster in the table first, then delete the allowlist branch.

---

### SOC2-02 — No tenant-scoped audit trail · **High**
**TSC:** CC7.2, CC6.1

> **Status: foundation landed, coverage partial (1 Sep 2026).** The table, the
> write path and the first six call sites exist — see *Remediation applied*
> below. The remaining call sites are not yet wired, so this finding stays open.

`platform_audit_log` (`supabase/migrations/0026_platform_admin.sql:143`) is the only
audit facility, and `lib/platform/audit.ts` is called from 26 sites — **all** under
`app/platform/`. Nothing records what happens inside a studio: no log of a studio admin
viewing or exporting student records, changing a user's role, issuing a refund, deleting
a family, or connecting an integration. Authentication events (sign-in, failed sign-in,
password reset) are not captured beyond Supabase's own short-lived internal logs.

The table is also mutable by the service role, has no retention period, and no
tamper-evidence — an auditor will ask how you prove entries were not altered.

#### Remediation applied

- `supabase/migrations/0126_audit_events.sql` — `audit_events`, scoped by
  `studio_id`, indexed for the three questions actually asked of it (recent
  activity in a studio, everything one actor did, everything that touched one
  record). Readable by that studio's own admins and by platform operators.
- **Append-only at the database.** `update` and `delete` are revoked from `anon`,
  `authenticated` *and* `service_role`; `insert` is granted to `service_role`
  alone. `service_role` bypasses RLS but not table grants, so this is what makes
  the table immutable through the API rather than merely by convention — the
  distinction between "we keep a log" and evidence.
- `lib/audit/events.ts` — typed action catalogue with severity, so a call site
  cannot invent `student.delete` beside `student.deleted` and split one action
  into two histories.
- `lib/audit/log.ts` — the single write path. Never throws: it runs after the
  action it records has already succeeded, so a throw would report a successful
  delete as a failure and invite a second one. Failures route to a replaceable
  handler, which is where monitoring attaches once SOC2-05 lands.
- `tests/audit-log.test.ts` — 8 tests covering the row shape (a column rename
  otherwise fails only in production), both failure paths, and the severity
  classification.

**Live call sites (6):** `student.created`, `student.deleted`,
`student.bulk_deleted`, `parent.deleted`, `member.invited`, `member.removed`.

#### Still outstanding

1. **Coverage.** Roughly 8,100 lines of admin server actions exist; six actions
   are instrumented. Still unwired, and all catalogued: refunds and invoice
   voids (`app/portal/admin/billing/actions.ts`), integration connect and
   disconnect (`settings/connections/actions.ts`), studio settings changes,
   enrolment changes, and parent create/update.
2. **Data exports.** `data.exported` is catalogued but nothing emits it, because
   no self-serve export exists yet — it lands with SOC2-09.
3. **Auth events.** Sign-in, failed sign-in and password reset are still only in
   Supabase's own short-lived logs. Capturing them needs either an auth hook or
   log drain, which is a separate piece of work.
4. **Retention.** Deliberately not enforced in 0126: a purge job is itself a
   deletion path into an append-only table and needs its own justification.
   SOC 2 wants at least the observation window; 12 months is the norm.
5. **External sink.** Everything above still lives in the same database it
   audits. A copy shipped somewhere the application cannot reach is what
   survives a compromise of the application.

---

### SOC2-03 — No MFA on any account · **High**
**TSC:** CC6.1

`supabase/config.toml:36-41` enables TOTP enrolment and verification at the project
level, but no application code enrolls a factor, issues a challenge, or requires `aal2`
— a search for `mfa`, `totp`, `aal2`, or `authenticator` across `app/` and `lib/`
returns no functional hits. Password policy is a client-side `length < 8` check
(`app/reset-password/page.tsx:57`, `app/welcome/page.tsx:32`).

Platform operators hold `permissions: ["*"]` across all tenants behind a password
alone. Combined with SOC2-01, that password is public.

**Remediate:** mandatory TOTP for `/platform` operators (enforce `aal2` in
`requirePlatformOperator`), offered and strongly encouraged for studio admins; raise
the password minimum and enable Supabase's leaked-password protection.

---

### SOC2-04 — No automated proof of tenant isolation · **High**
**TSC:** CC4.1, CC7.1

Isolation rests entirely on 119 migrations of hand-written RLS policy, with several
rounds of reactive correction already in the history (`0034_email_inbox_rls_fix`,
`0039_security_rls_and_indexes`, `0044_consolidate…`, `0047_rls_initplan…`,
`0048_security_linter_fixes`, `0074_fix_rls_initplan`, `0075_security_linter_fixes`).
No test asserts that tenant A cannot read tenant B: of 60 unit test files none cover
RLS, and the 3 integration tests in `tests/integration/` require a live database and
do not run in CI.

The policy surface is correct as far as spot checks go — but "we reviewed it carefully"
is not evidence an auditor can test.

**Remediate:** a per-table isolation suite that seeds two studios and asserts, for every
table, that a member of A reads zero rows of B — run in CI against an ephemeral Supabase
branch. Follow with an external penetration test; the report is itself the CC4.1 evidence.

---

### SOC2-05 — No security monitoring, alerting, or incident detection · **High**
**TSC:** CC7.2, CC7.3, CC7.4

There is no error-monitoring or log-aggregation service anywhere in the codebase, and
84 unstructured `console.*` calls in `app/` and `lib/` are the only telemetry. Nothing
alerts on webhook signature failures, cron failures, 5xx rate, authentication anomalies,
or service-role usage. Without detection there is also no incident response, no defined
severity levels, and no customer-notification path — CC7.4 and CC7.5 are untestable.

**Remediate:** structured logging with a retained sink; error monitoring (Sentry or
equivalent) on client, server, and edge; alerting on the events above; a written
incident response plan with severity tiers, on-call, and a rehearsed tabletop.

---

### SOC2-06 — Rate limiting is non-functional in production · **High**
**TSC:** CC6.6, CC6.7

`lib/rate-limit.ts` is an in-process `Map`. Vercel runs many isolated instances, each
with an empty map, so the effective limit is `limit × instance_count` and resets on
every cold start — the file's own header acknowledges this. It is applied to 10 of 50
API routes, and **not** to sign-in, password reset, or invitation acceptance, which is
where brute-force protection matters most.

**Remediate:** move to a shared store (Upstash Redis / Vercel KV) and extend coverage to
all authentication endpoints and unauthenticated POST routes.

---

### SOC2-07 — Unreviewed schema changes auto-apply to production · **Medium**
**TSC:** CC8.1

`.github/workflows/ci.yml` runs `supabase db push --linked --yes` against production on
every push to `main`, with no approval gate, no migration review step, and no documented
rollback. The project ref falls back to a hardcoded literal (`wnoxcwihrzbxvogvmhqv`) —
which `STAGING_AUDIT.md` describes as *staging*, an unresolved ambiguity also flagged in
`MARKET_READINESS.md §0.1`. There is no evidence in the repository of branch protection
or a required-review rule, and `main` carries direct merge commits.

**Remediate:** require PR review and passing checks on `main` (branch protection);
add a GitHub Environment with a required reviewer on the migration job; resolve the
staging/production project identity and remove the hardcoded fallback ref; document
rollback for each migration.

---

### SOC2-08 — No key management or rotation procedure · **Medium**
**TSC:** CC6.1, C1.1

`lib/integrations/crypto.ts:13-18` derives its AES key from
`INTEGRATIONS_TOKEN_ENCRYPTION_KEY`, falling back to `EMAIL_TOKEN_ENCRYPTION_KEY ??
CRON_SECRET`. `requireSecret` correctly refuses the fallback in production — a good
control — but the pattern still reuses one secret across trust boundaries outside
production, and re-keying is unhandled: `decryptIntegrationSecrets` fails soft, so a
rotation silently degrades every connection to "not connected" with no re-encryption
path and no alert.

There is no documented rotation cadence or procedure for any key, including
`SUPABASE_SERVICE_ROLE_KEY`, Stripe keys, or webhook secrets.

**Remediate:** distinct keys per domain with no cross-domain fallback; a versioned key
id in the ciphertext envelope plus a re-encryption path; a written rotation procedure
with a defined cadence and a post-SOC2-01 rotation of the service-role key.

---

### SOC2-09 — No data retention, disposal, or portability capability · **Medium**
**TSC:** CC6.5, P4.2, P6.1

`/data-deletion` is a static instructions page; deletion is a manual email request with
no SLA, no verification of the requester, and no record that it was performed. There is
no retention policy (how long a departed student's records persist), no anonymization,
no scheduled purge, and no self-serve export. `lib/platform/types.ts:139` defines a
`data_export` support-request *category* — the capability behind it does not exist.

The product ships `fr`, `it`, `ru`, and `zh` locales, so GDPR applies alongside the NZ
Privacy Act 2020; the subject population is largely minors, which raises COPPA and
state student-privacy law for any US studio.

**Remediate:** a written retention schedule per data class with automated enforcement;
authenticated self-serve export (portability); a logged, verified deletion workflow;
and a published sub-processor list (Supabase, Stripe, Vercel, Xero, Meta, TikTok,
email/SMS providers).

---

### SOC2-10 — CSP permits `unsafe-inline` and `unsafe-eval` · **Medium**
**TSC:** CC6.6

`next.config.ts` sets a genuine CSP — a real strength — but `script-src` includes both
`'unsafe-inline'` and `'unsafe-eval'`, which removes its value as an XSS mitigation.
Any injection becomes fully weaponisable, and this application renders studio-authored
site-builder content and inbound email bodies.

**Remediate:** nonce-based script loading via middleware, dropping `unsafe-inline`, then
`unsafe-eval`. Retain `frame-ancestors` and `object-src 'none'` as-is.

---

### SOC2-11 — No documented or tested backup/restore capability · **Medium**
**TSC:** A1.2, A1.3

Supabase takes managed backups, but the repository contains no restore runbook, no
RTO/RPO target, no evidence a restore has ever been performed, and no availability
commitment to customers. A1.3 specifically requires *testing* recovery — an untested
backup is not a control.

**Remediate:** define RTO/RPO; write and rehearse a point-in-time-recovery runbook at
least annually with the result recorded; add external uptime monitoring and a status page.

---

### SOC2-12 — Governance and policy set does not exist · **High (blocking)**
**TSC:** CC1.1–CC1.5, CC2.1–CC2.3, CC3.1–CC3.4, CC5.x, CC9.1–CC9.2

An examination opens with the common criteria that are entirely organizational, and
none are in place: no information security policy set, no defined security ownership or
org chart, no risk assessment or risk register, no vendor/sub-processor management with
tiering and annual review, no access-review cadence, no onboarding/offboarding checklist,
no background-check policy, no security awareness training, no change management policy,
no acceptable use or endpoint policy, and no business continuity plan.

Customer-facing legal artifacts are equally absent: no Terms of Service, no DPA (Olune
is a processor of children's data for every studio), no sub-processor list, and no
cookie/tracking notice despite shipping Vercel Analytics and Meta/TikTok OAuth.

This blocks the examination independent of any technical remediation. A compliance
platform (Vanta, Drata, Secureframe) is the conventional way to generate this set and
collect the continuous evidence CC4.1 requires.

---

### SOC2-13 — Non-constant-time secret comparison · **Low**
**TSC:** CC6.1

`lib/cron/auth.ts:19` compares the bearer token with `===`, which short-circuits on the
first differing byte. Remote exploitation across network jitter is impractical, but
`crypto.timingSafeEqual` on equal-length buffers is a one-line fix and removes the
question from the auditor's list.

---

## Recommended sequence

**Immediate (this week) — treat SOC2-01 as an incident**
Remove the CI seed step; rotate the platform-admin credential and the service-role key;
review auth logs for unauthorized cross-tenant sign-in; strip credentials from
`TEST_ACCOUNTS.md`; remove the `PLATFORM_OPERATOR_EMAILS` bypass.

**Phase 1 (weeks 1–4) — make the system observable and defensible**
SOC2-02 (tenant audit trail), SOC2-05 (monitoring + alerting + IR plan), SOC2-03 (MFA
for operators), SOC2-06 (shared-store rate limiting on auth routes), SOC2-13.

**Phase 2 (weeks 4–10) — make isolation provable**
SOC2-04 (RLS isolation suite in CI, then external pentest), SOC2-07 (branch protection
+ migration approval gate + resolve the staging/production ambiguity), SOC2-08 (key
management), SOC2-10 (nonce CSP).

**Phase 3 (weeks 6–14) — policy, privacy, and continuity, in parallel**
SOC2-12 (policy set, risk register, vendor management, access reviews, training — via a
compliance platform), SOC2-09 (retention, export, deletion workflow, sub-processor list,
ToS + DPA), SOC2-11 (DR runbook + rehearsal + uptime monitoring).

**Then:** a Type I readiness review confirming design, followed by a 3-month minimum
observation window before Type II fieldwork. Realistically **6–9 months** to a Type II
report from today, with the first two weeks being the difference between "gaps" and "a
reportable exception."

---

## Scope note

This assessment covers only what is observable in the repository. It does not cover
Supabase and Vercel account configuration (operator roster, MFA enforcement, network
restrictions, log retention, backup settings), Stripe account access, production
environment variables, HR and organizational process, or physical security — all of
which an examination would test and none of which can be confirmed from source. The
sub-service organizations (Supabase, Vercel, Stripe) each carry their own SOC 2 report
that Olune should collect, review annually, and reference under the carve-out method.
