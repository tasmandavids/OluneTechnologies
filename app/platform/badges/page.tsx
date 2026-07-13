// ============================================================================
//  /platform/badges — global badge catalogue (studio_id is null).
//  Platform operators can adjust XP, tier, copy and active state. Studios
//  inherit these; per-studio customisation lives in /portal/admin/badges.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import PlatformBadgeManager, {
  type GlobalBadge,
} from "@/components/platform/PlatformBadgeManager";

export const dynamic = "force-dynamic";

export default async function PlatformBadgesPage() {
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("badge_definitions")
    .select("id, category, name, description, icon, tier, xp, is_secret, recipient_type, is_active, sort")
    .is("studio_id", null)
    .order("sort", { ascending: true });

  const badges: GlobalBadge[] = (rows ?? []).map((r) => ({
    id: r.id as string,
    category: r.category as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    icon: (r.icon as string | null) ?? null,
    tier: r.tier as GlobalBadge["tier"],
    xp: (r.xp as number) ?? 0,
    isSecret: Boolean(r.is_secret),
    recipientType: (r.recipient_type as GlobalBadge["recipientType"]) ?? "student",
    isActive: Boolean(r.is_active),
  }));

  return <PlatformBadgeManager badges={badges} />;
}
