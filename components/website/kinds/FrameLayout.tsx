import type { LayoutHeroProps } from "@/lib/website/types";
import { Art, Wordmark } from "../Art";

export function FrameLayout({ accent, paper, studioName, headline, tagline, eyebrow, logoUrl, images }: LayoutHeroProps) {
  return (
    <div style={{ minHeight: 900, padding: 36, boxSizing: "border-box", background: `color-mix(in srgb, ${accent} 12%, #f7f4ee)` }}>
      <div style={{ border: `1px solid color-mix(in srgb, ${accent} 40%, #e6e2da)`, background: paper, padding: "48px 56px 56px", minHeight: 828, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 24, borderBottom: `1px solid color-mix(in srgb, ${accent} 26%, #eae6df)` }}>
          <Wordmark logoUrl={logoUrl} studioName={studioName} height={36} style={{ fontSize: 28, fontFamily: "var(--font-display)" }} />
          <div style={{ display: "flex", gap: 26, fontSize: 18, opacity: 0.6, fontFamily: "var(--font-body)" }}>
            <span>Classes</span><span>Timetable</span><span>About</span><span>Contact</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 52, alignItems: "center", flex: 1, paddingTop: 48 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, letterSpacing: ".34em", textTransform: "uppercase", fontFamily: "var(--font-body)", color: accent }}>{eyebrow}</div>
            <div style={{ fontSize: 92, lineHeight: 1, letterSpacing: "-0.025em", marginTop: 24, fontFamily: "var(--font-display)" }}>{headline}</div>
            <div style={{ fontSize: 24, lineHeight: 1.55, marginTop: 26, opacity: 0.62, fontFamily: "var(--font-body)" }}>{tagline}</div>
            <div style={{ display: "flex", gap: 14, marginTop: 38, fontSize: 20, fontFamily: "var(--font-body)" }}>
              <div style={{ padding: "16px 30px", borderRadius: 6, color: "#fff", background: accent }}>Book a free trial</div>
              <div style={{ padding: "16px 30px", borderRadius: 6, border: "1px solid rgba(0,0,0,.16)" }}>Our story</div>
            </div>
          </div>
          <Art
            src={images[0]}
            alt={`${studioName} hero`}
            fallback={`linear-gradient(170deg, color-mix(in srgb, ${accent} 34%, #e7e3db), color-mix(in srgb, ${accent} 9%, #f4f1ea))`}
            style={{ flex: "0 0 420px", height: 520, borderRadius: "210px 210px 8px 8px" }}
          />
        </div>
      </div>
    </div>
  );
}
