// ============================================================================
//  components/marketing/landing/fonts.ts
//  Display/body fonts for the platform marketing pages only (Aurora Glass:
//  Geist display, Hanken Grotesk body). Scoped via CSS variables so
//  tenant-branded studio sites (which pick their own fonts through
//  lib/fonts.ts) are unaffected.
//
//  The variable names predate the Aurora redesign and are kept so the
//  editorial pages (pricing, guides, compare, legal) restyle with the rest.
// ============================================================================

import localFont from "next/font/local";

// Self-hosted (OFL, via Fontsource) so production builds never depend on
// fetching from Google Fonts. Geist and Hanken Grotesk are variable fonts,
// covering every weight the pages use from a single file each.
export const geist = localFont({
  src: "../../../public/fonts/geist-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-landing-display",
  display: "swap",
});

export const hankenGrotesk = localFont({
  src: "../../../public/fonts/hanken-grotesk-latin-wght.woff2",
  weight: "100 900",
  variable: "--font-landing-body",
  display: "swap",
});

export const geistMono = localFont({
  src: "../../../public/fonts/geist-mono-latin-500.woff2",
  weight: "500",
  variable: "--font-landing-mono",
  display: "swap",
  preload: false,
});

/** Apply to the outer wrapper of a marketing page tree. */
export const landingFontVars = `${geist.variable} ${hankenGrotesk.variable} ${geistMono.variable}`;
