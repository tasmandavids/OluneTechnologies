import type { LayoutHeroProps } from "@/lib/website/types";
import { Art, Wordmark } from "../Art";

export function EditorialLayout({ accent, studioName, headline, tagline, eyebrow, logoUrl, images }: LayoutHeroProps) {
  return (
    <div style={{ padding: "44px 56px 60px", minHeight: 900, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", paddingBottom: 26, borderBottom: "1px solid rgba(0,0,0,.14)" }}>
        <Wordmark logoUrl={logoUrl} studioName={studioName} height={28} style={{ fontSize: 17, letterSpacing: ".26em", textTransform: "uppercase", fontFamily: "var(--font-body)" }} />
        <div style={{ display: "flex", gap: 28, fontSize: 17, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.6, fontFamily: "var(--font-body)" }}>
          <span>Classes</span><span>Timetable</span><span>About</span><span>Contact</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 48, paddingTop: 44 }}>
        <div>
          <div style={{ fontSize: 112, lineHeight: 0.92, letterSpacing: "-0.03em", fontFamily: "var(--font-display)" }}>{headline}</div>
          <div style={{ height: 1, background: "rgba(0,0,0,.14)", margin: "36px 0" }} />
          <div style={{ columns: 2, columnGap: 36, fontSize: 22, lineHeight: 1.62, opacity: 0.68, fontFamily: "var(--font-body)" }}>
            {tagline} Small classes, real teachers, and a term rhythm that families can plan around.
          </div>
        </div>
        <div>
          <Art
            src={images[0]}
            alt={`${studioName} hero`}
            fallback={`linear-gradient(150deg, color-mix(in srgb, ${accent} 34%, #e7e3db), color-mix(in srgb, ${accent} 10%, #f4f1ea))`}
            style={{ height: 430 }}
          />
          <div style={{ marginTop: 22, fontSize: 16, letterSpacing: ".2em", textTransform: "uppercase", fontFamily: "var(--font-body)", color: accent }}>{eyebrow}</div>
          <div style={{ marginTop: 14, fontSize: 21, lineHeight: 1.5, opacity: 0.66, fontFamily: "var(--font-body)" }}>Term two enrolments are open. Twelve programmes, ages three to adult.</div>
        </div>
      </div>
    </div>
  );
}
