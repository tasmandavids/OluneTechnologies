// ============================================================================
//  components/website/SiteRenderer.tsx — the single page renderer for a
//  studio's website, ported from the Claude Design "SiteThumb" component.
//  Used at three scales by three call sites:
//    - gallery card thumbnail  (small scale, non-interactive)
//    - customize-screen live preview (mid scale, non-interactive)
//    - full-scale public page  (scale=1, real page)
//  One implementation — callers just wrap it in an overflow:hidden box sized
//  to `1200 * scale` and set the scale prop; layout math never duplicates.
// ============================================================================

import type { CSSProperties } from "react";
import type { SiteRenderProps } from "@/lib/website/types";
import { SplitLayout } from "./kinds/SplitLayout";
import { PosterLayout } from "./kinds/PosterLayout";
import { EditorialLayout } from "./kinds/EditorialLayout";
import { StackLayout } from "./kinds/StackLayout";
import { SidebarLayout } from "./kinds/SidebarLayout";
import { BandLayout } from "./kinds/BandLayout";
import { BoldLayout } from "./kinds/BoldLayout";
import { FrameLayout } from "./kinds/FrameLayout";
import { SectionBlocks } from "./SectionBlocks";
import { FooterBand } from "./FooterBand";

export const ARTBOARD_WIDTH = 1200;

const LAYOUTS = {
  split: SplitLayout,
  poster: PosterLayout,
  editorial: EditorialLayout,
  stack: StackLayout,
  sidebar: SidebarLayout,
  band: BandLayout,
  bold: BoldLayout,
  frame: FrameLayout,
} as const;

export function SiteRenderer({
  kind,
  accent,
  paper,
  ink,
  fontDisplay,
  fontBody,
  studioName,
  headline,
  tagline,
  eyebrow,
  sections,
  density,
  logoUrl = null,
  heroImages,
  scale = 1,
}: SiteRenderProps) {
  const Layout = LAYOUTS[kind] ?? SplitLayout;
  const heroProps = {
    accent,
    paper,
    ink,
    studioName,
    headline,
    tagline,
    eyebrow,
    logoUrl,
    images: heroImages ?? [],
  };

  const vars = {
    "--font-display": `'${fontDisplay}'`,
    "--font-body": `'${fontBody}'`,
  } as CSSProperties;

  return (
    <div
      style={{
        width: ARTBOARD_WIDTH,
        transformOrigin: "top left",
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        background: "#faf8f3",
        color: "#141414",
        overflow: "hidden",
        position: "relative",
        ...vars,
      }}
    >
      <div style={{ position: "absolute", inset: 0, background: paper }} />
      <div style={{ position: "relative" }}>
        <Layout {...heroProps} />
        <SectionBlocks sections={sections} accent={accent} density={density} />
        <FooterBand studioName={studioName} accent={accent} />
      </div>
    </div>
  );
}
