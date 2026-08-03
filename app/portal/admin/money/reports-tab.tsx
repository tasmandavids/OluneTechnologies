// ============================================================================
//  Reports tab — Xero P&L (real, reuses fetchAccountingSnapshot verbatim),
//  a GST summary and an aged-receivables breakdown computed from the same
//  invoices table Invoices/Overview use. Revenue-by-programme and custom
//  exports aren't built yet — shown as honest "coming soon" cards, not
//  fabricated data.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { fetchAccountingSnapshot } from "@/lib/xero/accounting-data";
import { xeroRedirectUri } from "@/lib/xero/config";
import { resolveAppOriginFromHeaders } from "@/lib/xero/app-origin";
import { ReportsDashboard, type AgedReceivables } from "@/components/admin/money/ReportsDashboard";

const MONTH_START = () => `${new Date().toISOString().slice(0, 7)}-01`;

function quarterStart() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1).toISOString().slice(0, 10);
}

export async function ReportsTab({
  bannerError,
  bannerConnected,
}: {
  bannerError: string | null;
  bannerConnected: boolean;
}) {
  const { supabase, studioId } = await requirePortalSession();
  const origin = await resolveAppOriginFromHeaders();
  const redirectUri = xeroRedirectUri(origin);

  const [snapshot, gstMonthRes, gstQuarterRes, unpaidRes] = await Promise.all([
    fetchAccountingSnapshot(supabase, studioId, redirectUri),
    supabase
      .from("invoices")
      .select("gst_cents")
      .eq("studio_id", studioId)
      .in("status", ["paid", "refunded"])
      .gte("paid_at", MONTH_START()),
    supabase
      .from("invoices")
      .select("gst_cents")
      .eq("studio_id", studioId)
      .in("status", ["paid", "refunded"])
      .gte("paid_at", quarterStart()),
    supabase
      .from("invoices")
      .select("amount_cents, due_date")
      .eq("studio_id", studioId)
      .in("status", ["sent", "overdue"]),
  ]);

  const gstMonthCents = (gstMonthRes.data ?? []).reduce((s, r) => s + ((r.gst_cents as number) ?? 0), 0);
  const gstQuarterCents = (gstQuarterRes.data ?? []).reduce(
    (s, r) => s + ((r.gst_cents as number) ?? 0),
    0,
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const aged: AgedReceivables = {
    current: { cents: 0, count: 0 },
    d1to30: { cents: 0, count: 0 },
    d31to60: { cents: 0, count: 0 },
    d61plus: { cents: 0, count: 0 },
  };
  for (const inv of unpaidRes.data ?? []) {
    const amount = inv.amount_cents as number;
    const due = inv.due_date as string | null;
    const days = due ? Math.round((today.getTime() - new Date(due).getTime()) / 86_400_000) : 0;
    const bucket = days <= 0 ? aged.current : days <= 30 ? aged.d1to30 : days <= 60 ? aged.d31to60 : aged.d61plus;
    bucket.cents += amount;
    bucket.count += 1;
  }

  return (
    <ReportsDashboard
      snapshot={snapshot}
      redirectUri={redirectUri}
      bannerError={bannerError}
      bannerConnected={bannerConnected}
      gstMonthCents={gstMonthCents}
      gstQuarterCents={gstQuarterCents}
      aged={aged}
    />
  );
}
