// ============================================================================
//  /portal/admin/site/studio/[pageId] — the Site Builder v2 (Studio) editor.
// ============================================================================

import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createEmptyDocument, normalizeDocument } from "@/lib/builder/document";
import type { BuilderDocument } from "@/lib/builder/schema";
import { saveBuilderDocument } from "../actions";
import { BuilderStudio } from "@/components/builder/BuilderStudio";

export default async function StudioEditorPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabase = await createClient();

  const { data: page } = await supabase
    .from("site_pages")
    .select("id, title, slug, studio_id")
    .eq("id", pageId)
    .single();
  if (!page) notFound();

  let initialDocument: BuilderDocument | null = null;
  try {
    const { data: row } = await supabase
      .from("site_builder_documents")
      .select("document")
      .eq("page_id", pageId)
      .maybeSingle();
    if (row?.document) initialDocument = normalizeDocument(row.document);
  } catch {
    // Table not provisioned yet — fall through to an empty document.
  }

  if (!initialDocument) {
    initialDocument = createEmptyDocument({ title: page.title as string, slug: page.slug as string });
  }

  const save = saveBuilderDocument.bind(null, pageId);

  return (
    <BuilderStudio
      initialDocument={initialDocument}
      save={save}
      backHref="/portal/admin/site/studio"
    />
  );
}
