"use server";

// ============================================================================
//  Admin · Site builder server actions
//  Manage a studio's public website pages: create / edit / reorder / publish /
//  delete, and save the block layout of a page.
// ============================================================================

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { siteCacheTag } from "@/lib/site/cached-queries";
import { createClient } from "@/lib/supabase/server";
import { normalizeBlocks } from "@/lib/site/blocks";
import { normalizePageBackground } from "@/lib/site/background";
import { TEMPLATE_MAP, buildTemplateBlocks } from "@/lib/site/templates";
import { derivePalette } from "@/lib/branding";
import {
  SETUP_HOME_IDS,
  buildSetupPages,
  validateSetupInput,
} from "@/lib/site/setup";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Top-level paths that belong to the app, not studio pages.
const RESERVED_SLUGS = new Set([
  "", "portal", "login", "logout", "enrol", "enroll", "onboarding",
  "programmes", "api", "admin", "auth", "site",
]);

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

async function getAdminStudio() {
  const ctx = await getAdminStudioAccess();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
  };
}

function refresh(studioId: string) {
  revalidatePath("/portal/admin/site");
  revalidatePath("/", "layout");
  revalidateTag(siteCacheTag(studioId));
  revalidateTag(`branding-${studioId}`);
}

// ─── CREATE ───────────────────────────────────────────────────────────────────

const CreateSchema = z.object({
  title: z.string().min(1, "Title is required").max(100),
  slug: z.string().max(100).optional(),
  isHome: z.coerce.boolean().optional(),
});

export async function createPage(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const isHome = !!parsed.data.isHome;
  const slug = isHome ? "home" : slugify(parsed.data.slug || parsed.data.title);

  if (!isHome && (RESERVED_SLUGS.has(slug) || !slug)) {
    return { ok: false, error: `"${slug}" is a reserved or invalid URL.` };
  }

  // If creating a homepage, demote any existing home first (partial unique idx).
  if (isHome) {
    await supabase.from("site_pages").update({ is_home: false }).eq("studio_id", studioId).eq("is_home", true);
  }

  const { data, error: dbErr } = await supabase
    .from("site_pages")
    .insert({
      studio_id: studioId,
      title: parsed.data.title,
      slug,
      is_home: isHome,
      blocks: [],
      status: "draft",
      show_in_nav: !isHome,
    })
    .select("id")
    .single();

  if (dbErr) {
    if (dbErr.code === "23505") return { ok: false, error: "A page with that URL already exists." };
    return { ok: false, error: dbErr.message };
  }

  refresh(studioId);
  return { ok: true, data: { id: data.id as string } };
}

// ─── CREATE FROM TEMPLATE ───────────────────────────────────────────────────

export async function createPageFromTemplate(
  templateId: string,
): Promise<ActionResult<{ id: string }>> {
  const template = TEMPLATE_MAP[templateId];
  if (!template) return { ok: false, error: "Unknown template." };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const isHome = !!template.isHome;

  // One home per studio — refuse rather than clobber an existing homepage.
  if (isHome) {
    const { data: existingHome } = await supabase
      .from("site_pages")
      .select("id")
      .eq("studio_id", studioId)
      .eq("is_home", true)
      .maybeSingle();
    if (existingHome) {
      return { ok: false, error: "You already have a homepage. Edit it instead." };
    }
  }

  const slug = isHome ? "home" : slugify(template.slug || template.title);
  if (!isHome && (RESERVED_SLUGS.has(slug) || !slug)) {
    return { ok: false, error: `"${slug}" is a reserved or invalid URL.` };
  }

  const blocks = buildTemplateBlocks(template.blocks);

  const { data, error: dbErr } = await supabase
    .from("site_pages")
    .insert({
      studio_id: studioId,
      title: template.title,
      slug,
      is_home: isHome,
      show_in_nav: template.showInNav ?? false,
      nav_label: template.navLabel || null,
      seo_title: template.seoTitle || null,
      seo_description: template.seoDescription || null,
      blocks,
      status: "draft",
    })
    .select("id")
    .single();

  if (dbErr) {
    if (dbErr.code === "23505") {
      return {
        ok: false,
        error: isHome ? "A homepage already exists." : "A page with that URL already exists.",
      };
    }
    return { ok: false, error: dbErr.message };
  }

  refresh(studioId);
  return { ok: true, data: { id: data.id as string } };
}

