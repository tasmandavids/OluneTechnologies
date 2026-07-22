// ============================================================================
//  Inbound Xero → Olune sync.
//
//  The outbound path (sync-sale.ts) mirrors Olune invoices into Xero. This is
//  the reverse: when an admin authorises/edits/pays/voids an invoice *inside
//  Xero*, the webhook route calls reconcileXeroInvoice() to pull that change
//  back onto the matching Olune invoice.
//
//  We never trust the webhook payload's data — it only carries resource IDs —
//  so every reconcile re-fetches the current invoice from Xero and syncs to
//  that. This makes the whole thing idempotent and order-independent: duplicate
//  or out-of-sequence deliveries all converge on Xero's latest truth.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { Invoice } from "xero-node";
import { createAdminClient } from "@/lib/supabase/admin";
import { stripe } from "@/lib/stripe";
import { gstComponentCents } from "@/lib/currency";
import { loadStudioXeroClient } from "./client";
import { centsFromDollars } from "./reports";
import { xeroRedirectUriForJobs } from "./config";

export type OluneInvoiceStatus = "draft" | "sent" | "overdue" | "paid" | "refunded" | "void";
export type XeroInvoiceStatus = "DRAFT" | "SUBMITTED" | "AUTHORISED" | "PAID" | "VOIDED" | "DELETED";

export interface ReconcilePlan {
  /** New Olune status, or null to leave it unchanged. */
  nextStatus: OluneInvoiceStatus | null;
  /** Cancel any pending Stripe payment link (paid/voided outside the portal). */
  cancelStripe: boolean;
  /** Rewrite amount_cents + line items from Xero (safe until the invoice is financially final). */
  syncAmount: boolean;
  /** Rewrite due_date from Xero. */
  syncDueDate: boolean;
}

const NOOP: ReconcilePlan = {
  nextStatus: null,
  cancelStripe: false,
  syncAmount: false,
  syncDueDate: false,
};

/**
 * Pure decision table for "given where Olune and Xero each think this invoice
 * is, what should Olune do?". Kept side-effect-free so it can be unit tested.
 *
 * Locked local states (paid/refunded/void) always win — they're financially
 * final on our side, so a later Xero echo can't drag them backwards.
 */
export function planInvoiceReconcile(
  olune: OluneInvoiceStatus,
  xero: XeroInvoiceStatus,
): ReconcilePlan {
  if (olune === "paid" || olune === "refunded" || olune === "void") return NOOP;

  switch (xero) {
    case "PAID":
      return { nextStatus: "paid", cancelStripe: true, syncAmount: false, syncDueDate: false };
    case "VOIDED":
    case "DELETED":
      return { nextStatus: "void", cancelStripe: true, syncAmount: false, syncDueDate: false };
    case "AUTHORISED":
      // Authorising in Xero == the invoice going live to the customer. If we
      // still think it's a draft, promote it to "sent" and capture Xero's
      // final numbers in the same pass.
      //
      // Once already sent/overdue we still follow Xero's numbers: Xero is the
      // source of truth for pricing, and admins routinely apply discounts or
      // fix line items *after* authorising. Refusing to follow left Olune
      // billing a stale amount with no way to correct it short of voiding.
      // Safe because the invoice is not yet financially final on our side —
      // paid/refunded/void are already short-circuited above — and the caller
      // re-prices any pending Stripe intent so the payer is never charged the
      // old figure.
      return olune === "draft"
        ? { nextStatus: "sent", cancelStripe: false, syncAmount: true, syncDueDate: true }
        : { nextStatus: null, cancelStripe: false, syncAmount: true, syncDueDate: true };
    case "SUBMITTED":
    case "DRAFT":
      return olune === "draft"
        ? { nextStatus: null, cancelStripe: false, syncAmount: true, syncDueDate: true }
        : NOOP;
    default:
      return NOOP;
  }
}

/** Prefer the service-role client so the webhook can write across RLS. */
function syncSupabase(fallback: SupabaseClient): SupabaseClient {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return createAdminClient();
  return fallback;
}

function xeroStatusOf(inv: Invoice): XeroInvoiceStatus | null {
  switch (inv.status) {
    case Invoice.StatusEnum.DRAFT:
      return "DRAFT";
    case Invoice.StatusEnum.SUBMITTED:
      return "SUBMITTED";
    case Invoice.StatusEnum.AUTHORISED:
      return "AUTHORISED";
    case Invoice.StatusEnum.PAID:
      return "PAID";
    case Invoice.StatusEnum.VOIDED:
      return "VOIDED";
    case Invoice.StatusEnum.DELETED:
      return "DELETED";
    default:
      return null;
  }
}

