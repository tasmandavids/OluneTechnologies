# Release 1.6.1 — "The Map Is the Product" (IA Consolidation)

**Status:** Ready for implementation
**Scope discipline:** UI-level restructure ONLY. No database schema changes, no migration files, no backend/data-flow rewrites, no removal of payment options. If a work item seems to require a schema change, stop and flag it instead.
**Origin:** UX surgery audit, 2026-07-07. Core finding: individual screens are cleaner than competitors, but the information architecture is accreting Jackrabbit-style sprawl — the same job lives in multiple places, and every feature got its own nav item.

---

## Guiding rules for every change in this release

1. One job-to-be-done = one door. Merge surfaces; don't add nav items.
2. Rename before you restructure — jargon kills straightforwardness before layout does.
3. No behavior/business-logic changes. All existing routes must keep working (redirect old paths to new homes with `next.config.ts` redirects or route-level `redirect()`).
4. All labels go through i18n (`messages/en/core.json` etc.). Update every locale file (en, fr, it, ru, zh) — machine-translate non-English if needed and mark with a `// TODO review` comment convention used in the repo, or leave English fallback if that's the existing pattern.
5. Server Components stay server; only add `"use client"` where interactivity requires it.
6. Keep the existing panel pattern (list → slide-over view/edit/delete) — it's a strength. Reuse it for merged screens.

---

## Work Item 1 — Consolidate Finance into one door (HIGHEST PRIORITY)

**Problem:** Finance nav = Billing, Accounting, Subscriptions, Payment plans (4 items). Subscriptions are ALSO rendered inside `components/admin/billing/BillingDashboard.tsx`, and billing ALSO appears as a tab in `components/admin/parents/ParentDetailHub.tsx`. "Did the Smiths pay?" has 3+ plausible doors.

**Change:**
- Collapse the Finance section in `lib/portal/nav-config.ts` to two items: **Billing** (`/portal/admin/billing`) and **Accounting** (`/portal/admin/accounting`).
- `/portal/admin/subscriptions` and `/portal/admin/payment-plans` become tabs INSIDE the Billing page: tabs = Invoices | Subscriptions | Payment plans. Reuse existing page components as tab content — do not rewrite their internals.
- Remove the duplicate subscriptions block currently embedded in `BillingDashboard.tsx` (the standalone subscriptions component becomes the single source, now living in the Subscriptions tab).
- Add redirects: `/portal/admin/subscriptions` → `/portal/admin/billing?tab=subscriptions`, `/portal/admin/payment-plans` → `/portal/admin/billing?tab=payment-plans`. Tab state via `?tab=` query param so deep links keep working.
- ParentDetailHub's billing tab stays (it's contextual, that's fine) but must link out to the invoice in Billing rather than duplicating actions where it currently does.

## Work Item 2 — Slim the admin nav from 20 items / 7 sections to ~13 / 4

**Problem:** `lib/portal/nav-config.ts` `ADMIN_NAV` has 20 items across 7 sections. "Staffing" (Substitutes, Teacher availability) vs "Team" (Staff) is a codebase distinction, not a user one.

