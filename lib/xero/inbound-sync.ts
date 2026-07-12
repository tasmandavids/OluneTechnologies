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
  /** Rewrite amount_cents + line items from Xero (only safe while a local draft). */
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
      // final numbers in the same pass. Once already sent/overdue, only the
      // (cosmetic) due date is still safe to follow.
      return olune === "draft"
        ? { nextStatus: "sent", cancelStripe: false, syncAmount: true, syncDueDate: true }
        : { nextStatus: null, cancelStripe: false, syncAmount: false, syncDueDate: true };
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

/** ISO date (yyyy-mm-dd) from Xero's various date encodings, else null. */
function isoDate(value: string | undefined | null): string | null {
  if (!value) return null;
  // Xero returns either "2026-07-12T00:00:00" or "/Date(1752278400000+0000)/".
  const msMatch = /\/Date\((\d+)/.exec(value);
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

    const { data: invoiceRow } = await supabase
      .from("invoices")
      .select("id, status, stripe_payment_intent_id, paid_at, issued_at")
      .eq("studio_id", studioId)
      .eq("xero_invoice_id", xeroInvoiceId)
      .maybeSingle();

    // Only invoices Olune already knows about are reconciled. Xero-native
    // invoices with no Olune counterpart are intentionally ignored.
    if (!invoiceRow) return;

    const loaded = await loadStudioXeroClient(supabase, studioId, xeroRedirectUriForJobs());
    if (!loaded) return;

    const res = await loaded.client.accountingApi.getInvoice(loaded.tenantId, xeroInvoiceId);
    const xeroInvoice = res.body.invoices?.[0];
    if (!xeroInvoice) return;

    const xeroStatus = xeroStatusOf(xeroInvoice);
    if (!xeroStatus) return;

    const plan = planInvoiceReconcile(invoiceRow.status as OluneInvoiceStatus, xeroStatus);

    const updates: Record<string, unknown> = {};

    if (plan.nextStatus && plan.nextStatus !== invoiceRow.status) {
      updates.status = plan.nextStatus;
      if (plan.nextStatus === "sent" && !invoiceRow.issued_at) {
        updates.issued_at = isoDate(xeroInvoice.date) ?? new Date().toISOString();
      }
      if (plan.nextStatus === "paid" && !invoiceRow.paid_at) {
        updates.paid_at =
          isoDate(xeroInvoice.fullyPaidOnDate) ?? new Date().toISOString();
      }
    }

    if (plan.syncDueDate) {
      const due = isoDate(xeroInvoice.dueDate);
      if (due) updates.due_date = due;
    }

    if (plan.syncAmount) {
      const total = xeroInvoice.total ?? 0;
      const amountCents = centsFromDollars(total);
      if (amountCents > 0) {
        updates.amount_cents = amountCents;
        updates.gst_cents = gstComponentCents(amountCents);
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from("invoices").update(updates).eq("id", invoiceRow.id);
    }

    // Rebuild line items to match Xero's, but only when we actually re-synced
    // the amount (i.e. the invoice is still an editable draft on our side).
    if (plan.syncAmount) {
      const lines = (xeroInvoice.lineItems ?? []).filter((li) => (li.lineAmount ?? 0) !== 0);
      if (lines.length > 0) {
        await supabase.from("invoice_line_items").delete().eq("invoice_id", invoiceRow.id);
        await supabase.from("invoice_line_items").insert(
          lines.map((li, idx) => {
            const unitCents = centsFromDollars(li.unitAmount ?? 0);
            const qty = li.quantity ?? 1;
            return {
              invoice_id: invoiceRow.id,
              item_type: "custom",
              description: li.description ?? "Xero line item",
              quantity: qty,
              unit_cents: unitCents,
              line_total_cents:
                li.lineAmount != null ? centsFromDollars(li.lineAmount) : unitCents * qty,
              sort_order: idx,
            };
          }),
        );
      }
    }

    if (plan.cancelStripe) {
      await cancelStripeIntent(invoiceRow.stripe_payment_intent_id as string | null);
    }

    await supabase
      .from("xero_connections")
      .update({ last_sync_at: new Date().toISOString(), sync_error: null })
      .eq("studio_id", studioId);
  } catch (err) {
    console.warn(`[xero-inbound] reconcile ${xeroInvoiceId} failed:`, err);
  }
}
