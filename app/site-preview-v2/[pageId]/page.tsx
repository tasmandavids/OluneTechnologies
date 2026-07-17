// ============================================================================
//  /site-preview-v2/[pageId] — read-only render of a Studio (v2) document.
//  Admin-gated via RLS (the admin can read their studio's draft documents);
//  published documents are also publicly readable. Live public-site rendering
//  is intentionally left untouched — this preview route is fully separate.
// ============================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeDocument, scanBuilderDataNeeds } from "@/lib/builder/document";
import { PublicDocument } from "@/components/builder/PublicDocument";
import { getSiteClasses, getSiteProducts } from "@/lib/site/queries";

export async function generateMetadata({ params }: { params: Promise<{ pageId: string }> }): Promise<Metadata> {
  const { pageId } = await params;
  const supabase = await createClient();
  try {
    const { data } = await supabase
      .from("site_builder_documents")
      .select("document")
      .eq("page_id", pageId)
      .maybeSingle();
    const doc = data?.document ? normalizeDocument(data.document) : null;
    if (!doc) return {};
    return {
      title: doc.meta.seoTitle || doc.meta.title || undefined,
      description: doc.meta.seoDescription || undefined,
    };
  } catch {
    return {};
  }
}

export default async function StudioPreviewPage({ params }: { params: Promise<{ pageId: string }> }) {
  const { pageId } = await params;
  const supabase = await createClient();

  let document = null;
  let studioId: string | null = null;
  try {
    const { data } = await supabase
      .from("site_builder_documents")
      .select("document, studio_id")
      .eq("page_id", pageId)
      .maybeSingle();
    if (data?.document) document = normalizeDocument(data.document);
    studioId = (data?.studio_id as string | undefined) ?? null;
  } catch {
    document = null;
  }

  if (!document) notFound();

  const needs = scanBuilderDataNeeds(document);
  const [products, classes] = studioId
    ? await Promise.all([
        needs.productLimit > 0 ? getSiteProducts(studioId, needs.productLimit) : Promise.resolve([]),
        needs.classLimit > 0 ? getSiteClasses(studioId, needs.classLimit) : Promise.resolve([]),
      ])
    : [[], []];

  return <PublicDocument doc={document} data={{ products, classes }} />;
}
