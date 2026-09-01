// ============================================================================
//  mobile/src/lib/theme.ts — the fallback palette, lifted from the web's
//  app/globals.css :root block so an unbranded launch looks like Olune rather
//  than like React Native's defaults.
//
//  A studio's own brand_color / surface / text come from the studios +
//  studio_branding rows once a studio is chosen; this is what renders before
//  that resolves, and what a studio with no branding set keeps.
// ============================================================================

export const theme = {
  brand: "#5A55BD",
  brandDeep: "#3D3A8A",
  base: "#FAF8F3",
  surface: "#FFFFFF",
  ink: "#17162B",
  muted: "#6C6A7E",
  hairline: "rgba(23, 22, 43, 0.09)",
  warm: "#C47A34",
  good: "#2F7D5B",
} as const;
