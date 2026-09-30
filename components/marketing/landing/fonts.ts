// ============================================================================
//  components/marketing/landing/fonts.ts
//  Self-hosted display/body fonts for the platform marketing page only.
//  Scoped via CSS variables so tenant-branded studio sites (which pick their
//  own fonts through lib/fonts.ts) are unaffected.
// ============================================================================

import localFont from "next/font/local";

export const bodoniModa = localFont({
  src: [
    {
      path: "../../../public/fonts/bodoni-moda-latin.woff2",
      weight: "500 600",
      style: "normal",
    },
    {
      path: "../../../public/fonts/bodoni-moda-latin-italic.woff2",
      weight: "500 600",
      style: "italic",
    },
  ],
  variable: "--font-landing-display",
  display: "swap",
  fallback: ["Times New Roman", "serif"],
  adjustFontFallback: "Times New Roman",
});

export const archivo = localFont({
  src: "../../../public/fonts/archivo-latin.woff2",
  weight: "400 700",
  style: "normal",
  variable: "--font-landing-body",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
  adjustFontFallback: "Arial",
});

/** Apply to the outer wrapper of the marketing landing tree. */
export const landingFontVars = `${bodoniModa.variable} ${archivo.variable}`;
