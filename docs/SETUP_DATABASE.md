# Database setup — one-time

The cloud agent **cannot** push to your Supabase project without credentials. Everything is automated; you only need to add secrets **once**, then re-run the workflow.

## Option A — GitHub Actions (recommended, ~2 min)

1. Open **GitHub → tasmandavids/NZAD → Settings → Secrets and variables → Actions → New repository secret**

2. Add these four secrets:

| Secret | Where to find it |
|--------|------------------|
| `SUPABASE_ACCESS_TOKEN` | [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) |
| `SUPABASE_DB_PASSWORD` | Supabase → Project **wnoxcwihrzbxvogvmhqv** → Settings → Database |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wnoxcwihrzbxvogvmhqv.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role (secret) |

3. Re-run the workflow: **Actions → Supabase Database Sync → Run workflow**

Or push/merge to `main` — CI runs **migrate-and-seed** automatically after tests pass (every push, not only when migration files change).

That applies pending migrations and creates/refreshes the test admin.

## Option B — Your Mac (if `.env.local` is already filled in)

```bash
git pull origin main
npm run setup:all
```

## No Supabase CLI installed?

Use **Option A** — GitHub Actions runs the CLI for you, so nothing needs to be
installed locally.

Do **not** apply migrations by hand in the SQL Editor. Migrations run in order and
record themselves in `supabase_migrations.schema_migrations`; pasting DDL skips that
bookkeeping, so the repo and the database silently diverge and `npm run db:verify`
can no longer tell you the truth.

To seed the test admin on its own (service role key in `.env.local`):

```bash
npm run seed:platform-admin
```

## Checking the database matches the repo

```bash
npm run db:verify
```

## Test login (after seed)

- **Email:** `platform-admin@olune.test`
- **Password:** `testadmin123`
- **URLs:** `/platform` and `/portal/admin`

Also set on Vercel: `PLATFORM_OPERATOR_EMAILS=platform-admin@olune.test`
