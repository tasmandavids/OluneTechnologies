// ============================================================================
//  /portal/admin/badges — studio badge catalogue management.
//  Admins can hide global badges from their studio and add custom ones.
// ============================================================================

import { redirect } from "next/navigation";
import { getPortalSession } from "@/lib/portal/session";
import StudioBadgeManager, {
  type ManagedBadge,
} from "@/components/admin/badges/StudioBadgeManager";

export const dynamic = "force-dynamic";

export default async function AdminBadgesPage() {
  const session = await getPortalSession();
  if (!session) redirect("/login");
  if (session.role !== "admin") redirect("/portal/admin");

  const { supabase, studioId } = session;

  const [defsRes, hiddenRes] = await Promise.all([
    supabase
      .from("badge_definitions")
      .select(
        "id, studio_id, key, category, name, description, icon, tier, xp, is_secret, recipient_type, sort",
      )
      .or(`studio_id.is.null,studio_id.eq.${studioId}`)
      .eq("is_active", true)
      .order("sort", { ascending: true }),
    supabase
      .from("studio_badge_visibility")
      .select("badge_id")
      .eq("studio_id", studioId)
      .eq("hidden", true),
  ]);

  const hidden = new Set((hiddenRes.data ?? []).map((r) => r.badge_id as string));

  const badges: ManagedBadge[] = (defsRes.data ?? []).map((r) => ({
    id: r.id as string,
    category: r.category as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    icon: (r.icon as string | null) ?? null,
    tier: r.tier as ManagedBadge["tier"],
    xp: (r.xp as number) ?? 0,
    isSecret: Boolean(r.is_secret),
    recipientType: (r.recipient_type as ManagedBadge["recipientType"]) ?? "student",
    isCustom: r.studio_id !== null,
    hidden: hidden.has(r.id as string),
  }));

  return <StudioBadgeManager badges={badges} />;
}
