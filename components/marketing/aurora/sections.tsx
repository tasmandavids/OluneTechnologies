"use client";

// ============================================================================
//  components/marketing/aurora/sections.tsx — section blocks shared by the
//  Mobile and Card pages.
// ============================================================================

import { GlassPanel } from "./primitives";

/** Ruled big-number grid (Mobile + Card "why" sections). */
export function StatGrid({ stats }: { stats: readonly (readonly [string, string, string, string])[] }) {
  return (
    <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", borderTop: "1px solid var(--ring)" }}>
      {stats.map(([big, unit, title, body], i) => (
        <div key={title} data-reveal={String(i * 80)} style={{ padding: "28px 24px 8px 0", borderBottom: "1px solid var(--hair)" }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(48px,5.4vw,76px)", fontWeight: 600, letterSpacing: "-.06em", lineHeight: 1 }}>{big}</div>
          <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--muted)", marginTop: 10 }}>{unit}</div>
          <h3 style={{ margin: "28px 0 0", fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, letterSpacing: "-.025em" }}>{title}</h3>
          <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--muted)", margin: "8px 0 24px", textWrap: "pretty" }}>{body}</div>
        </div>
      ))}
    </div>
  );
}

/** Three-column "moment / with / without" glass table. */
export function CompareTable({ heads, rows }: { heads: readonly [string, string, string]; rows: readonly (readonly [string, string, string])[] }) {
  const cols = "minmax(0,1.1fr) minmax(0,1fr) minmax(0,1fr)";
  return (
    <div data-reveal="140" style={{ marginTop: 44 }}>
      <GlassPanel level="raised" radius={28} padding={10}>
        <table style={{ width: "100%", borderCollapse: "collapse", borderRadius: 20, overflow: "hidden", background: "var(--surface)", outline: "1px solid var(--hair)", display: "block" }}>
          <thead style={{ display: "block" }}>
            <tr style={{ display: "grid", gridTemplateColumns: cols, gap: 16, padding: "16px 22px", fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)", borderBottom: "1px solid var(--hair)", textAlign: "left" }}>
              <th style={{ fontWeight: 600 }}>{heads[0]}</th>
              <th style={{ fontWeight: 600, color: "var(--iris)" }}>{heads[1]}</th>
              <th style={{ fontWeight: 600 }}>{heads[2]}</th>
            </tr>
          </thead>
          <tbody style={{ display: "block" }}>
            {rows.map(([m, p, w], i) => (
              <tr key={m} style={{ display: "grid", gridTemplateColumns: cols, gap: 16, padding: "18px 22px", fontSize: 14.5, borderBottom: i < rows.length - 1 ? "1px solid var(--hair)" : undefined, textAlign: "left" }}>
                <th scope="row" style={{ fontWeight: 600 }}>{m}</th>
                <td>{p}</td>
                <td style={{ color: "var(--muted)" }}>{w}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </GlassPanel>
    </div>
  );
}
