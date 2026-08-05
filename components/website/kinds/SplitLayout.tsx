import type { LayoutHeroProps } from "@/lib/website/types";

export function SplitLayout({ accent, studioName, headline, tagline, eyebrow }: LayoutHeroProps) {
  return (
    <div style={{ display: "flex", minHeight: 900, alignItems: "stretch" }}>
      <div style={{ flex: "0 0 49%", padding: "56px 60px", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box" }}>
        <div style={{ fontSize: 30, letterSpacing: "-0.02em", fontFamily: "var(--font-display)" }}>{studioName}</div>
        <div>
          <div style={{ fontSize: 16, letterSpacing: ".24em", textTransform: "uppercase", marginBottom: 26, fontFamily: "var(--font-body)", color: accent }}>{eyebrow}</div>
          <div style={{ fontSize: 100, lineHeight: 0.94, letterSpacing: "-0.03em", fontWeight: 400, fontFamily: "var(--font-display)" }}>{headline}</div>
          <div style={{ fontSize: 24, lineHeight: 1.5, maxWidth: 430, marginTop: 30, opacity: 0.6, fontFamily: "var(--font-body)" }}>{tagline}</div>
          <div style={{ display: "flex", gap: 14, marginTop: 42 }}>
            <div style={{ padding: "17px 32px", borderRadius: 999, color: "#fff", fontSize: 20, fontFamily: "var(--font-body)", background: accent }}>Book a free trial</div>
            <div style={{ padding: "17px 32px", borderRadius: 999, border: "1px solid rgba(0,0,0,.16)", fontSize: 20, fontFamily: "var(--font-body)" }}>Explore programmes</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 32, fontSize: 19, opacity: 0.55, fontFamily: "var(--font-body)" }}>
          <span>Classes</span><span>Timetable</span><span>About</span><span>Contact</span>
        </div>
      </div>
      <div style={{ flex: 1, position: "relative", background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 32%, #e8e4dc), color-mix(in srgb, ${accent} 8%, #f5f2ec))` }}>
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 190, height: 190, borderRadius: "50%", background: "rgba(255,255,255,.55)", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, bottom: 0, left: "36%", right: "-36%", borderRadius: "50%", background: `color-mix(in srgb, ${accent} 62%, #ffffff)` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
