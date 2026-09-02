# Stripe Connect

Olune supports per-studio Stripe Express accounts so payments can settle
directly to a studio's own Stripe balance and bank account. Studios that have
not completed Connect onboarding continue to charge through the platform
account, so the migration is incremental.

## Admin surfaces and routes

| Surface | Codepath | Purpose |
| --- | --- | --- |
| `/portal/admin/payments` | `app/portal/admin/payments/page.tsx` | Shows connection status and actions. |
| Connect start | `app/api/stripe/connect/route.ts` | Creates/reuses an Accounts v2 merchant account and redirects to Stripe-hosted onboarding. |
| Refresh URL | `app/api/stripe/connect/refresh/route.ts` | Mints a new onboarding link when Stripe's account link expires. |
| Return URL | `app/api/stripe/connect/return/route.ts` | Revalidates state/session and syncs account status after onboarding. |
| Status actions | `app/portal/admin/payments/actions.ts` | Refreshes status and links to the studio's own Stripe dashboard. |
| Connect webhook | `app/api/webhooks/stripe-connect/route.ts` | Classic Connect events on the platform account. |
| v2 event destination | `app/api/webhooks/stripe-v2/route.ts` | Accounts v2 status events for studio accounts — the endpoint that keeps `charges_enabled` honest. |
| Destination setup | `scripts/setup-v2-event-destination.mjs` | Registers/re-points that Event Destination and prints its signing secret. |
| Nightly reconcile | `app/api/cron/sync-connect-accounts/route.ts` | Re-derives every studio's status from Stripe in case the destination is not delivering. |

## Environment variables

Connect uses the standard Stripe configuration plus three Connect-specific
secrets:

```bash
STRIPE_SECRET_KEY=sk_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
STRIPE_V2_WEBHOOK_SECRET=whsec_...
# Optional; falls back to EMAIL_OAUTH_STATE_SECRET, then CRON_SECRET.
STRIPE_CONNECT_STATE_SECRET=generate-a-long-random-string
```

All three webhook secrets are different. `STRIPE_CONNECT_WEBHOOK_SECRET` is the
Connect endpoint's, not the platform endpoint's, and `STRIPE_V2_WEBHOOK_SECRET`
belongs to the Event Destination — a separate object from both webhook
endpoints, created by `scripts/setup-v2-event-destination.mjs`, which prints the
secret once on creation and never again.

## Database model

Migration `supabase/migrations/0090_stripe_connect.sql` creates:

| Table | Purpose |
| --- | --- |
| `stripe_connect_accounts` | One Express account per studio, including `charges_enabled`, `payouts_enabled`, `details_submitted`, `disabled_reason`, and onboarding timestamps. |
| `profile_stripe_customers` | Per `(profile, studio)` Stripe Customer ids once a studio has a chargeable connected account. |

It also adds `stripe_events.account` so Connect events can be recorded in the
same idempotency ledger as platform Stripe events.

RLS is admin-scoped by studio for Connect rows. End users can read only their
own `profile_stripe_customers` rows. Webhooks and onboarding callbacks rely on
server-side clients for writes.

## Onboarding flow

1. Admin opens **Payments** and clicks **Connect with Stripe**.
2. `GET /api/stripe/connect` verifies the signed-in admin's studio.
3. If no row exists, it creates a Stripe Express account:
   - `type: "express"`
   - `country: "NZ"`
   - `capabilities.card_payments.requested = true`
   - `capabilities.transfers.requested = true`
4. The route inserts `stripe_connect_accounts` with `onboarding_started_at` and
   redirects to a Stripe Account Link.
5. Stripe returns to `/api/stripe/connect/return?state=...`.
6. The return route verifies signed state, verifies the current admin still
   belongs to the same studio, retrieves the account from Stripe, and updates
   `charges_enabled`, `payouts_enabled`, `details_submitted`,
   `disabled_reason`, and `last_synced_at`.
7. The admin lands back on `/portal/admin/payments` with a status banner.

