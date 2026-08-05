// ============================================================================
//  lib/website/accent.ts — public-site accent tint ramp.
//  Reuses the HSL derivation from lib/branding.ts (same maths, generic over
//  any hex) but emits under a distinct --site-accent-* namespace so it never
//  collides with --brand/--brand-hot/--brand-deep, which stay owned by
//  studio_branding / the admin chrome.
// ============================================================================

import { derivePalette } from "@/lib/branding";

export function siteAccentCssVars(accentColor: string): Record<string, string> {
  const p = derivePalette(accentColor);
  return {
    "--site-accent": p.brand,
    "--site-accent-hot": p.brandHot,
    "--site-accent-deep": p.brandDeep,
  };
}
