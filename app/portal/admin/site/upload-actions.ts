"use server";

// ============================================================================
//  Admin · Site builder image uploads
//
//  Mints a short-lived signed upload URL (service-role) for the studio's image
//  bucket, then the browser uploads the bytes directly to Supabase Storage —
//  the file never passes through the Next.js server. Returns the final public
//  URL the editor stores on the block prop.
// ============================================================================

import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminStudio } from "@/lib/portal/access";

const BUCKET = "site-images";
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // 50 MB

const VIDEO_ALLOWED: Record<string, string> = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

export type UploadTicket = {
  path: string;
  token: string;
  publicUrl: string;
};

export type UploadResult =
  | { ok: true; data: UploadTicket }
  | { ok: false; error: string };

/** Verify the caller is a studio admin and return their studio id. */
async function requireAdminStudio(): Promise<
  { studioId: string } | { error: string }
> {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId) return { error: ctx.error ?? "Admin only." };
  return { studioId: ctx.studioId };
}

/**
 * Create a signed upload URL for a new site image.
 * @param contentType MIME type of the file (must be an allowed image type).
 * @param sizeBytes   reported file size, rejected early if too large.
 */
export async function createSiteImageUploadUrl(
  contentType: string,
  sizeBytes: number,
): Promise<UploadResult> {
  const guard = await requireAdminStudio();
  if ("error" in guard) return { ok: false, error: guard.error };

  const ext = ALLOWED[contentType];
  if (!ext) return { ok: false, error: "Unsupported file type. Use JPG, PNG, WebP, GIF or AVIF." };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, error: "Invalid file." };
  if (sizeBytes > MAX_BYTES) return { ok: false, error: "Image is too large (max 8 MB)." };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Image uploads are not configured (missing service-role key)." };
  }

  const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${guard.studioId}/${rand}.${ext}`;

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start upload." };

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

  return {
    ok: true,
    data: { path: data.path, token: data.token, publicUrl: pub.publicUrl },
  };
}

/** Create a signed upload URL for a site video (MP4, WebM, MOV). */
export async function createSiteVideoUploadUrl(
  contentType: string,
  sizeBytes: number,
): Promise<UploadResult> {
  const guard = await requireAdminStudio();
  if ("error" in guard) return { ok: false, error: guard.error };

  const ext = VIDEO_ALLOWED[contentType];
  if (!ext) return { ok: false, error: "Unsupported video type. Use MP4, WebM, or MOV." };
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) return { ok: false, error: "Invalid file." };
  if (sizeBytes > MAX_VIDEO_BYTES) return { ok: false, error: "Video is too large (max 50 MB)." };

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false, error: "Video uploads are not configured (missing service-role key)." };
  }

  const rand = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${guard.studioId}/videos/${rand}.${ext}`;

  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error || !data) return { ok: false, error: error?.message ?? "Could not start upload." };

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);

  return {
    ok: true,
    data: { path: data.path, token: data.token, publicUrl: pub.publicUrl },
  };
}

/**
 * Resolve the in-bucket object path from a public URL, but only if it belongs
 * to the given studio's namespace. Returns null for anything else (external
 * URLs, other studios' files) so we never delete something we shouldn't.
 */
function bucketPathForStudio(publicUrl: string, studioId: string): string | null {
  try {
    const { pathname } = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    const objectPath = decodeURIComponent(pathname.slice(idx + marker.length));
    // Must live under this studio's folder: "<studioId>/<file>".
    if (!objectPath.startsWith(`${studioId}/`)) return null;
    return objectPath;
  } catch {
    return null;
  }
}

/**
 * Delete a site image that the studio owns (orphan cleanup when a block's image
 * is replaced or removed). Best-effort: silently ignores non-bucket/foreign URLs
 * and reports a soft error otherwise. Never throws to the caller.
 */
export async function deleteSiteImage(publicUrl: string): Promise<{ ok: boolean }> {
  if (!publicUrl) return { ok: true };

  const guard = await requireAdminStudio();
  if ("error" in guard) return { ok: false };

  const objectPath = bucketPathForStudio(publicUrl, guard.studioId);
  if (!objectPath) return { ok: true }; // external or foreign URL — nothing to do.

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { ok: false };
  }

  const { error } = await admin.storage.from(BUCKET).remove([objectPath]);
  return { ok: !error };
}