Account links expire quickly. Stripe uses the configured refresh URL to call
`/api/stripe/connect/refresh`, which verifies the same state and mints a fresh
Account Link for the existing Express account.

## Charge routing

All current payment creation sites call `resolveTransferData(supabase, studioId)`
before creating a Stripe PaymentIntent or subscription:

- invoices: `app/api/payments/create-intent/route.ts`,
  `app/portal/admin/billing/actions.ts`
- enrollments and term plans: `app/portal/parent/enroll/actions.ts`,
  `app/portal/parent/billing/actions.ts`
- subscriptions: `app/portal/admin/subscriptions/actions.ts`,
  `app/portal/parent/subscriptions/actions.ts`
- shop orders: `app/api/shop/checkout/route.ts`
- event tickets: `app/api/events/purchase/route.ts`
- class passes: `app/api/passes/purchase/route.ts`

`resolveTransferData()` returns:

```ts
{ destination: "acct_..." }
```

only when the studio has a Connect row with `charges_enabled = true`. Otherwise
it returns `undefined`, preserving the platform-account payment behavior.

## Stripe Customers

Stripe Customers cannot be shared across Stripe accounts. Use
`getOrCreateStripeCustomer(supabase, profileId, studioId)` for all charge flows:

- When the studio is not chargeable through Connect, the legacy
  `profiles.stripe_customer_id` path is used.
- When the studio is chargeable, the customer id is stored in
  `profile_stripe_customers` for the `(profile, studio)` pair.

This matters for multi-studio profiles: the same parent/student may need
different Stripe Customer ids for different studios.

## Webhook behavior

Studio account status arrives on the **v2** endpoint, not the Connect one.
Accounts v2 emits `v2.core.account[configuration.merchant]
.capability_status_updated` and friends, and a classic webhook endpoint cannot
subscribe to those — Stripe rejects the event names. They are delivered to an
Event Destination instead, which POSTs a *thin* notification (id, type,
`related_object` pointer; no `data.object`) to `/api/webhooks/stripe-v2`. That
route verifies with `stripe.parseEventNotification()`, dedupes through
`stripe_events`, and calls `syncStripeAccountStatus()` to re-read the account
from Stripe — the notification itself carries no status.

A studio going from chargeable to not is reported to Sentry, because the
alternative is discovering it when a parent's card is declined.

`/api/cron/sync-connect-accounts` re-derives the same state nightly. The Event
Destination depends on four pieces of dashboard state no deploy can verify
(registered, enabled, right URL, matching secret); if any is wrong the failure
is silent, so the sweep is the backstop.

The classic Connect endpoint verifies with `STRIPE_CONNECT_WEBHOOK_SECRET` and
delegates to `processStripeEvent()`. Destination charges keep PaymentIntent,
Charge, and Refund events platform-side, so the platform webhook still handles
normal payment success and refund reconciliation.

## Operational checklist

- Apply migration `0090_stripe_connect.sql`.
- Configure both platform and Connect Stripe webhook endpoints with their own
  signing secrets.
- Register the v2 Event Destination and set `STRIPE_V2_WEBHOOK_SECRET`:
  `node --env-file=.env.local scripts/setup-v2-event-destination.mjs --url
  https://<host>/api/webhooks/stripe-v2 --ping`. Without it, studio status only
  refreshes on the nightly sweep and on demand.
- Confirm the destination's `events_from` is `["@accounts"]`. Set to `@self` it
  looks healthy and delivers no studio events at all.
- Set `CRON_SECRET` so `/api/cron/sync-connect-accounts` can run.
- Use `/portal/admin/payments` to start onboarding and refresh status.
- Treat `charges_enabled = true` as the gate for destination charges; do not use
  `details_submitted` alone.
- If a studio reports payments still going to the platform, refresh status and
  check `stripe_connect_accounts.disabled_reason`.
- If customers appear duplicated, confirm the studio's chargeability state and
  whether the flow used `profiles.stripe_customer_id` or
  `profile_stripe_customers`.
