"use client";

// ============================================================================
//  lib/website/useGoogleFonts.ts — client-side Google Fonts loader for live
//  preview screens (gallery grid, customize picker). Same
//  inject-or-update-a-<link> pattern as the old TypographyGallery's
//  useGoogleFontsPreview, generalized to an arbitrary family list.
// ============================================================================

import { useEffect } from "react";
import { googleFontsStylesheetUrlMulti } from "@/lib/fonts";

export function useGoogleFontsPreview(families: string[], linkId = "website-builder-font-preview") {
  const key = families.join("|");
  useEffect(() => {
    const url = googleFontsStylesheetUrlMulti(families);
    if (!url) return;
    let link = document.getElementById(linkId) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.id = linkId;
      link.rel = "stylesheet";
      document.head.appendChild(link);
    }
    link.href = url;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is families.join, the real dep
  }, [key, linkId]);
}
