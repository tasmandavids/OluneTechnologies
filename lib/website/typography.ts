// ============================================================================
//  lib/website/typography.ts — curated font pairings for the website builder.
//  Salvaged verbatim from lib/site/typography.ts before that module (v1) was
//  deleted. Each pair uses Google Fonts (loaded via lib/fonts.ts).
// ============================================================================

export type TypographyCategory =
  | "elegant"
  | "modern"
  | "classic"
  | "bold"
  | "friendly"
  | "minimal"
  | "creative"
  | "editorial";

export type TypographyPair = {
  id: string;
  display: string;
  body: string;
  category: TypographyCategory;
};

export const TYPOGRAPHY_CATEGORIES: { id: TypographyCategory | "all" }[] = [
  { id: "all" },
  { id: "elegant" },
  { id: "modern" },
  { id: "classic" },
  { id: "bold" },
  { id: "friendly" },
  { id: "minimal" },
  { id: "creative" },
  { id: "editorial" },
];

export const TYPOGRAPHY_PAIRS: TypographyPair[] = [
  { id: "fraunces-hanken", display: "Fraunces", body: "Hanken Grotesk", category: "elegant" },
  { id: "cormorant-inter", display: "Cormorant Garamond", body: "Inter", category: "editorial" },
  { id: "playfair-source", display: "Playfair Display", body: "Source Sans 3", category: "elegant" },
  { id: "libre-lato", display: "Libre Baskerville", body: "Lato", category: "classic" },
  { id: "merriweather-opensans", display: "Merriweather", body: "Open Sans", category: "classic" },
  { id: "lora-nunito", display: "Lora", body: "Nunito Sans", category: "friendly" },
  { id: "dm-serif-dm-sans", display: "DM Serif Display", body: "DM Sans", category: "modern" },
  { id: "cinzel-raleway", display: "Cinzel", body: "Raleway", category: "bold" },
  { id: "bodoni-work", display: "Bodoni Moda", body: "Work Sans", category: "elegant" },
  { id: "oswald-roboto", display: "Oswald", body: "Roboto", category: "bold" },
  { id: "bebas-montserrat", display: "Bebas Neue", body: "Montserrat", category: "bold" },
  { id: "space-inter", display: "Space Grotesk", body: "Inter", category: "modern" },
  { id: "archivo", display: "Archivo", body: "Archivo", category: "minimal" },
  { id: "poppins", display: "Poppins", body: "Poppins", category: "friendly" },
  { id: "nunito", display: "Nunito", body: "Nunito", category: "friendly" },
  { id: "lexend", display: "Lexend", body: "Lexend", category: "minimal" },
  { id: "rubik", display: "Rubik", body: "Rubik", category: "friendly" },
  { id: "manrope", display: "Manrope", body: "Manrope", category: "modern" },
  { id: "jakarta", display: "Plus Jakarta Sans", body: "Plus Jakarta Sans", category: "modern" },
  { id: "eb-karla", display: "EB Garamond", body: "Karla", category: "editorial" },
  { id: "crimson-franklin", display: "Crimson Pro", body: "Libre Franklin", category: "editorial" },
  { id: "josefin-lato", display: "Josefin Sans", body: "Lato", category: "creative" },
  { id: "albert", display: "Albert Sans", body: "Albert Sans", category: "minimal" },
  { id: "quicksand", display: "Quicksand", body: "Quicksand", category: "friendly" },
  { id: "figtree", display: "Figtree", body: "Figtree", category: "modern" },
  { id: "urbanist", display: "Urbanist", body: "Urbanist", category: "modern" },
  { id: "instrument", display: "Instrument Serif", body: "Instrument Sans", category: "creative" },
  { id: "bricolage", display: "Bricolage Grotesque", body: "Bricolage Grotesque", category: "creative" },
  { id: "syne-inter", display: "Syne", body: "Inter", category: "creative" },
  { id: "sora-outfit", display: "Sora", body: "Outfit", category: "friendly" },
];

export const TYPOGRAPHY_MAP: Record<string, TypographyPair> = Object.fromEntries(
  TYPOGRAPHY_PAIRS.map((t) => [t.id, t]),
);

export function getTypographyPair(id: string): TypographyPair {
  return TYPOGRAPHY_MAP[id] ?? TYPOGRAPHY_PAIRS[0];
}

export function filterTypography(category: TypographyCategory | "all"): TypographyPair[] {
  if (category === "all") return TYPOGRAPHY_PAIRS;
  return TYPOGRAPHY_PAIRS.filter((t) => t.category === category);
}

/** Find the catalog pair matching a (display, body) combo, if any — used to
 *  highlight the active pairing when a template's fonts were picked outside
 *  the catalog UI (e.g. a template default). */
export function findTypographyPair(display: string, body: string): TypographyPair | null {
  return TYPOGRAPHY_PAIRS.find((t) => t.display === display && t.body === body) ?? null;
}

/** All unique Google Font family names used in the catalog. */
export function allFontFamilies(): string[] {
  const names = new Set<string>();
  for (const t of TYPOGRAPHY_PAIRS) {
    names.add(t.display);
    names.add(t.body);
  }
  return [...names];
}
