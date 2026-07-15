// ============================================================================
//  POST /api/webhooks/xero
//
//  Receives Xero webhook events and syncs invoice changes back into Olune —
//  the inbound counterpart to lib/xero/sync-sale.ts. Handles:
//    • Authorising/sending an invoice in Xero   → mark the Olune copy "sent"
//    • Editing a still-draft invoice in Xero     → sync amount / lines / due date
//    • Marking an invoice Paid in Xero           → mark paid + cancel Stripe link
//    • Voiding/deleting an invoice in Xero        → mark void + cancel Stripe link
//
//  Xero only sends resource IDs, never data, so reconcileXeroInvoice re-fetches
//  each invoice from Xero and syncs to its current state (idempotent).
//
//  Requires env: XERO_WEBHOOK_KEY (App → Webhooks → "Signing key")
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyXeroSignature } from "@/lib/xero/webhook-verify";
import { reconcileXeroInvoice } from "@/lib/xero/inbound-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface XeroWebhookEvent {
  resourceId?: string;
  tenantId?: string;
  eventCategory?: string;
  eventType?: string;
}

export async function POST(req: NextRequest) {
  // Raw body is required for the HMAC — never re-serialise before verifying.
  const rawBody = await req.text();
  const signature = req.headers.get("x-xero-signature");

  const key = process.env.XERO_WEBHOOK_KEY;
  if (!key) {
    console.error("XERO_WEBHOOK_KEY not set");
    // 401 (not 500) so Xero's "intent to receive" check reads it as a rejected
    // signature rather than retry-storming a misconfigured endpoint.
    return new NextResponse(null, { status: 401 });
  }

  if (!verifyXeroSignature(rawBody, signature, key)) {
    return new NextResponse(null, { status: 401 });
  }

  // Signature is valid → acknowledge fast. Xero times out the delivery if we
  // don't respond within 5s, and treats any non-2xx as a failure to retry.
  let payload: { events?: XeroWebhookEvent[] };
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return new NextResponse(null, { status: 200 });
  }

  const supabase = await createClient();

  // Dedupe: a single delivery can carry several events for the same invoice
  // (e.g. edit + authorise). We re-fetch current state anyway, so one reconcile
  // per (tenant, invoice) is enough.
  const seen = new Set<string>();
  const jobs: Promise<void>[] = [];
  for (const event of payload.events ?? []) {
    if (event.eventCategory !== "INVOICE") continue;
    if (!event.resourceId || !event.tenantId) continue;
    const dedupeKey = `${event.tenantId}:${event.resourceId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    jobs.push(reconcileXeroInvoice(supabase, event.tenantId, event.resourceId));
  }

  await Promise.allSettled(jobs);

  return new NextResponse(null, { status: 200 });
}
