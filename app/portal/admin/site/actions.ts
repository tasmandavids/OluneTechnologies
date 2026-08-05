"use server";

// ============================================================================
//  Admin · Website builder server actions.
//  One website_configs row per studio — no page/document concept. Every
//  action follows the getAdminStudio() + discriminated-union convention used
//  across the admin portal.
// ============================================================================

import { revalidatePath, revalidateTag } from "next/cache";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";
import { createAdminClient } from "@/lib/supabase/admin";
import { websiteCacheTag } from "@/lib/website/cache";
import { getTemplate } from "@/lib/website/templates";
import { defaultSections } from "@/lib/website/sections";
import type { WebsiteSection } from "@/lib/website/types";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

async function getAdminStudio() {
  const ctx = await getAdminStudioAccess();
  return { error: ctx.error, supabase: ctx.supabase, studioId: ctx.studioId };
}

function missingTableHint(msg: string): string {
  if (/relation .*website_configs.* does not exist/i.test(msg) || /could not find the table/i.test(msg)) {
    return "Website storage not provisioned yet — run migration 0099_website_configs.sql (npm run db:push).";
  }
  return msg;
}

function revalidateSite(studioId: string) {
  revalidatePath("/portal/admin/site");
  revalidatePath("/", "layout");
  revalidateTag(websiteCacheTag(studioId));
}

export type WebsiteConfigPatch = Partial<{
  accentColor: string;
  paperColor: string;
  inkColor: string;
  fontDisplay: string;
  fontBody: string;
  density: number;
  studioNameOverride: string | null;
  headline: string;
  tagline: string;
  eyebrow: string;
  sections: WebsiteSection[];
}>;

/** Persist edits to the current draft without publishing. */
export async function saveWebsiteConfig(patch: WebsiteConfigPatch): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.accentColor !== undefined) row.accent_color = patch.accentColor;
  if (patch.paperColor !== undefined) row.paper_color = patch.paperColor;
  if (patch.inkColor !== undefined) row.ink_color = patch.inkColor;
  if (patch.fontDisplay !== undefined) row.font_display = patch.fontDisplay;
  if (patch.fontBody !== undefined) row.font_body = patch.fontBody;
  if (patch.density !== undefined) row.density = patch.density;
  if (patch.studioNameOverride !== undefined) row.studio_name_override = patch.studioNameOverride;
  if (patch.headline !== undefined) row.headline = patch.headline;
  if (patch.tagline !== undefined) row.tagline = patch.tagline;
  if (patch.eyebrow !== undefined) row.eyebrow = patch.eyebrow;
  if (patch.sections !== undefined) row.sections = patch.sections;

  const { error: uErr } = await supabase
    .from("website_configs")
    .update(row)
    .eq("studio_id", studioId);
  if (uErr) return { ok: false, error: missingTableHint(uErr.message) };

  revalidatePath("/portal/admin/site");
  return { ok: true, data: null };
}

/** First-time pick, or an explicit "change template": (re)creates the row
 *  from a template's defaults. Colours/fonts reset; when called from an
 *  existing config, sections/copy/logo carry over (mockup's confirm-dialog
 *  promise — "Your words, photos and section order carry over"). */
export async function switchTemplate(templateId: string): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const template = getTemplate(templateId);

  const { data: existing } = await supabase
    .from("website_configs")
    .select("sections, logo_url, studio_name_override")
    .eq("studio_id", studioId)
    .maybeSingle();

  const { error: uErr } = await supabase.from("website_configs").upsert(
    {
      studio_id: studioId,
      template_id: template.id,
      kind: template.kind,
      accent_color: template.accent,
      paper_color: template.paper,
      ink_color: template.ink,
      font_display: template.fontDisplay,
      font_body: template.fontBody,
      density: 56,
      // Headline/tagline/eyebrow are template voice, not studio-authored
      // copy yet (no editor field for them) — reset alongside colours/fonts.
      headline: template.headline,
      tagline: template.tagline,
      eyebrow: template.eyebrow,
      sections: existing?.sections ?? defaultSections(),
      logo_url: existing?.logo_url ?? null,
      studio_name_override: existing?.studio_name_override ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "studio_id" },
  );
  if (uErr) return { ok: false, error: missingTableHint(uErr.message) };

  revalidatePath("/portal/admin/site");
  return { ok: true, data: null };
}

export async function publishWebsite(): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: uErr } = await supabase
    .from("website_configs")
    .update({ status: "published", published_at: new Date().toISOString() })
    .eq("studio_id", studioId);
  if (uErr) return { ok: false, error: missingTableHint(uErr.message) };

  revalidateSite(studioId);
  return { ok: true, data: null };
}

export async function unpublishWebsite(): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: uErr } = await supabase
    .from("website_configs")
    .update({ status: "draft" })
    .eq("studio_id", studioId);
  if (uErr) return { ok: false, error: missingTableHint(uErr.message) };

  revalidateSite(studioId);
  return { ok: true, data: null };
}

// ─── Logo upload ─────────────────────────────────────────────────────────────
// Mirrors createSiteImageUploadUrl/deleteSiteImage from the old v1
// upload-actions.ts — same bucket, same signed-upload-URL pattern.

const BUCKET = "site-images";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export type UploadTicket = { path: string; token: string; publicUrl: string };
export type UploadResult = { ok: true; data: UploadTicket } | { ok: false; error: string };

export async function createLogoUploadUrl(contentType: string, sizeBytes: number): Promise<UploadResult> {
  const { error, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Admin only." };

  const ext = ALLOWED[contentType];
  if (!ext) return { ok: false, error: "Unsupported file type. Use JPG, PNG, WebP, GIF, AVIF or SVG." };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, error: "Invalid file." };
  if (sizeBytes > MAX_BYTES) return { ok: false, error: "Logo is too large (max 8 MB)." };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Uploads are not configured (missing service-role key)." };
  }

  const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${studioId}/logo-${rand}.${ext}`;

  const { data, error: signErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (signErr || !data) return { ok: false, error: signErr?.message ?? "Could not start upload." };

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { ok: true, data: { path: data.path, token: data.token, publicUrl: pub.publicUrl } };
}

/** Save the uploaded logo URL onto the config and clean up the previous one. */
export async function saveLogoUrl(publicUrl: string): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { data: existing } = await supabase
    .from("website_configs")
    .select("logo_url")
    .eq("studio_id", studioId)
    .maybeSingle();

  const { error: uErr } = await supabase
    .from("website_configs")
    .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
    .eq("studio_id", studioId);
  if (uErr) return { ok: false, error: missingTableHint(uErr.message) };

  const previous = existing?.logo_url as string | null;
  if (previous && previous !== publicUrl) {
    try {
      const { pathname } = new URL(previous);
      const marker = `/storage/v1/object/public/${BUCKET}/`;
      const idx = pathname.indexOf(marker);
      if (idx !== -1) {
        const objectPath = decodeURIComponent(pathname.slice(idx + marker.length));
        if (objectPath.startsWith(`${studioId}/`)) {
          const admin = createAdminClient();
          await admin.storage.from(BUCKET).remove([objectPath]);
        }
      }
    } catch {
      // best-effort cleanup only
    }
  }

  revalidatePath("/portal/admin/site");
  return { ok: true, data: null };
}
