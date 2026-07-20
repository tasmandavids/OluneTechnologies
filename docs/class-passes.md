# Class passes

Class passes let a self-managed adult student buy a one-use drop-in pass, show a
QR code at the studio, and have an admin redeem it against a class occurrence.
The feature is intentionally payment-gated: a pass is not redeemable until the
Stripe webhook promotes it from `reserved` to `paid`.

## Entry points

| User | Surface | Codepath |
| --- | --- | --- |
| Student | `/portal/student` -> **My Passes** | `components/portal/student/BuyClassPass.tsx` |
| Purchase API | `POST /api/passes/purchase` | `app/api/passes/purchase/route.ts` |
| Admin | `/portal/admin/passes` | `app/portal/admin/passes/page.tsx` |
| Redemption API | `POST /api/passes/redeem` | `app/api/passes/redeem/route.ts` |
| Webhook finalization | `payment_intent.succeeded`, `charge.refunded` | `lib/webhooks/process-stripe-event.ts` |

## Purchase and redemption flow

1. Student opens `/portal/student`.
2. `StudentPortal` loads all of the student's `class_passes` and passes only
   unredeemed paid passes to the "My Passes" UI.
3. `POST /api/passes/purchase` verifies the user is a `student` with
   `self_managed = true`, inserts a bare `reserved` row, generates a QR payload,
   creates a Stripe PaymentIntent, and stores the QR data URL plus PaymentIntent
   id back on the reserved row.
4. `BuyClassPass` keeps the QR in `pendingQr` until `CheckoutForm.onSuccess`;
   the QR is not shown by the client before the card confirmation succeeds.
5. The Stripe `payment_intent.succeeded` webhook matches
   `metadata.class_pass_id` and `stripe_payment_intent_id`, then:
   - updates the pass status from `reserved` to `paid`,
   - creates a paid `invoices` row and line item,
   - records a `payments` row,
   - inserts a `class_pass_paid` notification,
   - syncs the generated invoice to Xero when Xero is connected.
6. Admin scans or pastes the QR payload in `/portal/admin/passes`, chooses a
   class occurrence (`class_id` + `date`), and submits redemption.
7. `POST /api/passes/redeem` atomically updates the pass with
   `WHERE status = 'paid'`, then upserts `attendance` as `present`.

## Data model

`supabase/migrations/0091_class_passes.sql` creates `public.class_passes`.
`0092_class_pass_invoice_link.sql` adds `invoice_id`, and
`0093_class_pass_security_fixes.sql` hardens client-write transitions.

Important columns:

| Column | Purpose |
| --- | --- |
| `student_id`, `studio_id` | Tenant and owner of the pass. |
| `price_cents`, `currency` | Fixed at `2500` / `nzd` by app code and RLS. |
| `qr_token` | Opaque token included in the QR payload; redemption checks it with `id`. |
| `qr_code` | Base64 PNG data URL displayed to the student after payment succeeds. |
| `stripe_payment_intent_id` | Join key for payment success and refund reconciliation. |
| `status` | `reserved`, `paid`, `redeemed`, `cancelled`, or `refunded`. |
| `redeemed_class_id`, `redeemed_date`, `redeemed_by` | Class occurrence and admin that claimed the pass. |
| `invoice_id` | Invoice generated after payment for Xero/accounting traceability. |

Status transitions:

```text
reserved --Stripe payment_intent.succeeded--> paid --admin redeem--> redeemed
paid --Stripe charge.refunded--> refunded
```

A refund after redemption keeps the pass as `redeemed`; the invoice refund still
records the accounting ledger entry, but attendance is not undone automatically.

## QR payload

The QR code encodes JSON:

```json
{
  "kind": "class_pass",
  "pass_id": "uuid",
  "qr_token": "uuid",
  "student_id": "uuid",
  "issued_at": "2026-07-20T00:00:00.000Z"
}
```

`PassScanner` accepts either a camera scan or a manually pasted payload. Manual
entry is useful for testing camera-less devices and support cases.

## Security and RLS constraints

- Only authenticated self-managed adult students can create their own pass.
- Student inserts must be bare checkout rows: fixed price/currency, status
  `reserved`, no QR, no PaymentIntent, no redemption fields, no refund fields.
- The only student update allowed is attaching `qr_code` and
  `stripe_payment_intent_id` while the row is still `reserved`.
- Admins have full access only within their own studio.
- Redemption is admin-only and validates that the selected class belongs to the
  admin's studio.
- Double redemption is guarded by the atomic update in `POST /api/passes/redeem`
  (`id`, `qr_token`, `studio_id`, and `status = 'paid'`). A second attempt returns
  `409` when the pass is already redeemed.

## Integrations

### Stripe

The purchase PaymentIntent uses metadata:

| Metadata key | Value |
| --- | --- |
| `class_pass_id` | `class_passes.id` |
| `user_id` | Student profile/auth id |
| `studio_id` | Studio receiving the sale |

The PaymentIntent also calls `resolveTransferData()`, so studios with an active
Stripe Connect account receive destination charges; studios without one fall
back to the platform account.

### Xero

Class-pass sales generate a paid invoice with one custom line item:

| Field | Value |
| --- | --- |
| Description | `Adult ballet class pass` |
| Account code | `200-01` (`CLASS_PASS_XERO_ACCOUNT_CODE`) |
| Amount | Stripe amount received |

`xeroSyncAfterPayment()` runs after the invoice is created. Refunds sync through
the normal invoice refund path.

## Operational checks

- Apply migrations `0091`, `0092`, and `0093` before testing the flow.
- Confirm `SUPABASE_SERVICE_ROLE_KEY` is configured for Stripe webhooks; the
  webhook path writes invoices, payments, notifications, and class-pass status.
- Confirm the Stripe webhook endpoint delivers `payment_intent.succeeded` and
  `charge.refunded` events.
- For Xero reporting, ensure account code `200-01` exists in the studio's chart
  of accounts or update the constant/mapping before launch.
- If the scanner opens camera permissions but shows no video, test the manual
  paste fallback and check that the scanner container is mounted with dimensions
  before `html5-qrcode` starts.
