// ============================================================================
//  lib/content/types.ts — shape shared by the two editorial surfaces
//  (/guides and /compare). Both render through the same server-side layout,
//  so anything added here is available to both.
//
//  Plain data, no JSX: these modules are imported by Server Components that
//  also build Article/FAQPage/BreadcrumbList JSON-LD from the same fields, so
//  the markup can never drift from the rendered copy.
// ============================================================================

export type ContentSection = {
  /** Rendered as an <h2>. Keep it phrased the way someone would ask it. */
  h: string;
  /** Paragraphs, in order. */
  p: string[];
  /** Optional bulleted list rendered after the paragraphs. */
  list?: string[];
};

export type ContentDoc = {
  slug: string;
  /** <h1> on the page. */
  title: string;
  /** <title> tag — may differ from the h1 to carry the search phrasing. */
  metaTitle: string;
  description: string;
  eyebrow: string;
  /** Standfirst under the h1. */
  intro: string;
  /** ISO date, used for dateModified in Article JSON-LD. */
  updated: string;
  sections: ContentSection[];
  /** Rendered as an accordion-free Q&A block and as FAQPage JSON-LD. */
  faq?: { q: string; a: string }[];
  /** Slugs within the same collection, rendered as "keep reading" links. */
  related?: string[];
};

export type CompareDoc = ContentDoc & {
  /** The thing Olune is being compared with, as it should read in prose. */
  them: string;
  /** Side-by-side rows. Keep `them` claims factual and attributable. */
  table: { label: string; them: string; olune: string }[];
  /** When the competitor facts on this page were last checked, ISO date. */
  checked: string;
};
