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

export const ACCENT = "#8b7cf0";
export const NAVY = "#1a1535";
export const DISPLAY = "var(--font-landing-display), 'Bodoni Moda', serif";
export const BODY = "var(--font-landing-body), 'Archivo', sans-serif";

export const MUTED = "rgba(26,21,53,0.62)";
export const FAINT = "rgba(26,21,53,0.45)";
export const HAIRLINE = "1px solid rgba(26,21,53,0.09)";
export const PAGE_BG = "#f7f6fb";
export const HERO_BG = "linear-gradient(180deg, #efeafb 0%, #f7f6fb 60%)";
