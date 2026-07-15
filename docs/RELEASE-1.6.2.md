# Release 1.6.2 — "The Product Answers Back" (Feedback & Perceived Performance)

**Status:** Implemented on `ttest` (2026-07-08) — pending review on the preview deploy.
**Implementation notes:** All six work items landed as one commit each (`4e5492e`…`b8ac653`). Deviations from the spec, chosen deliberately: button pending states were already covered codebase-wide by the existing `disabled` + progress-label convention, so no new Button primitive was added; EmptyState CTAs went to Classes and Students (ParentHub and EmailInbox already had CTAs, the Leads kanban columns are their own affordance); tab content doesn't animate today so `tabSwitch` is available but unused; tenant fonts stay on runtime Google Fonts (per-tenant branding rules out `next/font`) with `fetchPriority="high"` added.
**Scope discipline:** UI/feedback-level ONLY. No database schema changes, no migration files, no business-logic changes, no new nav items. Every action keeps its exact current semantics — only how the app *responds* to the action changes. If a work item seems to require a schema or data-flow change, stop and flag it.
**Origin:** Premium-feel audit, 2026-07-08. Core finding: 1.6.1 fixed the map; the remaining gap to "premium" is the feedback layer. The codebase has 20 native `window.confirm()` calls, 1 `alert()`, zero toast infrastructure (~70 components hand-roll `setMessage`/`setError`/`setSuccess`), a single generic `loading.tsx` for the whole portal, and only a root-level `error.tsx`.

---

## Guiding rules for every change in this release

1. One feedback vocabulary. Every mutation resolves to the same three outcomes rendered the same way everywhere: optimistic/positive toast, inline field error, or branded confirm dialog.
2. Never show browser chrome. `window.confirm`, `alert`, and default focus outlines are all replaced with branded equivalents.
3. Perceived speed beats real speed. Skeletons that match the destination layout, not spinners; optimistic UI only where rollback is trivial.
4. No behavior changes. A destructive action still requires confirmation; a failed save still blocks; all copy goes through i18n (`messages/en/core.json` etc., all five locales).
5. Respect `prefers-reduced-motion` in anything animated.
6. Server Components stay server; feedback primitives are small client leaf components.

---

## Work Item 1 — Toast system + branded confirm dialog (HIGHEST PRIORITY)

**Problem:** No unified feedback. 20 `window.confirm(` call sites, 1 `alert(`, and ~70 components with ad-hoc inline success/error state — every screen answers differently, and native dialogs break the brand entirely.

**Change:**
- Add `components/ui/Toaster.tsx` + a `useToast()` hook (zustand store, already a dependency) — success / error / info variants, brand-token colors, framer-motion enter/exit, auto-dismiss with hover-pause, stacked bottom-right (bottom-center on mobile).
- Add `components/ui/ConfirmDialog.tsx` + `useConfirm()` — promise-based (`await confirm({ title, body, destructive })`) so call sites migrate mechanically: `if (!window.confirm(...))` → `if (!(await confirm(...)))`.
- Migrate ALL 20 `window.confirm` sites and the 1 `alert` site. Destructive confirms (delete class, void invoice, unenroll…) get the destructive variant with the action named on the button ("Delete class", not "OK").
- Migrate ad-hoc success messages to toasts in the highest-traffic flows only (admin classes, students, billing actions, enroll modal, settings save). Remaining inline patterns are swept opportunistically in later releases — do not boil the ocean in one PR.
- Mount `<Toaster />` once in the portal shell.

## Work Item 2 — Route-level skeletons for the top screens

**Problem:** One `app/portal/loading.tsx` renders the same anonymous spinner for every portal navigation. Premium products show you the shape of what's loading.

**Change:**
- Add `components/ui/Skeleton.tsx` (shimmer primitive using brand surface tokens, reduced-motion safe).
- Add per-route `loading.tsx` that mirrors the real layout (stats row, table rows, calendar grid) for: admin Dashboard, Classes, Billing, Parents, Students, Inbox; parent Family Hub, Schedule, Billing, Messages. Other routes keep the generic fallback.
- Each skeleton is a dumb static component — no data fetching, no client JS beyond the shimmer.

## Work Item 3 — Error and empty states that keep users inside the product

