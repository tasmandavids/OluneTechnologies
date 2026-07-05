// ============================================================================
//  /portal/admin/settings — Studio settings page.
//  Shows studio identity (name, slug, status) and allows editing the name.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import AdminSettings from "@/components/admin/AdminSettings";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id")
    .eq("id", user!.id)
    .single();

  const { data: studio } = profile?.studio_id
    ? await supabase
        .from("studios")
        .select("id, name, slug, custom_domain, status, created_at, sibling_discount_pct, family_discount_on_retail, timezone, registration_enabled, registration_roles, billing_period")
        .eq("id", profile.studio_id)
        .single()
    : { data: null };

  const { data: terms } = profile?.studio_id
    ? await supabase
        .from("studio_terms")
        .select("id, name, start_date, end_date, invoice_lead_days")
        .eq("studio_id", profile.studio_id)
        .order("start_date")
    : { data: [] };

  return (
    <AdminSettings
      studio={
        studio
          ? {
              id: studio.id,
              name: studio.name,
              slug: studio.slug,
              customDomain: studio.custom_domain,
              status: studio.status,
              createdAt: studio.created_at,
              siblingDiscountPct: studio.sibling_discount_pct ?? 0,
              familyDiscountOnRetail: studio.family_discount_on_retail ?? false,
              timezone: studio.timezone ?? "Pacific/Auckland",
              registrationEnabled: studio.registration_enabled ?? false,
              registrationRoles: (studio.registration_roles as string[]) ?? ["parent", "student"],
              billingPeriod: (studio.billing_period as "monthly" | "termly") ?? "monthly",
            }
          : null
      }
      terms={(terms ?? []).map((t) => ({
        id: t.id as string,
        name: t.name as string,
        startDate: t.start_date as string,
        endDate: t.end_date as string,
        invoiceLeadDays: t.invoice_lead_days as number,
      }))}
    />
  );
}
