// ============================================================================
//  Accounting tab — where the studio's books live (Xero or Olune Books), how
//  that's going, and how to change it. Replaces the old Reports and Reconcile
//  tabs, which each half-answered this question differently per ledger.
//
//  Xero studios also get their Xero P&L plus GST/aged receivables from
//  Olune's invoices. Books studios get shortcuts into Books, which has the
//  real statements; showing invoice-derived GST next to Books' own tax return
//  would put two different numbers on screen for the same thing.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { loadAccountingSetup } from "@/lib/accounting/provider";
import { fetchAccountingSnapshot } from "@/lib/xero/accounting-data";
import { isXeroConfigured, xeroRedirectUri } from "@/lib/xero/config";
import { resolveAppOriginFromHeaders } from "@/lib/xero/app-origin";
import { AccountingHome } from "@/components/admin/money/AccountingHome";
import { XeroReports, type AgedReceivables } from "@/components/admin/money/XeroReports";

const MONTH_START = () => `${new Date().toISOString().slice(0, 7)}-01`;

function quarterStart() {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) * 3;
  return new Date(d.getFullYear(), q, 1).toISOString().slice(0, 10);
}

export async function AccountingTab({
  bannerConnected,
  bannerError,
}: {
  bannerConnected: string | null;
  bannerError: string | null;
}) {
  const { supabase, studioId } = await requirePortalSession();
  const setup = await loadAccountingSetup(supabase, studioId);

  const { data: booksRow } = setup.books
    ? await supabase.from("ledger_settings").select("last_sync_error").eq("studio_id", studioId).maybeSingle()
    : { data: null };

  let xeroSection: React.ReactNode = null;
  let xeroLastSyncAt: string | null = null;

  if (setup.choice === "xero" && setup.xero) {
    const origin = await resolveAppOriginFromHeaders();
    const [snapshot, gstMonthRes, gstQuarterRes, unpaidRes] = await Promise.all([
      fetchAccountingSnapshot(supabase, studioId, xeroRedirectUri(origin)),
      supabase.from("invoices").select("gst_cents").eq("studio_id", studioId).in("status", ["paid", "refunded"]).gte("paid_at", MONTH_START()),
      supabase.from("invoices").select("gst_cents").eq("studio_id", studioId).in("status", ["paid", "refunded"]).gte("paid_at", quarterStart()),
      supabase.from("invoices").select("amount_cents, due_date").eq("studio_id", studioId).in("status", ["sent", "overdue"]),
    ]);
    xeroLastSyncAt = snapshot.connection?.last_sync_at ?? null;

    const sum = (rows: { gst_cents: unknown }[] | null) => (rows ?? []).reduce((s, r) => s + ((r.gst_cents as number) ?? 0), 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const aged: AgedReceivables = {
      current: { cents: 0, count: 0 },
      d1to30: { cents: 0, count: 0 },
      d31to60: { cents: 0, count: 0 },
      d61plus: { cents: 0, count: 0 },
    };
    for (const inv of unpaidRes.data ?? []) {
      const due = inv.due_date as string | null;
      const days = due ? Math.round((today.getTime() - new Date(due).getTime()) / 86_400_000) : 0;
      const bucket = days <= 0 ? aged.current : days <= 30 ? aged.d1to30 : days <= 60 ? aged.d31to60 : aged.d61plus;
      bucket.cents += inv.amount_cents as number;
      bucket.count += 1;
    }

    xeroSection = (
      <XeroReports
        snapshot={snapshot}
        gstMonthCents={sum(gstMonthRes.data)}
        gstQuarterCents={sum(gstQuarterRes.data)}
        aged={aged}
      />
    );
  }

  return (
    <AccountingHome
      choice={setup.choice}
      xero={setup.xero ? { ...setup.xero, lastSyncAt: xeroLastSyncAt } : null}
      books={
        setup.books
          ? {
              label: `${setup.books.jurisdiction} · ${setup.books.baseCurrency}`,
              lastSyncedAt: setup.books.lastSyncedAt,
              lastSyncError: (booksRow?.last_sync_error as string | null) ?? null,
            }
          : null
      }
      xeroConfigured={isXeroConfigured()}
      bannerConnected={bannerConnected}
      bannerError={bannerError}
    >
      {xeroSection}
    </AccountingHome>
  );
}
