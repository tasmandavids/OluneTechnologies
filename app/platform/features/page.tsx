import { createAdminClient } from "@/lib/supabase/admin";
import { FeatureFlagsManager } from "@/components/platform/FeatureFlagsManager";
import type { FeatureFlag } from "@/lib/platform/types";
import { requirePlatformPage } from "@/lib/platform/page-guard";

export default async function PlatformFeaturesPage() {
  if (!(await requirePlatformPage())) return null;
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("platform_feature_flags")
    .select("id, feature_key, label, description, studio_id, enabled, studios(name)")
    .order("feature_key");

  const flags: FeatureFlag[] = (rows ?? []).map((r) => {
    const studio = r.studios as unknown as { name: string } | null;
    return {
      id: r.id,
      featureKey: r.feature_key,
      label: r.label,
      description: r.description,
      studioId: r.studio_id,
      studioName: studio?.name ?? null,
      enabled: r.enabled,
    };
  });

  return <FeatureFlagsManager flags={flags} />;
}
