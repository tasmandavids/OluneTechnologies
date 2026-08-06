// ============================================================================
//  lib/website/types.ts — shared types for the fixed-template website builder.
//  One row per studio (website_configs); no multi-page / freeform-node model.
// ============================================================================

export type WebsiteTemplateKind =
  | "split"
  | "poster"
  | "editorial"
  | "stack"
  | "sidebar"
  | "band"
  | "bold"
  | "frame";

export type SectionKey = "about" | "classes" | "timetable" | "gallery" | "fees" | "contact";

export type WebsiteSection = {
  key: SectionKey;
  visible: boolean;
  headline?: string;
  body?: string;
  /** Public `site-images` URLs. Most sections use `images[0]` as the single
   *  feature image beside the copy; `gallery` renders the whole list as a
   *  mosaic. See SECTION_IMAGE_MAX in lib/website/images.ts. */
  images?: string[];
};

export type WebsiteStatus = "draft" | "published";

export type WebsiteConfig = {
  studioId: string;
  templateId: string;
  kind: WebsiteTemplateKind;
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
  logoUrl: string | null;
  /** Hero art, one entry per slot the chosen template kind exposes (see
   *  HERO_SLOTS). Sparse — an empty/absent entry falls back to the
   *  accent-derived gradient the template shipped with. */
  heroImages: string[];
  sections: WebsiteSection[];
  status: WebsiteStatus;
  publishedAt: string | null;
  updatedAt: string;
};

/** Hero-only props a single template "kind" layout needs — SiteRenderer
 *  handles fonts (as CSS vars), sections, and the footer band itself. */
export type LayoutHeroProps = {
  accent: string;
  paper: string;
  ink: string;
  studioName: string;
  headline: string;
  tagline: string;
  eyebrow: string;
  /** Uploaded logo, drawn in place of the studio-name wordmark when present. */
  logoUrl: string | null;
  /** Hero art per slot — index into HERO_SLOTS[kind]. Missing entries fall
   *  back to each slot's gradient. */
  images: string[];
};

/** Everything SiteRenderer needs to draw a page, independent of persistence. */
export type SiteRenderProps = {
  kind: WebsiteTemplateKind;
  accent: string;
  paper: string;
  ink: string;
  fontDisplay: string;
  fontBody: string;
  studioName: string;
  headline: string;
  tagline: string;
  eyebrow: string;
  sections: WebsiteSection[];
  density: number;
  logoUrl?: string | null;
  heroImages?: string[];
  /** Render scale (1 = full-size public page, <1 = thumbnail/preview). */
  scale?: number;
};
