import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { xeroRedirectUriForJobs } from "./config";
import {
  authoriseOutstandingInvoiceInXero,
  syncOutstandingInvoiceToXero,
  syncRefundToXero,
  syncSaleToXero,
  updateOutstandingInvoiceInXero,
  voidInvoiceInXero,
} from "./sync-sale";
import type { XeroSyncSourceType } from "./types";

const redirectUri = () => xeroRedirectUriForJobs();

/** Prefer service-role client so sync works from parent flows and webhooks. */
function syncSupabase(fallback: SupabaseClient): SupabaseClient {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return createAdminClient();
  return fallback;
}

export async function xeroSyncOutstandingInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
  options?: { lineDescription?: string },
): Promise<{ ok: true; xeroInvoiceId: string } | { ok: false; error: string }> {
  try {
    return await syncOutstandingInvoiceToXero(
      syncSupabase(supabase),
      invoiceId,
      redirectUri(),
      options,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero sync failed";
    console.warn(`[xero-sync] outstanding invoice ${invoiceId}: ${message}`);
    return { ok: false, error: message };
  }
}

export async function xeroSyncAfterPayment(
  supabase: SupabaseClient,
  kind: "invoice" | "order" | "ticket",
  id: string,
): Promise<void> {
  try {
    const result = await syncSaleToXero(syncSupabase(supabase), kind, id, redirectUri());
    if (!result.ok) {
      console.warn(`[xero-sync] ${kind} ${id}: ${result.error}`);
    }
  } catch (err) {
    console.warn(`[xero-sync] ${kind} ${id} failed:`, err);
  }
}

export async function xeroSyncTicketByPaymentIntent(
  supabase: SupabaseClient,
  eventId: string,
  paymentIntentId: string,
  userId?: string | null,
): Promise<void> {
  let q = supabase
    .from("event_tickets")
    .select("id")
    .eq("event_id", eventId)
    .eq("stripe_payment_intent_id", paymentIntentId)
    .eq("status", "paid");
  if (userId) q = q.eq("user_id", userId);
  const { data: ticket } = await q.maybeSingle();
  if (ticket?.id) await xeroSyncAfterPayment(supabase, "ticket", ticket.id);
}

export async function xeroSyncAfterRefund(
  supabase: SupabaseClient,
  sourceType: XeroSyncSourceType,
  sourceId: string,
  refundCents: number,
): Promise<void> {
  try {
    await syncRefundToXero(syncSupabase(supabase), sourceType, sourceId, refundCents, redirectUri());
  } catch (err) {
    console.warn(`[xero-sync] refund ${sourceType} ${sourceId} failed:`, err);
  }
}

export async function xeroUpdateOutstandingInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await updateOutstandingInvoiceInXero(syncSupabase(supabase), invoiceId, redirectUri());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero update failed";
    console.warn(`[xero-sync] update invoice ${invoiceId}: ${message}`);
    return { ok: false, error: message };
  }
}

export async function xeroAuthoriseOutstandingInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await authoriseOutstandingInvoiceInXero(syncSupabase(supabase), invoiceId, redirectUri());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero authorise failed";
    console.warn(`[xero-sync] authorise invoice ${invoiceId}: ${message}`);
    return { ok: false, error: message };
  }
}

export async function xeroVoidInvoice(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await voidInvoiceInXero(syncSupabase(supabase), invoiceId, redirectUri());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Xero void failed";
    console.warn(`[xero-sync] void invoice ${invoiceId}: ${message}`);
    return { ok: false, error: message };
  }
}
