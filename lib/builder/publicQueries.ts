// ============================================================================
//  lib/builder/publicQueries.ts — anon-safe read for rendering a published
//  Studio (v2) document on the live public site.
//
//  Uses the cookieless public client (mirrors lib/site/queries.ts's pattern).
//  RLS on site_builder_documents (migration 0057, "sbd_public_read") only
//  exposes a document once its linked site_pages row is status='published',
//  so no extra status check is needed here — an empty result just means
//  "not published" or "no v2 document for this page."
// ============================================================================

import { createPublicClient } from "@/lib/supabase/public";
import { getSiteClasses, getSiteProducts, type SiteClass, type SiteProduct } from "@/lib/site/queries";
import { normalizeDocument, scanBuilderDataNeeds } from "./document";
import type { BuilderDocument } from "./schema";

export async function getPublishedBuilderDocument(pageId: string): Promise<BuilderDocument | null> {
  const supabase = createPublicClient();
  try {
    const { data } = await supabase
      .from("site_builder_documents")
      .select("document")
      .eq("page_id", pageId)
      .maybeSingle();
    return data?.document ? normalizeDocument(data.document) : null;
  } catch {
    // Table not provisioned in this environment — fall back to v1 rendering.
    return null;
  }
}

export interface PublicBuilderData {
  products: SiteProduct[];
  classes: SiteClass[];
}

/**
 * Full render input for a published v2 page: the document plus whatever live
 * platform data its productLoop/booking blocks need (real products/classes,
 * same tables + RLS the v1 shopGrid/classGrid blocks already read from).
 * Returns null when the page has no v2 document — callers fall back to v1.
 */
export async function getPublishedBuilderRender(
  studioId: string,
  pageId: string,
): Promise<{ doc: BuilderDocument; data: PublicBuilderData } | null> {
  const doc = await getPublishedBuilderDocument(pageId);
  if (!doc) return null;

  const needs = scanBuilderDataNeeds(doc);
  const [products, classes] = await Promise.all([
    needs.productLimit > 0 ? getSiteProducts(studioId, needs.productLimit) : Promise.resolve([]),
    needs.classLimit > 0 ? getSiteClasses(studioId, needs.classLimit) : Promise.resolve([]),
  ]);
  return { doc, data: { products, classes } };
}
