# Olune test accounts

There is no shared, pre-set test password in this repository, and no account is
seeded automatically. Until August 2026 there was one — `platform-admin@olune.test`
with a password printed in this file — and CI recreated it on the production
project on every merge to `main`, resetting the password each time. See
`docs/SOC2_READINESS.md` (SOC2-01) for the full write-up.

## Creating a platform operator

`scripts/seed-platform-admin.mjs` creates one. Read its header first: the account
is a **cross-tenant superuser** — a `platform_operators` row with
`permissions: ["*"]`, which reads every studio's data. It is for local and
preview databases.

```bash
# 1. Apply migrations (if not already)
npm run db:push

# 2. Create the operator. Both variables are required; there is no default
#    password, and the script refuses to run from CI.
ALLOW_PLATFORM_ADMIN_SEED=1 \
PLATFORM_ADMIN_PASSWORD="$(openssl rand -base64 24)" \
  npm run seed:platform-admin
```

Generate the password, use it once, and keep it in a password manager — not in a
file in this repo. `PLATFORM_ADMIN_EMAIL` overrides the default address of
`platform-admin@olune.test`.

The script is idempotent and resets the password of an existing account to the
one you supply, so re-running it is also how you rotate.

### After sign-in

| Console | URL |
|---------|-----|
| Olune platform (cross-tenant) | `/platform` |
| Demo studio admin | `/portal/admin` |
| Demo studio public site | `demo.localhost:3000` (dev) or `demo.olune.app` (prod) |

## What the seed script creates

- Auth user (email confirmed)
- `platform_operators` row with `permissions: ["*"]` → access to `/platform/*`
  and to every studio's data
- Demo studio **Demo Studio** (`slug: demo`) → access to `/portal/admin`
- Default branding row for the demo studio

## Production

Do not run this against production. A real operator account should be created
deliberately — with its own address, its own password, and (once SOC2-03 is
closed) an enrolled MFA factor — rather than seeded from a script that also
provisions a demo studio.

`PLATFORM_OPERATOR_EMAILS` grants operator access on an email match alone, with
no `platform_operators` row and no audit trail. It is a bypass, tracked under
SOC2-01; prefer a table row.