/**
 * ISO date (yyyy-mm-dd) from Xero's various date encodings, else null.
 *
 * xero-node's Invoice type declares date/dueDate/fullyPaidOnDate as `string`,
 * but its deserializer actually converts the raw "/Date(1752278400000+0000)/"
 * wire format into a real JS `Date` object before we ever see it — so at
 * runtime these fields are Date instances, not strings. Handle both rather
 * than trusting the (misleading) declared type.
 */
export function isoDate(value: string | Date | undefined | null): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  const msMatch = /\/Date\((-?\d+)/.exec(value);
  if (msMatch) return new Date(Number(msMatch[1])).toISOString().slice(0, 10);
  const d = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

async function cancelStripeIntent(intentId: string | null): Promise<void> {
  if (!intentId) return;
  try {
    const intent = await stripe.paymentIntents.retrieve(intentId);
    const cancelable = [
      "requires_payment_method",
      "requires_capture",
      "requires_confirmation",
      "requires_action",
      "processing",
    ];
    if (cancelable.includes(intent.status)) {
      await stripe.paymentIntents.cancel(intentId);
    }
  } catch (err) {
    console.warn(`[xero-inbound] could not cancel payment intent ${intentId}:`, err);
  }
}

/**
 * Keep a pending payment link in step with a re-priced invoice. Without this an
 * amount pulled down from Xero would only change what the portal *displays* —
 * the payer would still be charged whatever the intent was created at.
 *
 * Stripe only allows an amount change while the intent is still awaiting the
 * customer; anything further along (processing/succeeded) is left alone and
 * logged, since money is already in flight.
 */
async function repriceStripeIntent(intentId: string | null, amountCents: number): Promise<void> {
  if (!intentId) return;
  try {
    const intent = await stripe.paymentIntents.retrieve(intentId);
    if (intent.amount === amountCents) return;

    const repriceable = ["requires_payment_method", "requires_confirmation", "requires_action"];
    if (!repriceable.includes(intent.status)) {
      console.warn(
        `[xero-inbound] payment intent ${intentId} is ${intent.status}; left at ${intent.amount} rather than re-pricing to ${amountCents}`,
      );
      return;
    }

    await stripe.paymentIntents.update(intentId, { amount: amountCents });
  } catch (err) {
    console.warn(`[xero-inbound] could not re-price payment intent ${intentId}:`, err);
  }
}

/**
 * Core reconcile for one invoice once we already know which studio it belongs
 * to. Shared by the webhook path (tenant → studio lookup) and the manual
 * "Refresh from Xero" button (studio already known from the signed-in admin).
 * Returns whether the Olune invoice's status/amount/due date actually changed,
 * so callers can report a meaningful count back to the user.
 */
async function reconcileInvoiceForStudio(
  supabase: SupabaseClient,
  studioId: string,
  xeroInvoiceId: string,
): Promise<boolean> {
  const { data: invoiceRow } = await supabase
    .from("invoices")
    .select("id, status, amount_cents, due_date, stripe_payment_intent_id, paid_at, issued_at")
    .eq("studio_id", studioId)
    .eq("xero_invoice_id", xeroInvoiceId)
    .maybeSingle();

  // Only invoices Olune already knows about are reconciled. Xero-native
  // invoices with no Olune counterpart are intentionally ignored.
  if (!invoiceRow) return false;

  const loaded = await loadStudioXeroClient(supabase, studioId, xeroRedirectUriForJobs());
  if (!loaded) return false;

  const res = await loaded.client.accountingApi.getInvoice(loaded.tenantId, xeroInvoiceId);
  const xeroInvoice = res.body.invoices?.[0];
  if (!xeroInvoice) return false;

  const xeroStatus = xeroStatusOf(xeroInvoice);
  if (!xeroStatus) return false;

  const plan = planInvoiceReconcile(invoiceRow.status as OluneInvoiceStatus, xeroStatus);

  const updates: Record<string, unknown> = {};

  if (plan.nextStatus && plan.nextStatus !== invoiceRow.status) {
    updates.status = plan.nextStatus;
    if (plan.nextStatus === "sent" && !invoiceRow.issued_at) {
      updates.issued_at = isoDate(xeroInvoice.date) ?? new Date().toISOString();
    }
    if (plan.nextStatus === "paid" && !invoiceRow.paid_at) {
      updates.paid_at = isoDate(xeroInvoice.fullyPaidOnDate) ?? new Date().toISOString();
    }
  }

  if (plan.syncDueDate) {
    const due = isoDate(xeroInvoice.dueDate);
    // Only record a genuine change — the caller reports "n updated" back to the
    // admin, and rewriting an identical date would count every invoice checked.
    if (due && due !== invoiceRow.due_date) updates.due_date = due;
  }

  let repricedTo: number | null = null;

  if (plan.syncAmount) {
    const total = xeroInvoice.total ?? 0;
    const amountCents = centsFromDollars(total);
    if (amountCents > 0 && amountCents !== invoiceRow.amount_cents) {
      updates.amount_cents = amountCents;
      updates.gst_cents = gstComponentCents(amountCents);
      repricedTo = amountCents;
    }
  }

  if (Object.keys(updates).length > 0) {
    await supabase.from("invoices").update(updates).eq("id", invoiceRow.id);
  }

  // Rebuild line items to match Xero's whenever we re-synced the amount, so the
  // payer's breakdown can never disagree with the total we're billing.
  if (plan.syncAmount) {
    const lines = (xeroInvoice.lineItems ?? []).filter((li) => (li.lineAmount ?? 0) !== 0);
    if (lines.length > 0) {
      await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceRow.id);
      await supabase.from("invoice_line_items").insert(
        lines.map((li, idx) => {
          const qty = li.quantity ?? 1;
          // Xero carries discounts as a separate discountRate/discountAmount on
          // top of an undiscounted unitAmount, but Olune has no discount column
          // — so derive the effective unit price from lineAmount (which is net
          // of the discount). Otherwise qty x unit wouldn't reconcile with the
          // line total on any discounted invoice.
          const lineTotalCents =
            li.lineAmount != null
              ? centsFromDollars(li.lineAmount)
              : centsFromDollars(li.unitAmount ?? 0) * qty;
          const unitCents =
            qty !== 0 ? Math.round(lineTotalCents / qty) : centsFromDollars(li.unitAmount ?? 0);
          return {
            invoice_id: invoiceRow.id,
            item_type: "custom",
            description: li.description ?? "Xero line item",
            quantity: qty,
            unit_cents: unitCents,
            line_total_cents: lineTotalCents,
            sort_order: idx,
          };
        }),
      );
    }
  }

  if (plan.cancelStripe) {
    await cancelStripeIntent(invoiceRow.stripe_payment_intent_id as string | null);
  } else if (repricedTo !== null) {
    await repriceStripeIntent(invoiceRow.stripe_payment_intent_id as string | null, repricedTo);
  }

  await supabase
    .from("xero_connections")
    .update({ last_sync_at: new Date().toISOString(), sync_error: null })
    .eq("studio_id", studioId);

  return Object.keys(updates).length > 0;
}

