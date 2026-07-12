# Xero accounting integration

Connect each studio's Xero organisation to Olune for P&L reporting and automatic invoice sync when parents pay through Stripe.

## 1. Create a Xero app

1. Sign in at [developer.xero.com](https://developer.xero.com/app/manage).
2. Create a **Web app** (OAuth 2.0).
3. Add a redirect URI:
   - Local: `http://localhost:3000/api/xero/oauth/callback`
   - Production: `https://www.olune.co.nz/api/xero/oauth/callback`
4. Enable scopes (granular — required for apps created after March 2026):
   - `openid`, `profile`, `email`, `offline_access`
   - `accounting.contacts`
   - `accounting.invoices`, `accounting.invoices.read`
   - `accounting.payments`
   - `accounting.reports.profitandloss.read`
   - `accounting.settings.read`

   Do **not** use deprecated broad scopes (`accounting.transactions`, `accounting.reports.read`) — new apps return "Invalid scope".

Copy the **Client ID** and **Client secret**.

## 2. Environment variables

Add to `.env.local` (see `.env.local.example`):

```bash
XERO_CLIENT_ID=your-client-id
XERO_CLIENT_SECRET=your-client-secret
NEXT_PUBLIC_APP_URL=https://www.olune.co.nz
NEXT_PUBLIC_ROOT_DOMAIN=olune.co.nz
# Optional override — must match the redirect URI registered in Xero exactly
# XERO_REDIRECT_URI=https://www.olune.co.nz/api/xero/oauth/callback
# XERO_TOKEN_ENCRYPTION_KEY=generate-a-long-random-string
# XERO_OAUTH_STATE_SECRET=generate-a-long-random-string
XERO_WEBHOOK_KEY=your-webhook-signing-key
```

`NEXT_PUBLIC_APP_URL` drives the OAuth callback in production (even when you open the admin portal from a studio subdomain like `nzad.olune.co.nz`).

## 3. Register the webhook (Xero → Olune)

Olune invoices that get authorised, edited, paid, or voided **inside Xero** sync back
automatically via a webhook — this is required for that direction to work at all.

1. In the Xero app, open the **Webhooks** tab.
2. Add a webhook for the **Invoices** category, delivery URL:
   - Production: `https://www.olune.co.nz/api/webhooks/xero`
   - Local testing needs a public tunnel (e.g. `ngrok http 3000`) — Xero cannot reach `localhost`.
3. Copy the **Signing key** shown on that tab into `XERO_WEBHOOK_KEY`.
4. Click **Save** — Xero immediately sends an "intent to receive" test payload and expects
   a `200` within 5 seconds. If `XERO_WEBHOOK_KEY` isn't deployed yet, this will fail with `401`.

## 4. Database migration

```bash
npm run db:push
```

This applies `0036_xero_integration.sql` (`xero_connections`, `xero_sync_log`, and `xero_invoice_id` columns) and `0087_xero_connections_tenant_index.sql` (tenant lookup for the inbound webhook).

## 5. Connect in the admin portal

1. Open **Finance → Accounting** in the admin portal.
2. Click **Connect Xero** and authorise your organisation.
3. Use **Open in Xero** to jump to your live Xero dashboard.

## What syncs to Xero

When Xero is connected and sync is enabled:

| Olune event | Xero result |
|-------------|-------------|
| Invoice paid (tuition / auto-pay) | Paid ACCREC invoice + contact |
| Shop order paid | Paid invoice with line items |
| Event ticket paid | Paid invoice |
| Refund | Credit note |

Olune stores only `xero_invoice_id` / `xero_contact_id` references. Full line-item and P&L detail is read from Xero on demand.

## What syncs back from Xero

Once the webhook (step 3) is registered, changes made **inside Xero** to an invoice Olune
already synced flow back automatically:

| Xero event | Olune result |
|------------|---------------|
| Invoice authorised (still a local draft) | Status → `sent`, amount/line items/due date captured from Xero |
| Invoice edited while still Draft in Xero | Amount / line items / due date kept in sync |
| Invoice marked Paid in Xero | Status → `paid`, pending Stripe payment link cancelled |
| Invoice voided or deleted in Xero | Status → `void`, pending Stripe payment link cancelled |

Invoices already `paid`, `refunded`, or `void` in Olune are left alone — those are financially
final locally and never get overwritten by a later Xero echo. Only invoices Olune already
knows about (i.e. have a `xero_invoice_id`) are reconciled; invoices created directly in Xero
with no Olune counterpart are ignored.

## Default account codes

Studios can adjust settings in the connection row (`settings` jsonb):

- `sales_account_code` — default `200`
- `payment_account_code` — default `090`

Ensure these codes exist in your Xero chart of accounts (NZ demo orgs often use similar codes).

## Troubleshooting

- **Connect button errors** — check `XERO_CLIENT_ID` / `XERO_CLIENT_SECRET` and redirect URI match.
- **Sync failures** — see the connection banner on Accounting; details are logged in `xero_sync_log`.
- **Empty P&L** — new Xero orgs may have no transactions yet; data appears once Xero has activity.
