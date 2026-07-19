"use server";

// ============================================================================
//  Admin · Site Builder v2 (Studio) server actions — isolated from v1.
//  Reads/writes ONLY the site_builder_documents table + creates the linking
//  site_pages row. Never touches site_pages.blocks.
// ============================================================================

import { revalidatePath, revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeDocument } from "@/lib/builder/document";
import { STARTER_TEMPLATE_MAP } from "@/lib/builder/templates";
import type { BuilderDocument } from "@/lib/builder/schema";
import { siteCacheTag } from "@/lib/site/cached-queries";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";

export type StudioResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

const RESERVED = new Set(["", "portal", "login", "logout", "enrol", "enroll", "onboarding", "programmes", "api", "admin", "auth", "site", "home"]);

function slugify(input: string): string {
  return input.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function getAdminStudio() {
  const ctx = await getAdminStudioAccess();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
  };
}

/** Create a draft site_pages row + its builder document from a starter template. */
export async function createStudioPage(templateId: string, title?: string): Promise<StudioResult<{ pageId: string }>> {
  const template = STARTER_TEMPLATE_MAP[templateId];
  if (!template) return { ok: false, error: "Unknown template." };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const pageTitle = title?.trim() || template.name;
  // v2 pages are non-home, hidden-from-nav drafts so they can't disturb the live site.
  let slug = slugify(`studio-${pageTitle}`);
  if (RESERVED.has(slug) || !slug) slug = `studio-${Date.now().toString(36)}`;

  const { data: page, error: pErr } = await supabase
    .from("site_pages")
    .insert({ studio_id: studioId, title: pageTitle, slug, is_home: false, show_in_nav: false, status: "draft", blocks: [] })
    .select("id")
    .single();
  if (pErr) {
    if (pErr.code === "23505") return { ok: false, error: "A page with that URL already exists." };
    return { ok: false, error: pErr.message };
  }

  const pageId = page.id as string;
  const doc = template.build();
  doc.meta = { ...doc.meta, title: pageTitle, slug };

  const { error: dErr } = await supabase
    .from("site_builder_documents")
    .insert({ page_id: pageId, studio_id: studioId, document: doc, template_id: templateId });
  if (dErr) {
    // Roll back the orphan page so we don't leave junk behind.
    await supabase.from("site_pages").delete().eq("id", pageId);
    return { ok: false, error: missingTableHint(dErr.message) };
  }

  revalidatePath("/portal/admin/site/studio");
  return { ok: true, data: { pageId } };
}

/** Persist a document. Validated/normalized before write. */
export async function saveBuilderDocument(pageId: string, rawDoc: BuilderDocument): Promise<StudioResult> {
  if (!pageId) return { ok: false, error: "Missing page id." };
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  // Without this, an admin could save a document for a *different* studio's
  // page_id (e.g. a guessed/reused id) and have the public renderer serve it
  // there — verify the target page actually belongs to this studio first.
  const { data: page, error: pErr } = await supabase
    .from("site_pages")
    .select("id")
    .eq("id", pageId)
    .eq("studio_id", studioId)
    .maybeSingle();
  if (pErr) return { ok: false, error: pErr.message };
  if (!page) return { ok: false, error: "Page not found." };

  const doc = normalizeDocument(rawDoc);
  if (!doc) return { ok: false, error: "Document failed validation." };

  const { error: dErr } = await supabase
    .from("site_builder_documents")
    .upsert({ page_id: pageId, studio_id: studioId, document: doc, updated_at: new Date().toISOString() }, { onConflict: "page_id" });
  if (dErr) return { ok: false, error: missingTableHint(dErr.message) };

  revalidatePath(`/portal/admin/site/studio/${pageId}`);
  return { ok: true, data: null };
}

/**
 * Publish a Studio page to the live public site. Flips the linked site_pages
 * row to status='published' (RLS then exposes site_builder_documents to
 * anon), optionally promotes it to the studio's homepage (demoting any
 * current one — at most one is allowed) and/or adds it to the public nav.
 */
export async function publishStudioPage(
  pageId: string,
  opts: { asHome: boolean; showInNav: boolean },
): Promise<StudioResult<{ slug: string }>> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: page, error: pErr } = await supabase
    .from("site_pages")
    .select("slug")
    .eq("id", pageId)
    .eq("studio_id", studioId)
    .single();
  if (pErr || !page) return { ok: false, error: "Page not found." };

  if (opts.asHome) {
    // Only one home page per studio (site_pages_one_home unique index) —
    // demote any current one before promoting this page.
    await supabase
      .from("site_pages")
      .update({ is_home: false })
      .eq("studio_id", studioId)
      .eq("is_home", true)
      .neq("id", pageId);
  }

  const { error: uErr } = await supabase
    .from("site_pages")
    .update({
      status: "published",
      is_home: opts.asHome,
      show_in_nav: opts.showInNav,
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId)
    .eq("studio_id", studioId);
  if (uErr) return { ok: false, error: uErr.message };

  revalidatePath(`/portal/admin/site/studio/${pageId}`);
  revalidatePath("/", "layout");
  revalidateTag(siteCacheTag(studioId));
  return { ok: true, data: { slug: page.slug as string } };
}

/** Unpublish a Studio page — takes it off the live site and out of nav/home. */
export async function unpublishStudioPage(pageId: string): Promise<StudioResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: uErr } = await supabase
    .from("site_pages")
    .update({ status: "draft", is_home: false, show_in_nav: false, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("studio_id", studioId);
  if (uErr) return { ok: false, error: uErr.message };

  revalidatePath(`/portal/admin/site/studio/${pageId}`);
  revalidatePath("/", "layout");
  revalidateTag(siteCacheTag(studioId));
  return { ok: true, data: null };
}

/** Rename a Studio page's title and/or URL slug (keeps site_pages in sync with the doc). */
export async function renameStudioPage(
  pageId: string,
  patch: { title?: string; slug?: string },
): Promise<StudioResult<{ title: string; slug: string }>> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const update: Record<string, string> = {};
  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (!title) return { ok: false, error: "Title can't be empty." };
    update.title = title;
  }
  if (patch.slug !== undefined) {
    const slug = slugify(patch.slug);
    if (!slug) return { ok: false, error: "URL can't be empty." };
    if (RESERVED.has(slug)) return { ok: false, error: "That URL is reserved." };
    update.slug = slug;
  }
  if (Object.keys(update).length === 0) return { ok: false, error: "Nothing to update." };

  const { data, error: uErr } = await supabase
    .from("site_pages")
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("studio_id", studioId)
    .select("title, slug")
    .single();
  if (uErr) {
    if (uErr.code === "23505") return { ok: false, error: "A page with that URL already exists." };
    return { ok: false, error: uErr.message };
  }

  revalidatePath(`/portal/admin/site/studio/${pageId}`);
  revalidatePath("/", "layout");
  revalidateTag(siteCacheTag(studioId));
  return { ok: true, data: { title: data.title as string, slug: data.slug as string } };
}

export async function deleteStudioPage(pageId: string): Promise<StudioResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };
  // Cascade deletes the builder document via FK.
  const { error: dErr } = await supabase.from("site_pages").delete().eq("id", pageId).eq("studio_id", studioId);
  if (dErr) return { ok: false, error: dErr.message };
  revalidatePath("/portal/admin/site/studio");
  return { ok: true, data: null };
}

function missingTableHint(msg: string): string {
  if (/relation .*site_builder_documents.* does not exist/i.test(msg) || /could not find the table/i.test(msg)) {
    return "Studio storage not provisioned yet — run migration 0057_site_builder_v2.sql (npm run db:push).";
  }
  return msg;
}
