// ============================================================================
//  POST /api/admin/xero-invoice-backfill   (one-off maintenance endpoint)
//
//  Pushes every not-yet-synced invoice (draft/sent/overdue) for ONE named
//  studio into Xero as an itemized Draft, using the same
//  syncOutstandingInvoiceToXero path new invoices take. Requires an explicit
//  studioId — deliberately does not iterate every Xero-connected studio, since
//  this is a one-off backfill for a single studio's data, not a recurring job.
//  Delete this file once the backfill has run.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { authorizedCron } from "@/lib/cron/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { xeroSyncOutstandingInvoice } from "@/lib/xero/webhook-sync";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const studioId = req.nextUrl.searchParams.get("studioId");
  if (!studioId) {
    return NextResponse.json({ error: "studioId query param is required" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: connection, error: connErr } = await supabase
    .from("xero_connections")
    .select("studio_id")
    .eq("studio_id", studioId)
    .maybeSingle();
  if (connErr) return NextResponse.json({ error: connErr.message }, { status: 500 });
  if (!connection) {
    return NextResponse.json({ error: "This studio has no active Xero connection" }, { status: 400 });
  }

  const { data: invoices, error: invErr } = await supabase
    .from("invoices")
    .select("id, status, description")
    .eq("studio_id", studioId)
    .in("status", ["draft", "sent", "overdue"])
    .is("xero_invoice_id", null);
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

  const results: { invoiceId: string; ok: boolean; xeroInvoiceId?: string; error?: string }[] = [];
  for (const inv of invoices ?? []) {
    const label = (inv.description as string | null)?.trim() || "Studio invoice";
    const res = await xeroSyncOutstandingInvoice(supabase, inv.id as string, { lineDescription: label });
    results.push(
      res.ok
        ? { invoiceId: inv.id as string, ok: true, xeroInvoiceId: res.xeroInvoiceId }
        : { invoiceId: inv.id as string, ok: false, error: res.error },
    );
  }

  return NextResponse.json({
    ok: true,
    studioId,
    totalInvoices: (invoices ?? []).length,
    succeeded: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
