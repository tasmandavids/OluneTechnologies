// ============================================================================
//  /portal/admin/site — Website builder: template gallery + customizer.
//  One website_configs row per studio; replaces the old v1 block editor and
//  v2 Studio canvas builder entirely.
// ============================================================================

import { getAdminStudio } from "@/lib/portal/access";
import { getWebsiteConfig } from "@/lib/website/queries";
import { WebsiteBuilderApp } from "@/components/website/admin/WebsiteBuilderApp";

export const dynamic = "force-dynamic";

export default async function WebsiteBuilderPage() {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) throw new Error(error ?? "Not signed in");

  const [config, studioRes] = await Promise.all([
    getWebsiteConfig(supabase, studioId),
    supabase.from("studios").select("name, slug").eq("id", studioId).single(),
  ]);

  return (
    <WebsiteBuilderApp
      initialConfig={config}
      studioName={studioRes.data?.name ?? "Your studio"}
      studioSlug={studioRes.data?.slug ?? ""}
    />
  );
}
