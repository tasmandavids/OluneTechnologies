// ============================================================================
//  Ledger tab — read-only feed of every real money movement recorded in
//  Olune: the `payments` table, written by the Stripe webhook on successful
//  charges (invoices, term-plan instalments) and by refundSale on refunds.
//  This is not an editable manual ledger — nothing in the app supports
//  hand-entered journal lines, so we don't fake that interaction.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { LedgerDashboard, type LedgerRow } from "@/components/admin/money/LedgerDashboard";

export async function LedgerTab() {
  const { supabase, studioId } = await requirePortalSession();

  const { data } = await supabase
    .from("payments")
    .select(`
      id, amount_cents, status, description, created_at, invoice_id,
      invoices ( invoice_number ),
      payer:profiles!payer_id ( full_name )
    `)
    .eq("studio_id", studioId)
    .order("created_at", { ascending: false })
    .limit(100);

  const chronological = [...(data ?? [])].reverse();

  let runningCents = 0;
  const withBalance: LedgerRow[] = chronological.map((row) => {
    const invoice = row.invoices as unknown as { invoice_number: number } | null;
    const payer = row.payer as unknown as { full_name: string | null } | null;
    runningCents += row.amount_cents as number;
    return {
      id: row.id as string,
      amountCents: row.amount_cents as number,
      status: row.status as string,
      description: (row.description as string | null) ?? null,
      createdAt: row.created_at as string,
      invoiceNumber: invoice?.invoice_number ?? null,
      payerName: payer?.full_name ?? null,
      runningTotalCents: runningCents,
    };
  });

  const rows = withBalance.reverse();

  return <LedgerDashboard rows={rows} />;
}
