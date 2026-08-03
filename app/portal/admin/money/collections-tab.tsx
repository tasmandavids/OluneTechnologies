// ============================================================================
//  Collections tab — overdue accounts ranked by how much is at stake, so the
//  studio owner chases the biggest problems first. Built entirely on the
//  existing `invoices` table and the real sendPaymentReminder/
//  sendBulkPaymentReminders actions — no invented "AI drafting" here, since
//  the reminder copy those actions send is fixed, not tone-customisable.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { CollectionsDashboard, type CollectionsFamily } from "@/components/admin/money/CollectionsDashboard";

export async function CollectionsTab() {
  const { supabase, studioId } = await requirePortalSession();

  const { data } = await supabase
    .from("invoices")
    .select(`
      id, invoice_number, payer_id, amount_cents, due_date, description,
      payer:profiles!payer_id ( full_name )
    `)
    .eq("studio_id", studioId)
    .eq("status", "overdue")
    .order("due_date", { ascending: true });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const byPayer = new Map<string, CollectionsFamily>();
  for (const inv of data ?? []) {
    const payer = inv.payer as unknown as { full_name: string | null } | null;
    const dueDate = inv.due_date as string | null;
    const daysOverdue = dueDate
      ? Math.max(0, Math.round((today.getTime() - new Date(dueDate).getTime()) / 86_400_000))
      : 0;

    const payerId = inv.payer_id as string;
    const existing = byPayer.get(payerId) ?? {
      payerId,
      payerName: payer?.full_name ?? "Family",
      totalCents: 0,
      maxDaysOverdue: 0,
      invoices: [],
    };
    existing.totalCents += inv.amount_cents as number;
    existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, daysOverdue);
    existing.invoices.push({
      id: inv.id as string,
      invoiceNumber: inv.invoice_number as number,
      amountCents: inv.amount_cents as number,
      dueDate: dueDate ?? "",
      description: (inv.description as string | null) ?? null,
      daysOverdue,
    });
    byPayer.set(payerId, existing);
  }

  const queue = [...byPayer.values()].sort(
    (a, b) => b.totalCents * b.maxDaysOverdue - a.totalCents * a.maxDaysOverdue,
  );

  return <CollectionsDashboard queue={queue} />;
}
