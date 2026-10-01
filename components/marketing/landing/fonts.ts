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

import { Geist, Geist_Mono, Hanken_Grotesk } from "next/font/google";

export const geist = Geist({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-display",
  display: "swap",
});

export const hankenGrotesk = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-landing-body",
  display: "swap",
});

export const geistMono = Geist_Mono({
  subsets: ["latin"],
  weight: "500",
  variable: "--font-landing-mono",
  display: "swap",
  preload: false,
});

/** Apply to the outer wrapper of a marketing page tree. */
export const landingFontVars = `${geist.variable} ${hankenGrotesk.variable} ${geistMono.variable}`;
