// ============================================================================
//  lib/advertising/media.ts — creative uploads for social posting.
//
//  The composer used to offer two bare text inputs: "image URL" and "video
//  URL". A studio owner has a photo on their phone, not a hosted URL, so in
//  practice the image field got a link pasted from somewhere unreliable and
//  the video field stayed empty — which made TikTok, listed as a LIVE
//  integration, unreachable for everyone, because publishToTiktok hard-rejects
//  a campaign with no videoUrl.
//
//  Why a public bucket, and why a separate one from `site-images`:
//
//   • PUBLIC is not a choice. All three platforms FETCH the media themselves —
//     Facebook `/photos?url=`, Instagram `/media?image_url=`, TikTok
//     `source: PULL_FROM_URL`. A signed or private URL cannot be read by
//     Meta's or TikTok's fetchers, so the object has to be publicly readable.
//
//   • SEPARATE because the two have different shapes and lifecycles: site
//     images are permanent and capped at 8 MB, creative is transient and
//     includes video an order of magnitude larger. Sharing a bucket would also
//     entangle this with saveWebsiteConfig's orphan cleanup for no benefit.
//
//  Client + server safe — no IO here, just the contract both sides share.
// ============================================================================

export const AD_MEDIA_BUCKET = "social-media";

export const MAX_AD_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
export const MAX_AD_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB — a 60s vertical clip fits comfortably

/** contentType → extension. Also the upload allow-list. */
export const ALLOWED_AD_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Video formats every target accepts. Deliberately narrow: TikTok and Meta
 * both take MP4/MOV, and anything else would upload happily and then fail at
 * publish time with a platform error nobody can act on.
 */
export const ALLOWED_AD_VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export const AD_IMAGE_ACCEPT = Object.keys(ALLOWED_AD_IMAGE_TYPES).join(",");
export const AD_VIDEO_ACCEPT = Object.keys(ALLOWED_AD_VIDEO_TYPES).join(",");

export type AdMediaKind = "image" | "video";

export function allowedTypesFor(kind: AdMediaKind): Record<string, string> {
  return kind === "video" ? ALLOWED_AD_VIDEO_TYPES : ALLOWED_AD_IMAGE_TYPES;
}

export function maxBytesFor(kind: AdMediaKind): number {
  return kind === "video" ? MAX_AD_VIDEO_BYTES : MAX_AD_IMAGE_BYTES;
}

/** Human-readable cap, for the error the uploader shows. */
export function maxLabelFor(kind: AdMediaKind): string {
  return kind === "video" ? "100 MB" : "8 MB";
}

/**
 * Validate an upload request. Shared by the server action (authoritative) and
 * the client (fast feedback), so the two can't disagree about what's allowed.
 *
 * Returns the file extension to store under, or an error message.
 */
export function validateAdMedia(
  kind: AdMediaKind,
  contentType: string,
  sizeBytes: number,
): { ok: true; ext: string } | { ok: false; error: string } {
  const ext = allowedTypesFor(kind)[contentType];
  if (!ext) {
    return {
      ok: false,
      error:
        kind === "video"
          ? "Unsupported video format. Use MP4, MOV or WebM."
          : "Unsupported image format. Use JPG, PNG or WebP.",
    };
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return { ok: false, error: "That file looks empty." };
  }
  if (sizeBytes > maxBytesFor(kind)) {
    return { ok: false, error: `That ${kind} is over ${maxLabelFor(kind)}.` };
  }
  return { ok: true, ext };
}

/**
 * Public URL → object path, but only when the object is in this studio's
 * folder. Returns null for a hand-typed URL or another tenant's path, so the
 * delete path can never be pointed at something we don't own.
 */
export function adMediaObjectPath(publicUrl: string, studioId: string): string | null {
  try {
    const { pathname } = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${AD_MEDIA_BUCKET}/`;
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    const objectPath = decodeURIComponent(pathname.slice(idx + marker.length));
    return objectPath.startsWith(`${studioId}/`) ? objectPath : null;
  } catch {
    return null;
  }
}
