// ============================================================================
//  components/website/SectionBlocks.tsx — the repeated content-section band
//  every template kind shares below its hero, ported verbatim from
//  SiteThumb.dc.html's <sc-for list="{{sections}}"> loop.
// ============================================================================

import { sectionCopy } from "@/lib/website/sections";
import type { WebsiteSection } from "@/lib/website/types";

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

  return (
    <>
      {visible.map((section, i) => {
        const { label, headline, body } = sectionCopy(section);
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
              <div
                style={{
                  flex: "0 0 420px",
                  height: secImg,
                  background: `linear-gradient(140deg, color-mix(in srgb, ${accent} 26%, #e9e5de), color-mix(in srgb, ${accent} 7%, #f5f2ec))`,
                }}
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
