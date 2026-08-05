// ============================================================================
//  lib/website/sections.ts — the 6 fixed content sections, default copy
//  ported verbatim from SiteThumb.dc.html's SECTIONS const. Every template
//  shares the same section vocabulary; the admin toggles visibility/order
//  and can override the headline/body per studio.
// ============================================================================

import type { SectionKey, WebsiteSection } from "./types";

export type SectionDefaults = {
  key: SectionKey;
  /** Short uppercase eyebrow label shown above the section heading. */
  label: string;
  headline: string;
  body: string;
};

export const SECTION_DEFAULTS: Record<SectionKey, SectionDefaults> = {
  about: {
    key: "about",
    label: "The human bit",
    headline: "Taught by people who know your kid's name.",
    body: "Fifteen teachers, one ethos: technique with kindness. Come in, watch a class, stay for tea.",
  },
  classes: {
    key: "classes",
    label: "Programmes",
    headline: "Twelve programmes, ages three to adult.",
    body: "Ballet, jazz, contemporary, hip hop, tap and musical theatre — from first steps to pre-professional.",
  },
  timetable: {
    key: "timetable",
    label: "Timetable",
    headline: "Term two, live and always current.",
    body: "Pulled straight from the studio schedule. Book a spot in two taps, no phone calls.",
  },
  gallery: {
    key: "gallery",
    label: "The studio",
    headline: "Three sprung floors, one quiet street.",
    body: "Natural light, good mirrors, and a waiting room parents actually like sitting in.",
  },
  fees: {
    key: "fees",
    label: "Fees",
    headline: "Plain pricing, no surprises.",
    body: "Per-term fees with sibling discounts, and payment plans if the term is a tight one.",
  },
  contact: {
    key: "contact",
    label: "Visit",
    headline: "Come and see us.",
    body: "Open weekdays from three, Saturdays from nine. Free trial class, any week.",
  },
};

/** Short label used by the customizer's section list (distinct from the
 *  on-page eyebrow label above) — ported from Website Designer.dc.html's
 *  SECTION_LABELS const. */
export const SECTION_PICKER_LABELS: Record<SectionKey, string> = {
  about: "About the studio",
  classes: "Programmes",
  timetable: "Timetable",
  gallery: "Gallery",
  fees: "Fees",
  contact: "Visit & contact",
};

export const SECTION_ORDER: SectionKey[] = ["about", "classes", "timetable", "gallery", "fees", "contact"];

/** Default section list for a newly-selected template — matches the
 *  mockup's initial state (fees off, everything else on, in canonical order). */
export function defaultSections(): WebsiteSection[] {
  return SECTION_ORDER.map((key) => ({
    key,
    visible: key !== "fees",
  }));
}

export function sectionCopy(section: WebsiteSection): { label: string; headline: string; body: string } {
  const defaults = SECTION_DEFAULTS[section.key];
  return {
    label: defaults.label,
    headline: section.headline?.trim() || defaults.headline,
    body: section.body?.trim() || defaults.body,
  };
}
