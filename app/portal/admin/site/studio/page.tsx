// ============================================================================
//  /portal/admin/site/studio — Site Builder v2 (Studio) entry / template picker.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { PublicSiteUrlBanner } from "@/components/admin/site/PublicSiteUrlBanner";
import { StudioHome, type StudioPageRow } from "@/components/builder/StudioHome";

export const metadata = { title: "Website" };

export default async function StudioIndexPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  let studioId: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from("profiles").select("studio_id, role").eq("id", user.id).single();
    if (profile?.role === "admin") studioId = (profile.studio_id as string) ?? null;
  }

  let pages: StudioPageRow[] = [];
  let provisioned = true;
  if (studioId) {
    // List EVERY page the studio has — including ones only ever built in the
    // old block editor (no v2 document yet). Opening one auto-converts its
    // existing content (see lib/builder/convertV1.ts) so nothing is orphaned
    // by the switch to Studio as the sole editor.
    const { data: sitePages, error: spErr } = await supabase
      .from("site_pages")
      .select("id, title, slug, status, is_home, updated_at")
      .eq("studio_id", studioId)
      .order("is_home", { ascending: false })
      .order("updated_at", { ascending: false });

    if (spErr) {
      provisioned = false;
    } else {
      let docByPageId = new Map<string, { template_id: string | null; updated_at: string | null }>();
      try {
        const { data: docs, error: docErr } = await supabase
          .from("site_builder_documents")
          .select("page_id, template_id, updated_at")
          .eq("studio_id", studioId);
        if (docErr) provisioned = false;
        else docByPageId = new Map((docs ?? []).map((d) => [d.page_id as string, { template_id: d.template_id as string | null, updated_at: d.updated_at as string | null }]));
      } catch {
        provisioned = false;
      }

      pages = (sitePages ?? []).map((p) => {
        const doc = docByPageId.get(p.id as string);
        return {
          pageId: p.id as string,
          title: p.title as string,
          slug: p.slug as string,
          status: (p.status as "draft" | "published") ?? "draft",
          isHome: Boolean(p.is_home),
          templateId: doc?.template_id ?? null,
          hasV2Document: !!doc,
          updatedAt: (doc?.updated_at as string | null) ?? (p.updated_at as string | null),
        };
      });
    }
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PublicSiteUrlBanner />
      <div className="mt-6">
        <StudioHome pages={pages} provisioned={provisioned} />
      </div>
    </div>
  );
}