/**
 * Reconcile a single Xero invoice back onto its Olune counterpart. Best-effort:
 * swallows and logs errors so one bad event never fails the whole webhook (Xero
 * would otherwise retry-storm the endpoint).
 */
export async function reconcileXeroInvoice(
  fallbackSupabase: SupabaseClient,
  tenantId: string,
  xeroInvoiceId: string,
): Promise<void> {
  const supabase = syncSupabase(fallbackSupabase);

  try {
    const { data: connection } = await supabase
      .from("xero_connections")
      .select("studio_id")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    const studioId = connection?.studio_id as string | undefined;
    if (!studioId) return; // webhook for an org we're not connected to

    await reconcileInvoiceForStudio(supabase, studioId, xeroInvoiceId);
  } catch (err) {
    console.warn(`[xero-inbound] reconcile ${xeroInvoiceId} failed:`, err);
  }
}

/**
 * Manual "Refresh from Xero" entry point — walks every not-yet-final invoice
 * that's already linked to Xero and re-pulls its current state, the same way
 * the webhook does per-event. This is a deliberate catch-up path: webhooks can
 * be missed (endpoint briefly down, misconfigured signing key, etc.), so admins
 * need a way to force a sync without waiting on Xero to redeliver.
 */
export async function refreshStudioXeroSync(
  fallbackSupabase: SupabaseClient,
  studioId: string,
): Promise<{ ok: true; checked: number; updated: number } | { ok: false; error: string }> {
  const supabase = syncSupabase(fallbackSupabase);

  const { data: connection } = await supabase
    .from("xero_connections")
    .select("studio_id")
    .eq("studio_id", studioId)
    .maybeSingle();
  if (!connection) return { ok: false, error: "Xero is not connected for this studio" };

  const { data: rows, error } = await supabase
    .from("invoices")
    .select("xero_invoice_id")
    .eq("studio_id", studioId)
    .in("status", ["draft", "sent", "overdue"])
    .not("xero_invoice_id", "is", null);
  if (error) return { ok: false, error: error.message };

  const xeroInvoiceIds = [...new Set((rows ?? []).map((r) => r.xero_invoice_id as string))];

  let updated = 0;
  // Sequential, not parallel — respects Xero's per-minute API rate limit. This
  // button is an occasional manual catch-up, not a hot path.
  for (const xeroInvoiceId of xeroInvoiceIds) {
    try {
      const changed = await reconcileInvoiceForStudio(supabase, studioId, xeroInvoiceId);
      if (changed) updated += 1;
    } catch (err) {
      console.warn(`[xero-inbound] refresh ${xeroInvoiceId} failed:`, err);
    }
  }

  return { ok: true, checked: xeroInvoiceIds.length, updated };
}
