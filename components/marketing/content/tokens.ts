// ============================================================================
//  components/marketing/content/tokens.ts — design constants for the editorial
//  pages, duplicated from chrome.tsx on purpose.
//
//  chrome.tsx carries "use client". A Server Component importing a plain value
//  from a client-boundary module gets an opaque client reference rather than
//  the string itself (see the note atop landing/faq-data.ts), so the editorial
//  pages — which are Server Components by design, for the HTML Google reads —
//  cannot import DISPLAY/BODY from there. Components are fine to import; only
//  plain values are not.
//
//  Keep these in sync with chrome.tsx if the palette moves.
// ============================================================================

// Aurora Glass palette (components/marketing/aurora/aurora.css).
export const ACCENT = "#6b66c9";
export const NAVY = "#15141a";
export const DISPLAY = "var(--font-landing-display), 'Geist', system-ui, sans-serif";
export const BODY = "var(--font-landing-body), 'Hanken Grotesk', system-ui, sans-serif";

export const MUTED = "#6c6a7e";
export const FAINT = "rgba(20,19,26,0.45)";
export const HAIRLINE = "1px solid rgba(20,19,26,0.085)";
export const PAGE_BG = "#f2f1ed";
export const HERO_BG = "radial-gradient(70% 60% at 20% 0%, rgba(166,162,232,.34), transparent 70%), radial-gradient(60% 50% at 90% 10%, rgba(159,216,200,.26), transparent 70%), #f2f1ed";
