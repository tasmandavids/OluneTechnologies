// ============================================================================
//  lib/fonts.ts — build Google Fonts stylesheet URLs from branding picks.
// ============================================================================

/** Encode a font family name for the Google Fonts CSS2 API. */
function familyParam(name: string): string {
  const encoded = name.trim().replace(/\s+/g, "+");
  return `family=${encoded}:wght@400;500;600;700`;
}

/** Stylesheet URL loading display + body fonts (deduped). */
export function googleFontsStylesheetUrl(display: string, body: string): string {
  return googleFontsStylesheetUrlMulti([display, body]);
}

/** Stylesheet URL loading an arbitrary set of font families (deduped) — used
 *  by screens that preview many font pairs at once (e.g. the website
 *  template gallery, which shows 20 templates spanning ~8 families). */
export function googleFontsStylesheetUrlMulti(families: string[]): string {
  const unique = [...new Set(families.map((f) => f.trim()).filter(Boolean))];
  if (!unique.length) return "";
  return `https://fonts.googleapis.com/css2?${unique.map(familyParam).join("&")}&display=swap`;
}

/** Resolve tenant typography without bundling every Google Font via next/font. */
export function fontsForBranding(display: string, body: string) {
  return {
    stylesheetUrl: googleFontsStylesheetUrl(display, body),
  };
}
