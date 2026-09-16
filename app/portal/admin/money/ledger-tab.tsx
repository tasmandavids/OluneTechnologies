import { requirePortalSession } from "@/lib/portal/session";
import { LedgerDashboard, type LedgerRow } from "@/components/admin/money/LedgerDashboard";
import { PageLinks } from "@/components/ui/PageLinks";
import { PAGE_SIZE } from "@/lib/pagination";

export async function LedgerTab({ page = 1 }: { page?: number }) {
  const { supabase, studioId } = await requirePortalSession();
  const { data, error } = await supabase.rpc("portal_ledger_page", { p_studio_id: studioId, p_offset: (page - 1) * PAGE_SIZE });
  if (error || !data) throw new Error("Unable to load ledger");
  const ledger = data as { rows: LedgerRow[]; count: number; netCents: number };
  return <>
    <LedgerDashboard rows={ledger.rows} totalCount={ledger.count} netCents={ledger.netCents} />
    <PageLinks page={page} total={ledger.count} baseHref="/portal/admin/money?tab=ledger" />
  </>;
}
