# Portal optimisation and safety — September 2026

## Release status

Release prepared on `release/portal-optimization-2026-09` directly from production main (`93ebcd0`). Only the optimisation commit was transplanted; unrelated Stripe PR #64 is excluded. The founder authorised production deployment on 17 September 2026. Migration `20260916001938` was applied successfully to production before the application release.

## Changes

- Installment recording now enforces database-level studio and admin/office authority, locks the payment plan, rejects invalid amounts and overpayments, and rejects inactive plans. The action validates inputs before calling SQL.
- Request-scoped identity and membership reads are reused. Dashboard totals are aggregated in PostgreSQL instead of downloading financial rows, avoiding the API row limit for those totals.
- People, invoice history and ledger pages load 50 records at a time. Search and filters run against the full visible dataset. Selection applies to the current page. Ledger running balances retain earlier history. Invoice deep links remain available outside the current page.
- Attendance and People balances use bounded aggregate queries. Optional People forms load on demand, including their contact choices.
- Public pages omit admin/platform translation namespaces. Portal and platform layouts provide their required namespaces. Custom pointer effects respect reduced-motion preferences.
- Pre-release access lasts through 31 December 2026 in Pacific/Auckland, with an exclusive cutoff of 1 January 2027 00:00 NZDT (`2026-12-31T11:00:00Z`). Existing trialing subscriptions are extended only when shorter; other subscription statuses are unchanged. New studios receive the later of this cutoff and their normal 14-day trial. Public pricing copy matches.
- Notification delivery acquires a service-only, token-owned database lease to prevent concurrent runs. Expired leases recover after ten minutes. This does not guarantee exactly-once delivery after a provider succeeds and the worker crashes.

## Validation

The unit suite has 72 files and 737 passing tests, including installment action validation. Final verification on 17 September 2026 passed: production build, type checking, lint, translation consistency (3,875 keys across eight locales), and the literal ratchet (880/881 strings). The build emitted the existing experimental edge-runtime warning; translation checks reported nonfatal untranslated-value warnings outside critical namespaces.

`scripts/test-portal-database.mjs` applies the actual migration to an isolated PGlite database. It checks denied/allowed payment roles and tenants, invalid/overpaid/completed plans, subscription cutoff behaviour, pagination/search, aggregate totals beyond 1,000 rows, attendance, ledger continuity, and lease ownership/grants. Its representative schema and RLS fixtures do not replace testing the full deployed schema or PostgREST.

Run it with `PGLITE_MODULE` pointing at an independently installed `@electric-sql/pglite` module; no production credentials are used. Run `node scripts/measure-message-payload.mjs` to reproduce translation payload measurements. English public translation JSON falls from 156,008 to 81,325 bytes (gzip 51,176 to 27,875). These are translation payload measurements, not overall page-load improvements.

Previous local browser checks verified desktop login, protected-route redirection and mobile pricing at 390px without horizontal overflow or browser errors. Authenticated dashboard, People and Money flows still require a signed-in staging session; their end-to-end performance has not been measured.

## Deployment sequence

1. Review the branch ancestry and migration; run the full migration stack against staging with representative tenant data.
2. Apply `20260916001938_portal_safety_and_dashboard.sql` before deploying the application: the new pages require its RPCs and appended class-capacity fields.
3. Verify two isolated studios plus admin, office, parent and teacher accounts. Check People search/filter/page changes and optional forms, invoice search/deep links, ledger balances, installment rejection and trial dates.
4. Deploy the application, then check real errors and route timings. A rollback should restore the previous app while retaining the additive RPCs and security fix; do not revert payment authorization or shorten granted trials as a routine rollback.

## Remaining activation and follow-up

- The current Vercel team is Hobby. Its cron schedule permits daily execution; `vercel.json` remains unchanged. Five-minute delivery requires a supported scheduler or hosting plan decision. Keep daily notification generation daily; only delivery should become frequent. Do not run delivery against production merely as a smoke test because it sends real messages.
- Before enabling frequent delivery, test lease acquisition, overlapping invocations, expiry and retries in staging, with non-production provider destinations. Store any scheduler secret securely. Re-evaluate the ten-minute lease if changing execution-duration limits.
- Confirm production Sentry and Speed Insights receive useful data; their presence in source does not establish operational monitoring. Build validation disables Sentry source-map uploads.
- Measure authenticated mobile/desktop dashboard, People and Money before/after using comparable studio data. Include navigation while a search is pending, browser back/forward, empty states and records spanning multiple pages.
- Other Money summary queries and attendance-tap history still need a separate row-limit review. The changes above do not claim every financial query is now aggregated.
- Existing audit items such as operator MFA, credential hygiene and unsupported public feature claims remain separate follow-up work.

No production data was changed, messages sent, hosting plan upgraded, or new runtime dependency added by this work.

## Release-branch verification

The isolated release excludes 12 Stripe tests: all 725 remaining tests pass (71 files). Type checking, lint, translation parity, the stricter main-branch literal budget (873/874), and isolated database checks pass. The final dependency scan found newly reported advisories; compatible updates pin Next.js 15.5.25, Nodemailer 9.1.1, Sharp 0.35.4 and Joi 17.13.8. ImapFlow's nested Nodemailer uses the same patched version through an override. The production dependency audit reports zero vulnerabilities.
