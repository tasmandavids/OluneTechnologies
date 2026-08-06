// ============================================================================
//  components/website/SectionBlocks.tsx — the repeated content-section band
//  every template kind shares below its hero, ported from SiteThumb.dc.html's
//  <sc-for list="{{sections}}"> loop.
//
//  Each section carries its own photos (`section.images`). The gallery section
//  is the exception: it renders every photo it has as a mosaic strip beneath
//  the copy instead of a single feature image beside it.
// ============================================================================

import { sectionCopy } from "@/lib/website/sections";
import type { WebsiteSection } from "@/lib/website/types";
import { Art } from "./Art";

function imagesOf(section: WebsiteSection): string[] {
  return (section.images ?? []).filter((src) => typeof src === "string" && src.trim().length > 0);
}

export function SectionBlocks({
  sections,
  accent,
  density,
}: {
  sections: WebsiteSection[];
  accent: string;
  density: number;
}) {
  const visible = sections.filter((s) => s.visible);
  const secImg = Math.round(density * 3.4);
  const fallback = `linear-gradient(140deg, color-mix(in srgb, ${accent} 26%, #e9e5de), color-mix(in srgb, ${accent} 7%, #f5f2ec))`;

  return (
    <>
      {visible.map((section, i) => {
        const { label, headline, body } = sectionCopy(section);
        const images = imagesOf(section);
        const mosaic = section.key === "gallery" && images.length > 1;
        const bg = i % 2 ? "#ffffff" : "transparent";
        return (
          <div
            key={section.key}
            style={{
              padding: `${density}px 56px`,
              borderTop: "1px solid rgba(0,0,0,.08)",
              background: bg,
            }}
          >
            <div
              style={{
                fontSize: 14,
                letterSpacing: ".3em",
                textTransform: "uppercase",
                fontFamily: "var(--font-body)",
                color: accent,
              }}
            >
              {label}
            </div>
            <div style={{ display: "flex", gap: 40, alignItems: "flex-start", marginTop: 22 }}>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 56,
                    lineHeight: 1.02,
                    letterSpacing: "-0.02em",
                    fontFamily: "var(--font-display)",
                  }}
                >
                  {headline}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    lineHeight: 1.55,
                    marginTop: 18,
                    opacity: 0.6,
                    maxWidth: 560,
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {body}
                </div>
              </div>
              {!mosaic && (
                <Art
                  src={images[0]}
                  alt={headline}
                  fallback={fallback}
                  style={{ flex: "0 0 420px", height: secImg }}
                />
              )}
            </div>
            {mosaic && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${Math.min(images.length, 3)}, 1fr)`,
                  gap: 16,
                  marginTop: 34,
                }}
              >
                {images.map((src, idx) => (
                  <Art
                    key={`${src}-${idx}`}
                    src={src}
                    alt={`${headline} — photo ${idx + 1}`}
                    fallback={fallback}
                    style={{ height: Math.round(secImg * 0.82) }}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}
