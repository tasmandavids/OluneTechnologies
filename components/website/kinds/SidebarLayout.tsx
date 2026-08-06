import type { LayoutHeroProps } from "@/lib/website/types";
import { Art, Wordmark } from "../Art";

const MOSAIC_FALLBACKS = (accent: string) => [
  `linear-gradient(150deg, color-mix(in srgb, ${accent} 32%, #e7e3db), color-mix(in srgb, ${accent} 9%, #f4f1ea))`,
  `linear-gradient(20deg, color-mix(in srgb, ${accent} 20%, #eae6df), color-mix(in srgb, ${accent} 6%, #f6f3ed))`,
  `linear-gradient(200deg, color-mix(in srgb, ${accent} 14%, #ece8e1), color-mix(in srgb, ${accent} 5%, #f6f3ed))`,
  `linear-gradient(120deg, color-mix(in srgb, ${accent} 40%, #e4e0d8), color-mix(in srgb, ${accent} 12%, #f2efe8))`,
];

export function SidebarLayout({ accent, studioName, headline, tagline, eyebrow, logoUrl, images }: LayoutHeroProps) {
  const fallbacks = MOSAIC_FALLBACKS(accent);
  return (
    <div style={{ display: "flex", minHeight: 900 }}>
      <div style={{ flex: "0 0 300px", padding: "52px 40px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", background: accent, color: "#fff" }}>
        <div>
          <Wordmark logoUrl={logoUrl} studioName={studioName} height={40} style={{ fontSize: 32, letterSpacing: "-0.01em", fontFamily: "var(--font-display)" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 56, fontSize: 21, fontFamily: "var(--font-body)" }}>
            <span>Classes</span><span>Timetable</span><span>About</span><span>Fees</span><span>Contact</span>
          </div>
        </div>
        <div style={{ fontSize: 19, lineHeight: 1.5, opacity: 0.75, fontFamily: "var(--font-body)" }}>{eyebrow}<br />Est. 1998</div>
      </div>
      <div style={{ flex: 1, padding: "56px 56px 60px", boxSizing: "border-box" }}>
        <div style={{ fontSize: 88, lineHeight: 0.98, letterSpacing: "-0.03em", fontFamily: "var(--font-display)" }}>{headline}</div>
        <div style={{ fontSize: 24, lineHeight: 1.5, maxWidth: 560, marginTop: 26, opacity: 0.6, fontFamily: "var(--font-body)" }}>{tagline}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gridTemplateRows: "230px 190px", gap: 18, marginTop: 44 }}>
          {fallbacks.map((fallback, i) => (
            <Art key={i} src={images[i]} alt={`${studioName} photo ${i + 1}`} fallback={fallback} />
          ))}
        </div>
      </div>
    </div>
  );
}