// Backwards-compatible alias: seeds the "Classic" homepage theme.
export async function createStarterHomepage(): Promise<ActionResult<{ id: string }>> {
  return createPageFromTemplate("home-classic");
}

// ─── WEBSITE SETUP (wizard) ───────────────────────────────────────────────────

const SetupSchema = z.object({
  homeTemplateId: z.string().refine((id) => SETUP_HOME_IDS.includes(id), "Pick a homepage style."),
  pageTemplateIds: z.array(z.string()).default([]),
  tagline: z.string().max(120).optional().nullable(),
  fontDisplay: z.string().max(60),
  fontBody: z.string().max(60),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  base: z.enum(["dark", "light"]).optional(),
  logoUrl: z.string().url().nullable().optional(),
  publishHome: z.coerce.boolean().optional(),
});

export async function setupStudioWebsite(input: unknown): Promise<ActionResult<{ homePageId: string; pageIds: string[] }>> {
  const parsed = SetupSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: studio } = await supabase.from("studios").select("name").eq("id", studioId).single();
  if (!studio?.name) return { ok: false, error: "Could not load studio." };

  const { data: existingPages } = await supabase
    .from("site_pages")
    .select("id")
    .eq("studio_id", studioId)
    .limit(1);
  if (existingPages?.length) {
    return { ok: false, error: "Your website already has pages. Use the page manager to add more." };
  }

  const setupInput = {
    homeTemplateId: parsed.data.homeTemplateId,
    pageTemplateIds: parsed.data.pageTemplateIds,
    studioName: studio.name as string,
    tagline: parsed.data.tagline,
    fontDisplay: parsed.data.fontDisplay,
    fontBody: parsed.data.fontBody,
    brandColor: parsed.data.brandColor,
    base: parsed.data.base,
    logoUrl: parsed.data.logoUrl,
  };

  const validationError = validateSetupInput(setupInput);
  if (validationError) return { ok: false, error: validationError };

  let drafts;
  try {
    drafts = buildSetupPages(setupInput);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not build pages." };
  }

  const palette = derivePalette(parsed.data.brandColor ?? "#6B66C9");

  const { error: brandErr } = await supabase.from("studio_branding").upsert({
    studio_id: studioId,
    tagline: parsed.data.tagline ?? null,
    logo_url: parsed.data.logoUrl ?? null,
    brand_color: parsed.data.brandColor ?? "#6B66C9",
    base: parsed.data.base ?? "light",
    font_display: parsed.data.fontDisplay,
    font_body: parsed.data.fontBody,
    brand_hot: palette.brandHot,
    brand_deep: palette.brandDeep,
    updated_at: new Date().toISOString(),
  });
  if (brandErr) return { ok: false, error: brandErr.message };

  const pageIds: string[] = [];
  let homePageId = "";

  for (const draft of drafts) {
    const status = draft.isHome && parsed.data.publishHome !== false ? "published" : "draft";
    const { data, error: dbErr } = await supabase
      .from("site_pages")
      .insert({
        studio_id: studioId,
        title: draft.title,
        slug: draft.slug,
        is_home: draft.isHome,
        show_in_nav: draft.showInNav,
        nav_label: draft.navLabel,
        seo_title: draft.seoTitle,
        seo_description: draft.seoDescription,
        blocks: draft.blocks,
        status,
      })
      .select("id")
      .single();

    if (dbErr) return { ok: false, error: dbErr.message };
    const id = data.id as string;
    pageIds.push(id);
    if (draft.isHome) homePageId = id;
  }

  refresh(studioId);
  return { ok: true, data: { homePageId, pageIds } };
}