**Problem:** Only root `app/error.tsx` exists — a server error anywhere inside a portal ejects the user from the shell. Empty states are inconsistent (some tables render "no rows", first-run screens don't sell the next action).

**Change:**
- Add `app/portal/error.tsx` (and reuse for admin/parent/teacher/student segments if needed): branded, stays inside the portal shell, "Try again" via `reset()`, support link to Olune Support.
- Add `components/ui/EmptyState.tsx` (icon, one-line explanation, primary CTA) and apply it to the first-run cases with a clear next action: no classes yet → "Create your first class"; no students; no invoices; empty inbox; empty leads board; parent with no enrollments → "Browse classes".
- Copy through i18n like everything else.

## Work Item 4 — Motion & interaction tokens

**Problem:** framer-motion is used in 63 components with per-file durations/easings — transitions feel almost-consistent, which reads as cheaper than either consistent or none.

**Change:**
- Add `lib/motion.ts` exporting shared variants/transitions: `panelSlide` (slide-over enter/exit), `fadeLift` (cards/modals), `tabSwitch`, and standard durations (fast 150ms / base 220ms / slow 320ms) with one easing curve.
- Sweep the shared surfaces only — slide-over panels, modals (incl. EnrollModal steps), tab switches, toasts — to consume the tokens. Do not touch decorative/one-off animations.
- Add a global `prefers-reduced-motion` guard (framer-motion `useReducedMotion` in the shared variants).

## Work Item 5 — Focus & keyboard polish

**Problem:** Default browser focus outlines against brand colors; slide-over panels and modals differ on Esc-to-close and focus handling.

**Change:**
- Global `:focus-visible` style using the brand ring token in `styles/` (visible, on-brand, never removed).
- Every slide-over/modal: Esc closes, focus moves into the panel on open and returns to the trigger on close. Centralize in the existing panel wrapper component(s) rather than per-screen.
- Buttons/links: consistent hover + active (pressed) states via shared classes — no dead-feeling clicks.

## Work Item 6 — Small frictions

1. **Font loading:** tenant fonts load at runtime from Google Fonts (`lib/fonts.ts`, `display=swap`). Keep the architecture (per-tenant fonts rule out `next/font`), but add `<link rel="preload">`/`fetchpriority` for the resolved stylesheet and an explicit fallback stack in the brand CSS vars so the swap is less jarring.
2. **Button loading states:** any submit that hits the network shows an in-button spinner + disabled state (shared `Button` behavior or a small `useFormStatus`/pending wrapper) — no double-submits, no silent waits.
3. **Table row hover + row-level action reveal** consistency across admin tables (classes, students, invoices) — one shared treatment.

---

## Out of scope for 1.6.2 (explicitly)

- Dark mode
- Command palette / keyboard shortcuts beyond Esc/focus
- Real performance work (query optimization, caching, bundle size)
- Migrating all ~70 ad-hoc inline message patterns (top flows only)
- Any Supabase migration; platform (`/platform/*`) and office portals

## Acceptance checklist

- [ ] Zero `window.confirm(` / `alert(` calls under `components/` and `app/`
- [ ] Toasts render identically in admin + parent portals; confirm dialog used for every destructive action
- [ ] Top 10 routes have layout-matching skeletons; portal error boundary keeps users inside the shell
- [ ] Empty states with CTAs on the six first-run surfaces
- [ ] Shared motion tokens consumed by panels/modals/tabs/toasts; reduced-motion respected
- [ ] `:focus-visible` ring on-brand everywhere; Esc closes all panels/modals
- [ ] All five locale files updated; no hardcoded strings introduced
- [ ] `npm run build` clean; no `any` types introduced; no changes under `supabase/`

## Suggested commit sequence

1. `feat(ui): toast system + branded confirm dialog; migrate native confirms`
2. `feat(ui): skeleton primitive + route-level loading states for top screens`
3. `feat(ui): portal error boundary + empty-state component on first-run surfaces`
4. `refactor(motion): shared motion tokens; sweep panels/modals/tabs; reduced-motion`
5. `feat(ui): focus-visible ring, Esc/focus management, button pending states`
6. `chore(ui): font preload + fallback stack; table hover consistency`

Tag the release `v1.6.2` after review.
