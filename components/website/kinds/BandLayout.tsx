import type { LayoutHeroProps } from "@/lib/website/types";

export function BandLayout({ accent, studioName, headline, tagline, eyebrow }: LayoutHeroProps) {
  return (
    <div style={{ minHeight: 900 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "38px 56px", background: accent, color: "#fff" }}>
        <div style={{ fontSize: 27, fontFamily: "var(--font-display)" }}>{studioName}</div>
        <div style={{ display: "flex", gap: 28, fontSize: 18, opacity: 0.9, fontFamily: "var(--font-body)" }}>
          <span>Classes</span><span>Timetable</span><span>About</span><span>Contact</span>
        </div>
      </div>
      <div style={{ padding: "64px 56px 56px" }}>
        <div style={{ fontSize: 15, letterSpacing: ".3em", textTransform: "uppercase", fontFamily: "var(--font-body)", color: accent }}>{eyebrow}</div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 40, marginTop: 24 }}>
          <div style={{ fontSize: 118, lineHeight: 0.92, letterSpacing: "-0.035em", maxWidth: 720, fontFamily: "var(--font-display)" }}>{headline}</div>
          <div style={{ fontSize: 23, lineHeight: 1.5, maxWidth: 330, opacity: 0.62, paddingBottom: 12, fontFamily: "var(--font-body)" }}>{tagline}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 0, height: 270 }}>
        <div style={{ flex: 1, background: `color-mix(in srgb, ${accent} 82%, #000)` }} />
        <div style={{ flex: 1.6, background: `linear-gradient(120deg, color-mix(in srgb, ${accent} 34%, #e7e3db), color-mix(in srgb, ${accent} 10%, #f4f1ea))` }} />
        <div style={{ flex: 1, background: `color-mix(in srgb, ${accent} 45%, #fff)` }} />
        <div style={{ flex: 0.6, background: `color-mix(in srgb, ${accent} 18%, #fff)` }} />
      </div>
      <div style={{ display: "flex", gap: 14, padding: "34px 56px", fontSize: 19, fontFamily: "var(--font-body)" }}>
        <div style={{ padding: "14px 26px", borderRadius: 10, color: "#fff", background: accent }}>Mon · Ballet 4.30</div>
        <div style={{ padding: "14px 26px", borderRadius: 10, border: "1px solid rgba(0,0,0,.14)" }}>Tue · Jazz 5.15</div>
        <div style={{ padding: "14px 26px", borderRadius: 10, border: "1px solid rgba(0,0,0,.14)" }}>Wed · Hip hop 6.00</div>
        <div style={{ padding: "14px 26px", borderRadius: 10, border: "1px solid rgba(0,0,0,.14)" }}>Thu · Contemporary 5.30</div>
      </div>
    </div>
  );
}
