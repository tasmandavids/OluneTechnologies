# Submitting the Olune parent app

Everything the two stores ask for, what's done, and what only you can do.

Scope note up front: **"early review" means TestFlight and Play internal testing, not the public stores.** Apple rejects incomplete apps outright under Guideline 2.1, and the app currently has one working screen. TestFlight's Beta App Review is much lighter and is the right first target; Play's internal testing track has no review at all.

---

## 1. Blocked on you — start today, these are calendar time

| | Cost | Wait |
|---|---|---|
| **Apple Developer Program** | USD $99/yr | 2 days – 2 weeks (org verification needs a D-U-N-S number) |
| **Google Play Console** | USD $25 once | Days (org verification) |

Nothing else on this page can complete without both. Enrol as an **organisation**, not an individual, on both:

- Apple: an individual account puts your personal name on the listing as the seller.
- Google: personal accounts created recently must run 14 days of closed testing with 12+ testers before they can ship to production. Organisation accounts are exempt.

Enrolling on Apple also retroactively unblocks the Apple Wallet check-in passes, which are already coded and dark because `APPLE_WALLET_*` was never provisioned.

---

## 2. Decided

**Identifiers.** `nz.co.olune.parent` on both platforms — reverse DNS of `olune.co.nz`. Set in `mobile/app.config.ts`, overridable via `OLUNE_BUNDLE_ID` for a future white-label build.

**One app, one listing.** Studios are found inside the app. See §6 for why, and what it costs.

**Store name.** "Olune". Subtitle: *Your studio, in your pocket.*

---

## 3. Done in this repo

- `mobile/app.config.ts` — bundle ids, associated domains, App Links intent filters, permission strings, **privacy manifest**, **export compliance** (`ITSAppUsesNonExemptEncryption: false` — HTTPS only, which is exempt), blocked permissions.
- `mobile/eas.json` — build and submit profiles. Preview points at the ttest deployment, production at `www.olune.co.nz`.
- `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` — served by the web app on **every tenant host**, with correct content types and no redirect. They 404 until configured (§4), deliberately: Apple's CDN caches this file and a placeholder breaks deep links for as long as that cache lives.
- Push registration end to end: `POST /api/devices` → `register_device_token()` (migration 0120).

---

## 4. Environment variables to set once the accounts exist

On the **web** app (Vercel):

| Variable | Where to find it | Without it |
|---|---|---|
| `APPLE_APP_ID` | `<TeamID>.nz.co.olune.parent` | AASA 404s; iOS links open Safari |
| `ANDROID_PACKAGE_NAME` | `nz.co.olune.parent` | assetlinks 404s |
| `ANDROID_SHA256_FINGERPRINTS` | **Both** the EAS upload key and Play's app-signing key, comma-separated | App Links verify in testing, fail in production |
| `EXPO_ACCESS_TOKEN` | expo.dev → account settings | Push silently no-ops |

On the **app** (`mobile/.env` and EAS build profiles): see `mobile/.env.example`.

Verify after deploying:

```bash
curl -sS https://www.olune.co.nz/.well-known/apple-app-site-association -i | head -20
```

Expect `200`, `content-type: application/json`, and no redirect.

---

## 5. What each store will ask

### Apple — before a TestFlight build

- [ ] App Store Connect record created with the bundle id
- [ ] Export compliance — already answered in `app.config.ts`
- [ ] Privacy manifest — already in `app.config.ts`; Xcode validates it on upload
- [ ] Beta App Review notes + a **demo family account** with enrolled children, an unpaid invoice and a chat thread. An empty account reads as a broken app.
- [ ] App Privacy questionnaire (separate from the manifest, filled in the web UI)

### Apple — before public release, not needed for TestFlight

- [ ] **Sign in with Apple.** Mandatory on iOS once you offer Google sign-in. Not yet built — the app is email/password only, which is why this isn't blocking yet. Add it as a Supabase provider, not just in the app.
- [ ] **In-app account deletion (Guideline 5.1.1(v)).** `/data-deletion` is instructions only; Apple requires deletion to be *initiated in-app*. Not built. Genuinely awkward here — NZ tax law requires invoice retention for 7 years, so the honest design is request-deletion-and-scrub-PII rather than a hard delete, which Apple accepts if explained.
- [ ] **The physical-service argument, written into the review notes.** Term fees and class passes run through Stripe rather than IAP. Services consumed in the real world are exempt under Guideline 3.1.3(e), and a dance class qualifies comfortably — but say so, and point at the class date and studio address shown on every payable line.
- [ ] Screenshots: 6.9" and 6.5" iPhone, plus 13" iPad if tablet support stays on
- [ ] Privacy policy URL — `https://www.olune.co.nz/privacy` exists

### Google — before internal testing

- [ ] Play Console app record
- [ ] **Data safety form.** Must match the privacy manifest: name, email, phone, children's names/attendance, push tokens. Collected, linked to identity, not used for tracking, not sold.
- [ ] **Target audience and content.** Answer carefully: the app holds minors' data but **the account holder is an adult**. Declaring a child target audience pulls you into Families policy and Play's Teacher Approved programme, which you do not want. The audience is parents.
- [ ] Content rating questionnaire (IARC)
- [ ] Privacy policy URL
- [ ] Signed AAB — `npm run build:production`

---

## 6. Slugs, and what the single-app model actually costs

On the web a studio *is* a hostname. In a binary there is no hostname, so the slug becomes a **studio code**: the parent picks their studio once (`/api/studios/lookup`, searchable by name or code), the app stores the id, and branding is themed at runtime from the studio's row.

The one real cost is deep links. Both platforms fetch the association file from **the origin of the link being opened**, and an app can only claim origins compiled into its entitlement — so a studio's own custom domain (`book.mystudio.co.nz`) cannot open the app without shipping a new binary.

**This turns out not to matter,** because `canonicalAppUrl()` in `lib/app-url.ts` already sends every notification link to one stable origin rather than the studio's subdomain — it has to, because OAuth needs a fixed callback. So Olune's own outbound links are all on `www.olune.co.nz`, which the app claims. `*.olune.app` is claimed too, for links a studio writes by hand.

What still breaks: a link a studio hand-writes on their *custom* domain opens the browser instead of the app. The web portal handles it fine, so it degrades rather than fails.

**Do not fold the studio into the bundle id.** Per-studio binaries mean per-studio store listings, review cycles, screenshots and update rollouts — the operational cost multiplies by the number of studios. Keep it as a paid tier later; `app.config.ts` already reads its identity from env so that build is an EAS profile, not a fork.

---

## 7. Honest status

Not done, and needed before a build will even succeed:

- **App icons and splash.** `mobile/assets/` is empty and `app.config.ts` references four images. The build fails without them.
- **`npm install` has never run** in `mobile/`. Nothing there is typechecked or compiled. Run `bash bootstrap.sh`, then `npm run typecheck`.
- **Migration 0120 is still unapplied**, so push registration has no table to write to.
- **12 of 14 screens.** Phase 3–4.
