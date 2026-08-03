// ============================================================================
//  Overview tab — the first thing a studio owner sees: what's outstanding,
//  what needs attention, and the revenue trend. A lighter, dashboard-scoped
//  query set against the same invoices/subscriptions tables Invoices uses —
//  not a duplicate of the full AR workbench fetch.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { OverviewDashboard } from "@/components/admin/money/OverviewDashboard";

const YEAR_AGO = () => new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
const YEAR_START = () => `${new Date().getFullYear()}-01-01`;
const MONTH_START = () => `${new Date().toISOString().slice(0, 7)}-01`;

export async function OverviewTab() {
  const { supabase, studioId } = await requirePortalSession();

  const [unpaidRes, draftCountRes, ytdPaidRes, monthGstRes, subsRes, revenueRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, amount_cents, status, due_date")
      .eq("studio_id", studioId)
      .in("status", ["sent", "overdue"]),

    supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studioId)
      .eq("status", "draft"),

    supabase
      .from("invoices")
      .select("amount_cents, refund_amount_cents")
      .eq("studio_id", studioId)
      .in("status", ["paid", "refunded"])
      .gte("paid_at", YEAR_START()),

    supabase
      .from("invoices")
      .select("gst_cents")
      .eq("studio_id", studioId)
      .in("status", ["paid", "refunded"])
      .gte("paid_at", MONTH_START()),

    supabase
      .from("subscriptions")
      .select("id, monthly_amount_cents, amount_cents, status")
      .eq("studio_id", studioId),

    supabase
      .from("invoices")
      .select("amount_cents, refund_amount_cents, paid_at")
      .eq("studio_id", studioId)
      .in("status", ["paid", "refunded"])
      .not("paid_at", "is", null)
      .gte("paid_at", YEAR_AGO()),
  ]);

  const unpaid = unpaidRes.data ?? [];
  const outstandingCents = unpaid.reduce((s, i) => s + (i.amount_cents as number), 0);
  const overdue = unpaid.filter((i) => i.status === "overdue");
  const overdueCents = overdue.reduce((s, i) => s + (i.amount_cents as number), 0);

  const netCents = (r: { amount_cents: unknown; refund_amount_cents?: unknown }) =>
    Math.max(0, (r.amount_cents as number) - ((r.refund_amount_cents as number) ?? 0));

  const totalPaidCents = (ytdPaidRes.data ?? []).reduce((s, r) => s + netCents(r), 0);
  const gstThisMonthCents = (monthGstRes.data ?? []).reduce(
    (s, r) => s + ((r.gst_cents as number) ?? 0),
    0,
  );

  const subs = subsRes.data ?? [];
  const mrrCents = subs
    .filter((s) => ["active", "trialing", "past_due"].includes(s.status as string))
    .reduce(
      (s, sub) =>
        s + Number((sub.monthly_amount_cents as number) ?? (sub.amount_cents as number) ?? 0),
      0,
    );

  const monthMap = new Map<string, number>();
  for (const p of revenueRes.data ?? []) {
    if (!p.paid_at) continue;
    const month = (p.paid_at as string).slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + netCents(p));
  }
  const revenue: { month: string; revenueCents: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - i);
    const key = d.toISOString().slice(0, 7);
    revenue.push({ month: key, revenueCents: monthMap.get(key) ?? 0 });
  }

  return (
    <OverviewDashboard
      outstandingCents={outstandingCents}
      unpaidCount={unpaid.length}
      overdueCount={overdue.length}
      overdueCents={overdueCents}
      draftCount={draftCountRes.count ?? 0}
      totalPaidCents={totalPaidCents}
      gstThisMonthCents={gstThisMonthCents}
      mrrCents={mrrCents}
      activeSubs={subs.filter((s) => s.status === "active").length}
      revenue={revenue}
    />
  );
}
