# Olune

A multi-tenant, white-label studio platform (built for dance schools). One
codebase serves many studios — each with its own isolated data, subdomain, and
brand. Stack: **Next.js 15 (App Router) · Supabase (Postgres + Auth + RLS) ·
Tailwind v4 · Framer Motion · React Three Fiber**.

> See **OLUNE_PROGRESS.md** for a detailed build log.

## What's in here

```
olune/
├─ middleware.ts                     role-based routing → /portal/<role>
├─ app/                              App Router pages + API routes
├─ components/                       UI (admin, site builder, marketing)
├─ lib/                              branding, tenant, stripe, site blocks
├─ supabase/
│  ├─ config.toml                    CLI + GitHub integration config
│  ├─ migrations/0001–0056.sql       schema (applied via GitHub or db push)
│  └─ seed.sql                       optional sample data (local reset only)
└─ tests/                            vitest unit + integration tests
```

## Features

**Studio portal** (`/portal/admin`, `/portal/teacher`, `/portal/parent`,
`/portal/student`, `/portal/office`) — classes, enrollments, waitlist, billing,
Stripe payments and Connect settlement ([docs](docs/STRIPE_CONNECT.md)),
subscriptions, events, shop, self-managed student class passes
([docs](docs/class-passes.md)), leads CRM, messaging, email inbox, support,
staff HR + shifts, parent profiles, student progress, Studio site builder
([docs](docs/site-builder-v2.md)), advertising hub (Meta/TikTok OAuth, AI
campaigns, SEO audits), Xero accounting, and studio settings.

**Platform console** (`/platform`) — cross-tenant studio directory, owners,
support inbox, ops tasks, feature flags, announcements, audit log.

**Public sites** — per-studio subdomains with custom branding, block-based site
builder, and site-wide i18n (English, French, Italian, Russian).

**Onboarding** — studio signup wizard plus post-onboarding `/setup` guide.

## Setup (~15 min)

**1. Install**

```bash
npm install
```

**2. Supabase project**

Create a project at [supabase.com](https://supabase.com) (or use the linked
production project). Copy URL + anon key from **Settings → API**.

**3. Environment**

```bash
cp .env.local.example .env.local
```

Fill in at minimum:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (required for student invites, image uploads, crons)
- `NEXT_PUBLIC_ROOT_DOMAIN=localhost` for local dev

**4. Database migrations**

Choose one:

| Method | When to use |
|--------|-------------|
| **GitHub integration** (recommended) | Connect the repo in Supabase Dashboard → Integrations → GitHub. Migrations in `supabase/migrations/` deploy when you push/merge to `main`. |
| **CLI** | Local development or one-off sync: `npm run db:push` |

First-time CLI setup:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
```

**5. Auth (dev)** — Supabase → Authentication → Providers → Email: disable
email confirmation so onboarding flows straight through.

**6. Run**

```bash
npm run dev
```

Visit **http://localhost:3000/onboarding** to create a studio. Preview the public
site at **http://YOUR-SLUG.localhost:3000** (not plain `localhost`).

## Supabase + GitHub workflow

After connecting GitHub in the Supabase dashboard:

1. Set **production branch** to `main` (or your deploy branch).
2. Enable **Deploy to production** so new migration files apply automatically.
3. Add new schema changes as `supabase/migrations/0050_description.sql`.
4. Commit and push — Supabase runs pending migrations on merge.

Do **not** edit production schema in the SQL editor without adding a matching
migration file, or GitHub deploys will drift.

**Every push to `main`** also runs the CI `migrate-and-seed` job (tests →
migrations → seed). Add the four GitHub secrets in
[`docs/SETUP_DATABASE.md`](docs/SETUP_DATABASE.md) so that job succeeds.

Merge feature branches with an explicit merge commit (not fast-forward):

```bash
./scripts/merge-to-main.sh cursor/your-branch
```

CLI helpers (optional):

```bash
npm run db:status   # compare local vs remote migration history
npm run db:push     # apply pending migrations to linked project
```

For CLI auth errors, run `npx supabase login` or set `SUPABASE_ACCESS_TOKEN`
from [Account → Access Tokens](https://supabase.com/dashboard/account/tokens).

## Deploy (Vercel)

Push to GitHub → import to Vercel → set the same env vars with
`NEXT_PUBLIC_ROOT_DOMAIN=yourdomain.com`.

- Add `*.yourdomain.com` as a wildcard domain in Vercel + DNS.
- Supabase → Authentication → URL Configuration: Site URL + redirect URLs.
- Scope auth cookies to `.yourdomain.com` for subdomain portal handoff.

Vercel crons (see `vercel.json`) require `CRON_SECRET` and
`SUPABASE_SERVICE_ROLE_KEY` in production.

## Test & CI

GitHub Actions runs on every PR and push to `main` (see
`.github/workflows/ci.yml`):

```bash
npm test        # unit tests (131+)
npm run typecheck
npm run lint
```

Local integration tests need a live Supabase project:

```bash
npm run test:integration  # needs INTEGRATION_TEST=1 + seed (see STAGING_AUDIT.md)
```
