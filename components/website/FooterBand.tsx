// ============================================================================
//  components/website/FooterBand.tsx — the fixed footer every template kind
//  shares, ported from SiteThumb.dc.html. Reuses PoweredByOlune for the
//  "Powered by Olune" lockup instead of hand-writing the label.
// ============================================================================

import { PoweredByOlune } from "@/components/brand/PoweredByOlune";

export function FooterBand({ studioName, accent }: { studioName: string; accent: string }) {
  return (
    <div
      style={{
        padding: "44px 56px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: `color-mix(in srgb, ${accent} 88%, #0a0a0a)`,
        color: "#fff",
      }}
    >
      <div style={{ fontSize: 26, fontFamily: "var(--font-display)" }}>{studioName}</div>
      <PoweredByOlune theme="dark" showLabel size="xs" />
    </div>
  );
}
