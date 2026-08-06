import type { LayoutHeroProps } from "@/lib/website/types";
import { Art, Wordmark } from "../Art";

export function StackLayout({ accent, studioName, tagline, eyebrow, logoUrl, images }: LayoutHeroProps) {
  return (
    <div style={{ minHeight: 900, padding: "52px 80px 70px", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 44, fontSize: 18, letterSpacing: ".16em", textTransform: "uppercase", opacity: 0.55, fontFamily: "var(--font-body)" }}>
        <span>Classes</span><span>Timetable</span><span>About</span><span>Contact</span>
      </div>
      <div style={{ marginTop: 76, fontSize: 15, letterSpacing: ".42em", textTransform: "uppercase", fontFamily: "var(--font-body)", color: accent }}>{eyebrow}</div>
      {/* This kind uses the studio name *as* the headline, so the logo takes
          its place at display size when one is uploaded. */}
      <div style={{ marginTop: 30, width: "100%" }}>
        <Wordmark
          logoUrl={logoUrl}
          studioName={studioName}
          height={104}
          align="center"
          style={{ fontSize: 126, lineHeight: 0.95, letterSpacing: "-0.02em", fontFamily: "var(--font-display)" }}
        />
      </div>
      <div style={{ marginTop: 26, fontSize: 26, lineHeight: 1.55, maxWidth: 640, opacity: 0.62, fontFamily: "var(--font-body)" }}>{tagline}</div>
      <div style={{ marginTop: 40, padding: "17px 38px", borderRadius: 999, fontSize: 20, color: "#fff", fontFamily: "var(--font-body)", background: accent }}>Book a free trial</div>
      <Art
        src={images[0]}
        alt={`${studioName} hero`}
        fallback={`linear-gradient(180deg, color-mix(in srgb, ${accent} 30%, #e8e4dc), color-mix(in srgb, ${accent} 8%, #f5f2ec))`}
        style={{ marginTop: 64, width: "100%", height: 280, borderRadius: "280px 280px 0 0" }}
      />
    </div>
  );
}
