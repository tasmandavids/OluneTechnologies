// ============================================================================
//  app/opengraph-image.tsx — the social preview card for every Olune-brand
//  page. Applies to all routes that don't set their own openGraph.images
//  (a studio with a logo overrides this in app/page.tsx's generateMetadata).
// ============================================================================

import { ImageResponse } from "next/og";

export const alt = "Olune — run your whole studio from one calm place";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ACCENT = "#8b7cf0";
const NAVY = "#1a1535";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "88px 96px",
          background: NAVY,
          backgroundImage: `radial-gradient(circle at 78% 18%, ${ACCENT}66 0%, ${NAVY}00 46%)`,
          fontFamily: "sans-serif",
        }}
      >
        {/* eclipse mark — the two overlapping discs of the Olune logo */}
        <div style={{ display: "flex", position: "relative", width: 96, height: 96 }}>
          <div
            style={{
              position: "absolute",
              top: 14,
              left: 14,
              width: 74,
              height: 74,
              borderRadius: "50%",
              background: `linear-gradient(140deg, #d6ccff 0%, ${ACCENT} 55%, #5b4bc4 100%)`,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 2,
              left: 2,
              width: 74,
              height: 74,
              borderRadius: "50%",
              background: NAVY,
            }}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              fontSize: 68,
              lineHeight: 1.1,
              letterSpacing: "-0.025em",
              color: "#ffffff",
              maxWidth: 900,
            }}
          >
            Run your whole studio from one calm place.
          </div>
          <div
            style={{
              marginTop: 28,
              fontSize: 30,
              lineHeight: 1.4,
              color: "rgba(255,255,255,0.62)",
              maxWidth: 820,
            }}
          >
            Classes, registers, invoicing and your live website — together, in real time.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: ACCENT }} />
          <div
            style={{
              fontSize: 27,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#ffffff",
            }}
          >
            Olune
          </div>
        </div>
      </div>
    ),
    size,
  );
}
