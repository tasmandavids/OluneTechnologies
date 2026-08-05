import type { LayoutHeroProps } from "@/lib/website/types";

export function PosterLayout({ accent, studioName, headline, tagline, eyebrow }: LayoutHeroProps) {
  return (
    <div style={{ minHeight: 900, position: "relative", background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 26%, #e9e5de), color-mix(in srgb, ${accent} 58%, #2b2733))` }}>
      <div style={{ position: "absolute", top: 44, left: 56, right: 56, display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff" }}>
        <div style={{ fontSize: 26, letterSpacing: ".02em", fontFamily: "var(--font-display)" }}>{studioName}</div>
        <div style={{ display: "flex", gap: 30, fontSize: 18, opacity: 0.85, fontFamily: "var(--font-body)" }}>
          <span>Classes</span><span>Timetable</span><span>About</span><span>Contact</span>
        </div>
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 120, textAlign: "center", color: "#fff", padding: "0 80px" }}>
        <div style={{ fontSize: 16, letterSpacing: ".32em", textTransform: "uppercase", opacity: 0.8, marginBottom: 30, fontFamily: "var(--font-body)" }}>{eyebrow}</div>
        <div style={{ fontSize: 150, lineHeight: 0.9, letterSpacing: "-0.035em", fontFamily: "var(--font-display)" }}>{headline}</div>
        <div style={{ fontSize: 25, lineHeight: 1.5, maxWidth: 620, margin: "34px auto 0", opacity: 0.85, fontFamily: "var(--font-body)" }}>{tagline}</div>
        <div style={{ display: "inline-block", marginTop: 40, padding: "18px 40px", borderRadius: 999, background: "#fff", color: "#1b1a38", fontSize: 20, fontFamily: "var(--font-body)" }}>Book a free trial</div>
      </div>
    </div>
  );
}
