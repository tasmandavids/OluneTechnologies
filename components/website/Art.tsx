// ============================================================================
//  components/website/Art.tsx — the two render primitives every template kind
//  shares once photos are in play.
//
//  Both draw with CSS background-image rather than <img>: the whole site
//  renderer is an inline-styled 1200px artboard that gets `transform: scale()`
//  down to thumbnail size, so intrinsic image sizing is more nuisance than
//  help, and it keeps next/image's domain config out of the picture.
// ============================================================================

import type { CSSProperties } from "react";
import { cssUrl } from "@/lib/website/images";

/** An image slot. Falls back to the template's accent-derived gradient when
 *  the studio hasn't uploaded anything for this slot yet. */
export function Art({
  src,
  fallback,
  alt,
  style,
}: {
  src?: string | null;
  fallback: string;
  /** Describes the slot for assistive tech when a real photo is present. */
  alt?: string;
  style?: CSSProperties;
}) {
  const filled = typeof src === "string" && src.trim().length > 0;
  return (
    <div
      role={filled ? "img" : undefined}
      aria-label={filled ? alt : undefined}
      style={{
        ...style,
        background: filled ? undefined : fallback,
        backgroundImage: filled ? cssUrl(src!.trim()) : undefined,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    />
  );
}

/** The studio's name in the hero — replaced by the uploaded logo when there
 *  is one. `height` is the logo's rendered height; the box is wider than the
 *  logo needs and `contain` letterboxes inside it, so any aspect ratio works. */
export function Wordmark({
  logoUrl,
  studioName,
  height = 34,
  align = "left",
  style,
}: {
  logoUrl?: string | null;
  studioName: string;
  height?: number;
  align?: "left" | "center";
  style?: CSSProperties;
}) {
  if (logoUrl && logoUrl.trim()) {
    return (
      <div
        role="img"
        aria-label={studioName}
        style={{
          height,
          width: height * 5,
          maxWidth: "100%",
          margin: align === "center" ? "0 auto" : undefined,
          backgroundImage: cssUrl(logoUrl.trim()),
          backgroundSize: "contain",
          backgroundPosition: align === "center" ? "center" : "left center",
          backgroundRepeat: "no-repeat",
        }}
      />
    );
  }
  return <div style={style}>{studioName}</div>;
}
