# Google OAuth setup

Olune uses Supabase Auth with a Next.js callback at `/auth/callback`.

**Supabase project:** `wnoxcwihrzbxvogvmhqv`  
**Supabase OAuth callback (use in Google Cloud Console):**

```
https://wnoxcwihrzbxvogvmhqv.supabase.co/auth/v1/callback
```

---

## 1. Redirect URLs (Supabase)

Run the setup script (uses `SUPABASE_ACCESS_TOKEN` from `.env.local`):

```bash
node --env-file=.env.local scripts/setup-oauth.mjs
```

This adds:

- `http://localhost:3000/auth/callback`
- `http://127.0.0.1:3000/auth/callback`
- Production URLs when `NEXT_PUBLIC_APP_URL` or `NEXT_PUBLIC_ROOT_DOMAIN` is set

…and it sets the **Site URL** to the production origin.

### Diagnosing a sign-in that lands somewhere unexpected

```bash
node --env-file=.env.local scripts/setup-oauth.mjs --check
```

Read-only — it changes nothing, so it is safe to run against production while a
studio is reporting a problem. It prints the Site URL and the redirect
allow-list, and flags the two faults that strand a user mid-sign-in:

- **A loopback Site URL** (`http://127.0.0.1:3000`, `http://localhost:3000`).
  This is what a Supabase project starts life with. Supabase falls back to the
  Site URL whenever a redirect target is not allow-listed, so a live sign-in
  ends on a dead `127.0.0.1` tab — `ERR_CONNECTION_REFUSED` — even though the
  credentials were accepted.
- **Missing `/**` globs** for a host we actually sign in from, which is what
  triggers that fallback in the first place.

Re-run without `--check` to repair both.

### Custom studio domains (self-serve)

Studios can connect their own domain (e.g. `book.mystudio.co.nz`) from
**Admin → Website → Domain**. Because these domains are arbitrary they can't be
covered by a wildcard, so the save action registers each one in the Supabase
redirect allow-list at runtime via the Management API
(`lib/supabase/auth-redirects.ts`).

**Required in production:** `SUPABASE_ACCESS_TOKEN` must be set as a **Vercel
environment variable** (Production scope), not just in `.env.local`. Without it
the domain still saves, but Google sign-in from that domain will fail and the
admin sees a warning. The Supabase project ref is read from
`NEXT_PUBLIC_SUPABASE_URL` (override with `SUPABASE_PROJECT_REF`).

---

## 2. Google

### A. Google Cloud Console

1. Open [Google Cloud Credentials](https://console.cloud.google.com/apis/credentials)
2. Create **OAuth client ID** → type **Web application**
3. **Authorized JavaScript origins**
   - `http://localhost:3000`
   - Your production URL (e.g. `https://olune.app`)
4. **Authorized redirect URIs**
   - `https://wnoxcwihrzbxvogvmhqv.supabase.co/auth/v1/callback`
5. Copy **Client ID** and **Client secret**

### B. Enable in Supabase

Add to `.env.local`:

```env
GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
```

Then run:

```bash
node --env-file=.env.local scripts/setup-oauth.mjs --enable-google
```

Or paste credentials in [Supabase → Auth → Providers → Google](https://supabase.com/dashboard/project/wnoxcwihrzbxvogvmhqv/auth/providers).

---

## 3. Test locally

```bash
npm run dev
```

1. Visit `http://localhost:3000/login`
2. Click **Continue with Google**
3. After auth you should land in `/portal` (existing user) or `/onboarding` (new user)

---

## Troubleshooting

| Symptom | Fix |
|--------|-----|
| `redirect_uri_mismatch` | Google redirect URI must be the **Supabase** callback URL, not `/auth/callback` |
| Bounced back to login | Check redirect URLs in Supabase include `http://localhost:3000/auth/callback` |
| New user stuck | Should redirect to `/onboarding` — profile is created by `handle_new_user` trigger |