**Change to `ADMIN_NAV`:**
- Merge "Staffing" into "Team": Staff, Substitutes, Teacher availability all under one **Team** section. Better: make Substitutes and Availability tabs inside `/portal/admin/staff` if the panel pattern allows without deep surgery; otherwise keep as nav children under a Staff group item (the nav already supports `children`).
- "Client management" → rename to **Families**: Parents, Students, Leads (unchanged items).
- "Digital" section: keep Website, Shop. Move Advertising under Website as a child item (it's a website/marketing concern).
- Communications: see Work Item 3.
- Target end state: Dashboard, Classes, Events | Team (Staff [+Subs/Availability]) | Families (Parents, Students, Leads) | Finance (Billing, Accounting) | Website (+Advertising), Shop | Inbox, Olune Support | Settings.

## Work Item 3 — One inbox per audience

**Problem:** Admin has Email, Messages, Support (3 comms doors). Parents have "Studio chat" AND "Studio email" as separate nav items. Parents shouldn't decide which channel class their message belongs to.

**Change (UI-level only — do NOT merge backends):**
- Admin: combine Email + Messages into one nav item **Inbox** (`/portal/admin/messages` as canonical route) with two tabs: Messages | Email. `/portal/admin/email` redirects to `/portal/admin/messages?tab=email`. Existing `EmailInbox.tsx` and `MessagesPanel.tsx` render inside their tabs unchanged. "Olune Support" stays separate (it's support-for-the-owner, different job).
- Parent: combine "Studio chat" + "Studio email" into one nav item **Messages** (`/portal/parent/chat` canonical) with tabs Chat | Email. `/portal/parent/messages` redirects with `?tab=email`. Same treatment for the student portal's messages if applicable.

## Work Item 4 — Kill the parent nav near-duplicates

**Problem:** Parent nav has 9 items with duplicate pairs: "Schedule" vs "Full studio schedule"; "Family Wallet" with "Billing & payments" nested as the product's only submenu. Wallet and Billing show the same objects (invoices, plans, subscriptions).

**Change:**
- Merge schedules: one **Schedule** nav item (`/portal/parent/schedule`) with a toggle/segmented control inside the page: "My family" | "Whole studio". `/portal/parent/studio-schedule` redirects to `/portal/parent/schedule?view=studio`. Reuse `ParentScheduleCalendar` and the studio-schedule component as the two views.
- Merge Wallet + Billing: one nav item **Billing** (`/portal/parent/billing` canonical). Fold the Wallet page's summary (payment plans progress, active subscriptions, saved payment method) into the top of the Billing page as a summary band; invoice list below. `/portal/parent/wallet` redirects to `/portal/parent/billing`. Remove the submenu (`children`) from `PORTAL_NAV.parent` — no submenus in the parent portal.
- Target parent nav (7 items): Family Hub, Schedule, Absences, Costumes & Recital, Forms, Billing, Messages.

## Work Item 5 — Re-present the enrol payment fork (keep all 4 options)

**Problem:** `components/portal/parent/EnrollModal.tsx` (1,074 lines) ends step 3 with a flat four-way fork: pay online / pay monthly / pay later / invoice. Decision overload at the moment of commitment.

**Change (presentation only — all four paths remain functional):**
- Show ONE primary CTA: **Pay now** (online payment, existing `paidOnline` path).
- Beneath it, a quieter secondary: **Pay monthly** with its per-installment amount inline (existing `payMonthly` path).
- A single text link, "More payment options", expands to reveal Pay later and Invoice (existing `payLater` / invoice paths).
- No changes to `onComplete` semantics, amounts, sibling-discount, programme, or waitlist logic.
- While in the file: extract the step components into `components/portal/parent/enroll/` (Step1SelectClass.tsx etc.) purely as a file split — no logic changes — so the modal file drops under ~300 lines.

## Work Item 6 — De-jargon labels (i18n only)

**Problem:** Accounting/internal vocabulary leaks into everyday flows.

**Changes (in `messages/en/*.json`, mirrored to other locales):**
- Teacher nav: "Compliance vault" → "Documents"; "Sub board" → "Cover requests"; "Studio affiliations" → "My studios".
- In `components/admin/classes/ClassEditPanel.tsx`: move the Xero account code + Xero item code fields into a collapsed "Accounting (Xero)" disclosure at the bottom of the form, closed by default, only rendered when the studio has Xero connected. Labels: "Xero account" / "Xero item". No field removal.
- Sweep other admin-facing labels for internal jargon while in the locale files; propose (don't silently apply) anything ambiguous in the PR description.

## Work Item 7 — Small frictions

1. **Collapsed sidebar affordance** (`components/portal/PortalShellClient.tsx`): the 12px hover-peek strip is invisible. Add a visible chevron tab (e.g., a small ›-button vertically centered on the strip) so re-opening is discoverable. Keep hover-peek behavior.
2. **Orphaned page:** `/portal/admin/branding` is linked from nowhere. Add a "Branding" link/card inside `/portal/admin/settings` (Identity section of `AdminSettings.tsx`). Do not add it to the nav.
3. **BillingDashboard density:** after Work Item 1's tab split, move the "Insights" block to the bottom of the Invoices tab or behind a disclosure; keep stats row, reminders, accounts. Per-row actions (Send/Remind/Refund/Void) unchanged.

---

## Out of scope for 1.6.1 (explicitly)

- Merging chat/email/messages backends or tables
- Unifying wallet/billing data models
- Removing any payment option
- Any Supabase migration
- Platform (`/platform/*`) and office nav

## Acceptance checklist

- [ ] Admin nav ≤ 14 items, ≤ 5 sections; parent nav ≤ 7 items, no submenus
- [ ] Every removed route redirects to its new home (no 404s); deep links with `?tab=`/`?view=` work
- [ ] All five locale files updated; no hardcoded English strings introduced
- [ ] Enrol modal: one primary CTA visible at review step; all 4 payment paths still reachable and functional
- [ ] `npm run build` clean; existing tests pass (`vitest`); no `any` types introduced
- [ ] No changes under `supabase/`

## Suggested commit sequence

1. `feat(nav): consolidate admin + parent nav (1.6.1 IA)` — nav-config, redirects, locale labels
2. `feat(billing): tabbed billing (invoices/subscriptions/payment plans), remove duplicate subscriptions block`
3. `feat(inbox): tabbed admin inbox + tabbed parent messages`
4. `feat(parent): merge schedule views; merge wallet into billing`
5. `refactor(enroll): split EnrollModal steps into files; re-present payment options`
6. `chore(i18n): de-jargon teacher/admin labels; collapse Xero fields in class editor`
7. `fix(shell): visible sidebar re-open affordance; link branding from settings`

Tag the release `v1.6.1` after review.
