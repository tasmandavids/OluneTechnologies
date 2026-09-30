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
attendance and payment recording. That requires a confirmed non-production Supabase
project plus deterministic seed/reset automation; do not point those future tests at
the currently ambiguous production/staging project.
