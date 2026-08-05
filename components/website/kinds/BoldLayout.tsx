import type { LayoutHeroProps } from "@/lib/website/types";

export function BoldLayout({ accent, ink, studioName, headline, tagline }: LayoutHeroProps) {
  return (
    <div style={{ minHeight: 900, background: ink, color: "#fff", padding: "44px 52px 56px", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 22, letterSpacing: ".14em", textTransform: "uppercase", fontWeight: 800, fontFamily: "var(--font-body)" }}>{studioName}</div>
        <div style={{ display: "flex", gap: 12, fontSize: 17, fontFamily: "var(--font-body)" }}>
          <span style={{ padding: "11px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,.22)" }}>Classes</span>
          <span style={{ padding: "11px 20px", borderRadius: 999, border: "1px solid rgba(255,255,255,.22)" }}>Timetable</span>
          <span style={{ padding: "11px 20px", borderRadius: 999, color: ink, background: accent }}>Book now</span>
        </div>
      </div>
      <div style={{ fontSize: 168, lineHeight: 0.86, letterSpacing: "-0.05em", fontWeight: 800, marginTop: 56, fontFamily: "var(--font-display)" }}>{headline}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 52 }}>
        <div style={{ height: 250, background: accent }} />
        <div style={{ height: 250, background: `linear-gradient(140deg, color-mix(in srgb, ${accent} 62%, #000), color-mix(in srgb, ${accent} 18%, #000))` }} />
        <div style={{ height: 250, padding: 30, boxSizing: "border-box", border: "1px solid rgba(255,255,255,.2)", fontSize: 24, lineHeight: 1.45, opacity: 0.8, fontFamily: "var(--font-body)" }}>{tagline}</div>
      </div>
      <div style={{ display: "flex", gap: 56, marginTop: 46, fontFamily: "var(--font-body)" }}>
        {[
          { n: "12", label: "Programmes" },
          { n: "480", label: "Dancers" },
          { n: "3", label: "Studios" },
        ].map((s) => (
          <div key={s.label}>
            <div style={{ fontSize: 56, fontWeight: 800, color: accent }}>{s.n}</div>
            <div style={{ fontSize: 17, letterSpacing: ".16em", textTransform: "uppercase", opacity: 0.6 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
