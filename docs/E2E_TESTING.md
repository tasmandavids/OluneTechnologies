# Authenticated browser release tests

The Playwright suite covers role routing, the admin dashboard/People/Classes/Money
surfaces, mobile authentication routing, and the cross-studio host boundary. It is
read-only by design: it does not create enrolments, record payments, send messages,
or mutate production data.

## Safety boundary

Use an isolated staging or preview environment with disposable test accounts. The
suite refuses `olune.co.nz` and its subdomains by default. A production read-only run
requires the explicit `E2E_ALLOW_PRODUCTION_READONLY=1` override; mutation tests must
never use that override.

The repository does not contain account passwords. Configure only the roles available
in the target environment:

```text
E2E_BASE_URL=https://preview.example.test
E2E_ADMIN_EMAIL=...
E2E_ADMIN_PASSWORD=...
E2E_ADMIN_BASE_URL=https://studio-a.preview.example.test
E2E_OFFICE_EMAIL=...
E2E_OFFICE_PASSWORD=...
E2E_TEACHER_EMAIL=...
E2E_TEACHER_PASSWORD=...
E2E_PARENT_EMAIL=...
E2E_PARENT_PASSWORD=...
E2E_STUDENT_EMAIL=...
E2E_STUDENT_PASSWORD=...
E2E_FOREIGN_STUDIO_BASE_URL=https://studio-b.preview.example.test
E2E_FOREIGN_STUDIO_MARKER="Studio B unique fixture text"
```

Each role can override the shared URL with `E2E_<ROLE>_BASE_URL`. This matters when
testing studio subdomains and shared auth cookies.

## Run

```bash
npm run test:e2e:install
npm run test:e2e
```

The next expansion is mutation coverage for registration, onboarding, enrolment,
attendance and payment recording. That requires a separate non-production Supabase
project plus deterministic seed/reset automation. Project `wnoxcwihrzbxvogvmhqv`
is production and must never be the target of mutation tests.

## Database tenant-isolation gate

CI starts a disposable local Supabase database, replays all migrations, and runs
`supabase/tests/tenant_isolation.sql` before it can apply migrations to production.
The suite exercises live Postgres RLS with two studios, separate families, a
cross-studio membership, stale token claims, and revoked access. Its fixtures
and write attempts run in a rolled-back transaction.

To run the same check locally with Docker available:

```bash
npx supabase start --exclude edge-runtime,imgproxy,logflare,mailpit,postgres-meta,realtime,storage-api,studio,supavisor,vector --yes
npm run test:rls
npx supabase stop --no-backup
```

`supabase/seed.sql` remains a manual sample-data template with placeholder IDs;
automatic seeding is disabled so a new local database can start cleanly.
If another local Supabase project already uses ports 54321–54322, assign unused
ports in your local `supabase/config.toml` before starting this test database.
