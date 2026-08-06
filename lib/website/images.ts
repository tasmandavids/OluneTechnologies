// ============================================================================
//  lib/website/images.ts — where photos can go in a template, and the shared
//  storage-path helpers both the client uploader and the server actions need.
//
//  Every template kind ships gradient placeholders derived from the accent
//  colour; each one is an *addressable slot* here so the customizer can offer
//  a dropzone per slot and the layout can fall back cleanly when it's empty.
// ============================================================================

import type { SectionKey, WebsiteTemplateKind } from "./types";

export const IMAGE_BUCKET = "site-images";
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

/** contentType → file extension. Also the upload allow-list. */
export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/svg+xml": "svg",
};

export const IMAGE_ACCEPT = Object.keys(ALLOWED_IMAGE_TYPES).join(",");

export type HeroSlot = {
  label: string;
  /** Shape guidance shown under the dropzone — the slots differ a lot. */
  hint: string;
};

/** One entry per image slot the kind's hero exposes, in render order. */
export const HERO_SLOTS: Record<WebsiteTemplateKind, HeroSlot[]> = {
  split: [{ label: "Hero panel", hint: "Fills the right half of the hero — tall/portrait crops work best" }],
  poster: [{ label: "Poster background", hint: "Full-bleed behind the headline — your strongest wide photo" }],
  editorial: [{ label: "Column image", hint: "Portrait image in the right-hand column" }],
  stack: [{ label: "Arch image", hint: "Wide image under the headline, arched along the top" }],
  sidebar: [
    { label: "Mosaic · large", hint: "Top-left, the biggest tile" },
    { label: "Mosaic · top right", hint: "Narrow tile" },
    { label: "Mosaic · bottom left", hint: "Wide tile" },
    { label: "Mosaic · bottom right", hint: "Narrow tile" },
  ],
  band: [
    { label: "Band 1", hint: "Narrow strip, far left" },
    { label: "Band 2", hint: "The wide centre strip — the one people look at" },
    { label: "Band 3", hint: "Narrow strip" },
    { label: "Band 4", hint: "Narrowest strip, far right" },
  ],
  bold: [
    { label: "Block 1", hint: "Left block under the headline" },
    { label: "Block 2", hint: "Middle block under the headline" },
  ],
  frame: [{ label: "Arch panel", hint: "Tall arched panel beside the headline" }],
};

export function heroSlots(kind: WebsiteTemplateKind): HeroSlot[] {
  return HERO_SLOTS[kind] ?? HERO_SLOTS.split;
}

/** How many photos a section accepts. The gallery is a mosaic; everything
 *  else has a single feature image beside its copy. */
export const SECTION_IMAGE_MAX: Record<SectionKey, number> = {
  about: 1,
  classes: 1,
  timetable: 1,
  gallery: 6,
  fees: 1,
  contact: 1,
};

/** Trim a stored image list to the slots that actually render, dropping
 *  blanks so `images[i]` stays aligned with slot `i`. */
export function normalizeImageList(raw: unknown, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, max).map((v) => (typeof v === "string" ? v.trim() : ""));
}

/** Every image URL a config references — used to diff old vs new on save so
 *  storage objects that are no longer pointed at can be cleaned up. */
export function collectImageUrls(input: {
  logoUrl?: string | null;
  heroImages?: string[] | null;
  sections?: { images?: string[] | null }[] | null;
}): Set<string> {
  const urls = new Set<string>();
  const add = (v: unknown) => {
    if (typeof v === "string" && v.trim()) urls.add(v.trim());
  };
  add(input.logoUrl);
  (input.heroImages ?? []).forEach(add);
  (input.sections ?? []).forEach((s) => (s?.images ?? []).forEach(add));
  return urls;
}

/** Public URL → object path inside the bucket, but only when the object
 *  belongs to this studio's folder. Returns null for anything else (a
 *  hand-typed URL, another tenant's path, a non-Storage host). */
export function storageObjectPath(publicUrl: string, studioId: string): string | null {
  try {
    const { pathname } = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${IMAGE_BUCKET}/`;
    const idx = pathname.indexOf(marker);
    if (idx === -1) return null;
    const objectPath = decodeURIComponent(pathname.slice(idx + marker.length));
    return objectPath.startsWith(`${studioId}/`) ? objectPath : null;
  } catch {
    return null;
  }
}

/** Quote a URL for use in a CSS `background-image` value. */
export function cssUrl(src: string): string {
  return `url("${src.replace(/["\\]/g, (c) => `\\${c}`)}")`;
}