// ─── UPDATE META ────────────────────────────────────────────────────────────────

const MetaSchema = z.object({
  pageId: z.string().uuid(),
  title: z.string().min(1).max(100),
  slug: z.string().max(100),
  navLabel: z.string().max(60).optional().or(z.literal("")),
  showInNav: z.coerce.boolean(),
  navOrder: z.coerce.number().int().min(0).max(999),
  seoTitle: z.string().max(160).optional().or(z.literal("")),
  seoDescription: z.string().max(320).optional().or(z.literal("")),
});

export async function updatePageMeta(input: unknown): Promise<ActionResult> {
  const parsed = MetaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  // Resolve whether this is the home page (home keeps slug 'home', not editable).
  const { data: existing } = await supabase
    .from("site_pages")
    .select("is_home")
    .eq("id", parsed.data.pageId)
    .eq("studio_id", studioId)
    .single();
  if (!existing) return { ok: false, error: "Page not found." };

  const slug = existing.is_home ? "home" : slugify(parsed.data.slug);
  if (!existing.is_home && (RESERVED_SLUGS.has(slug) || !slug)) {
    return { ok: false, error: `"${slug}" is a reserved or invalid URL.` };
  }

  const { error: dbErr } = await supabase
    .from("site_pages")
    .update({
      title: parsed.data.title,
      slug,
      nav_label: parsed.data.navLabel || null,
      show_in_nav: parsed.data.showInNav,
      nav_order: parsed.data.navOrder,
      seo_title: parsed.data.seoTitle || null,
      seo_description: parsed.data.seoDescription || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.pageId)
    .eq("studio_id", studioId);

  if (dbErr) {
    if (dbErr.code === "23505") return { ok: false, error: "A page with that URL already exists." };
    return { ok: false, error: dbErr.message };
  }

  refresh(studioId);
  return { ok: true, data: null };
}

// ─── SAVE BLOCKS ──────────────────────────────────────────────────────────────

export async function savePageBlocks(
  pageId: string,
  rawBlocks: unknown,
  rawBackground?: unknown,
): Promise<ActionResult> {
  if (!pageId) return { ok: false, error: "Missing page id." };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const blocks = normalizeBlocks(rawBlocks);
  const background = rawBackground !== undefined ? normalizePageBackground(rawBackground) : undefined;

  const { error: dbErr } = await supabase
    .from("site_pages")
    .update({
      blocks,
      ...(background !== undefined ? { background } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", pageId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };

  refresh(studioId);
  return { ok: true, data: null };
}

// ─── PUBLISH / UNPUBLISH ────────────────────────────────────────────────────────

async function setStatus(pageId: string, status: "draft" | "published"): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbErr } = await supabase
    .from("site_pages")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  refresh(studioId);
  return { ok: true, data: null };
}

export async function publishPage(pageId: string): Promise<ActionResult> {
  return setStatus(pageId, "published");
}

export async function unpublishPage(pageId: string): Promise<ActionResult> {
  return setStatus(pageId, "draft");
}

// ─── SET HOME ───────────────────────────────────────────────────────────────────

export async function setHomePage(pageId: string): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  // Demote current home, then promote this one (two steps to satisfy the
  // partial unique index on is_home).
  await supabase.from("site_pages").update({ is_home: false }).eq("studio_id", studioId).eq("is_home", true);

  const { error: dbErr } = await supabase
    .from("site_pages")
    .update({ is_home: true, updated_at: new Date().toISOString() })
    .eq("id", pageId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  refresh(studioId);
  return { ok: true, data: null };
}

// ─── DELETE ───────────────────────────────────────────────────────────────────

export async function deletePage(pageId: string): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: dbErr } = await supabase
    .from("site_pages")
    .delete()
    .eq("id", pageId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  refresh(studioId);
  return { ok: true, data: null };
}
