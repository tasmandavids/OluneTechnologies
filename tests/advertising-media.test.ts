import { describe, it, expect } from "vitest";
import {
  AD_MEDIA_BUCKET,
  adMediaObjectPath,
  maxBytesFor,
  validateAdMedia,
} from "@/lib/advertising/media";

// ============================================================================
//  Both the composer and the server action run validateAdMedia, so it is the
//  single definition of what may be uploaded. adMediaObjectPath is the guard
//  that stops a delete being aimed at another tenant's object.
// ============================================================================

const STUDIO = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const publicUrl = (path: string) =>
  `https://abc.supabase.co/storage/v1/object/public/${AD_MEDIA_BUCKET}/${path}`;

describe("validateAdMedia", () => {
  it("accepts the image formats every platform can fetch", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateAdMedia("image", type, 1024)).toMatchObject({ ok: true });
    }
  });

  it("accepts the video formats TikTok and Meta both take", () => {
    for (const type of ["video/mp4", "video/quicktime", "video/webm"]) {
      expect(validateAdMedia("video", type, 1024)).toMatchObject({ ok: true });
    }
  });

  it("rejects a video uploaded into the image slot and vice versa", () => {
    expect(validateAdMedia("image", "video/mp4", 1024).ok).toBe(false);
    expect(validateAdMedia("video", "image/png", 1024).ok).toBe(false);
  });

  // A format the platform can't decode uploads happily and then fails at
  // publish time with an error the studio owner can do nothing about.
  it("rejects formats no publisher accepts", () => {
    expect(validateAdMedia("image", "image/gif", 1024).ok).toBe(false);
    expect(validateAdMedia("image", "image/svg+xml", 1024).ok).toBe(false);
    expect(validateAdMedia("video", "video/x-msvideo", 1024).ok).toBe(false);
  });

  it("gives video a far larger ceiling than images", () => {
    expect(maxBytesFor("video")).toBeGreaterThan(maxBytesFor("image"));
  });

  it("rejects oversized files at the boundary", () => {
    expect(validateAdMedia("image", "image/png", maxBytesFor("image")).ok).toBe(true);
    expect(validateAdMedia("image", "image/png", maxBytesFor("image") + 1).ok).toBe(false);
    expect(validateAdMedia("video", "video/mp4", maxBytesFor("video") + 1).ok).toBe(false);
  });

  it("rejects empty or nonsense sizes", () => {
    expect(validateAdMedia("image", "image/png", 0).ok).toBe(false);
    expect(validateAdMedia("image", "image/png", -1).ok).toBe(false);
    expect(validateAdMedia("image", "image/png", Number.NaN).ok).toBe(false);
  });
});

describe("adMediaObjectPath", () => {
  it("resolves an object inside the studio's own folder", () => {
    expect(adMediaObjectPath(publicUrl(`${STUDIO}/image-abc.png`), STUDIO)).toBe(
      `${STUDIO}/image-abc.png`,
    );
  });

  // The delete path must never be aimable at another tenant.
  it("refuses another studio's object", () => {
    expect(adMediaObjectPath(publicUrl(`${OTHER}/image-abc.png`), STUDIO)).toBeNull();
  });

  it("refuses a hand-typed or foreign URL", () => {
    expect(adMediaObjectPath("https://example.com/cat.png", STUDIO)).toBeNull();
    expect(adMediaObjectPath("not a url", STUDIO)).toBeNull();
  });

  it("refuses an object in a different bucket", () => {
    expect(
      adMediaObjectPath(
        `https://abc.supabase.co/storage/v1/object/public/site-images/${STUDIO}/logo.png`,
        STUDIO,
      ),
    ).toBeNull();
  });

  it("does not let a prefix collision pass for a sibling studio id", () => {
    const sibling = `${STUDIO}-extra`;
    expect(adMediaObjectPath(publicUrl(`${sibling}/image.png`), STUDIO)).toBeNull();
  });
});
