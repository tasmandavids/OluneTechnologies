// ============================================================================
//  /portal/admin/leads — CRM pipeline (server component).
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { LeadsBoard } from "@/components/admin/leads/LeadsBoard";
import { attributionLabel } from "@/lib/analytics/attribution";

export type Lead = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  /** Acquisition channel, e.g. "instagram / cpc". Null means no signal. */
  channel: string | null;
  /** Campaign name, when the link carried one. */
  campaign: string | null;
  status: "new" | "contacted" | "trial" | "converted" | "lost";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export default async function LeadsPage() {
  const { supabase, studioId } = await requirePortalSession();

  const { data } = await supabase
    .from("leads")
    .select(
      "id, first_name, last_name, email, phone, source, status, notes, created_at, updated_at, utm_source, utm_medium, utm_campaign, referrer",
    )
    .eq("studio_id", studioId)
    .order("updated_at", { ascending: false });

  const leads: Lead[] = (data ?? []).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    phone: r.phone,
    source: r.source,
    // Reduced to one label here rather than in the client — the board only
    // ever shows the short form, and the raw UTMs are noise in a list.
    channel: attributionLabel({
      utmSource: r.utm_source ?? null,
      utmMedium: r.utm_medium ?? null,
      utmCampaign: r.utm_campaign ?? null,
      utmTerm: null,
      utmContent: null,
      referrer: r.referrer ?? null,
      landingPath: null,
    }),
    campaign: r.utm_campaign ?? null,
    status: r.status as Lead["status"],
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));

  return <LeadsBoard initialLeads={leads} />;
}
