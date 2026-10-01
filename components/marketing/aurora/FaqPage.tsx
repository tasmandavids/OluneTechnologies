"use client";

// ============================================================================
//  components/marketing/aurora/FaqPage.tsx — port of "Olune FAQ.dc.html".
//  Search + category chips + glass accordion. Copy lives in
//  landing/faq-data.ts, which also feeds the FAQPage JSON-LD in app/faq.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { CATEGORIES } from "../landing/faq-data";
import { AuroraPage } from "./chrome";
import { CONTACT_EMAIL } from "./copy";
import { GlassPanel, HeroEyebrow } from "./primitives";

const EASE = "cubic-bezier(.16,1,.3,1)";
const SPRING = "cubic-bezier(.32,.72,0,1)";
const total = CATEGORIES.reduce((n, c) => n + c.items.length, 0);

export default function FaqPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [open, setOpen] = useState<Record<string, boolean>>({ "What is Olune?": true });
  const searchRef = useRef<HTMLInputElement | null>(null);

  // "/" focuses search, like the design.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (e.key === "/" && tag !== "input" && tag !== "textarea") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const ql = q.trim().toLowerCase();
  const match = (it: { q: string; a: string }) => !ql || `${it.q} ${it.a}`.toLowerCase().includes(ql);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c.id, c.items.filter(match).length]));
  const matchedTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const groups = CATEGORIES.filter((c) => cat === "all" || c.id === cat)
    .map((c) => ({ ...c, items: c.items.filter(match) }))
    .filter((c) => c.items.length);
  const shown = groups.reduce((n, g) => n + g.items.length, 0);
  const chips = [{ id: "all", label: "All", n: matchedTotal }, ...CATEGORIES.map((c) => ({ id: c.id, label: c.label, n: counts[c.id] }))];

  return (
    <AuroraPage active="faq" footer={{ title: "Still curious?", accent: "Just try it.", body: "Everything is free to use until general release in December — the fastest way to see if Olune fits your studio." }}>
      <section style={{ position: "relative", zIndex: 1, padding: "clamp(140px,20vh,200px) 24px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <HeroEyebrow>FAQ</HeroEyebrow>
        <h1 style={{ margin: "28px 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(48px,7.6vw,120px)", lineHeight: 1.02, letterSpacing: "-.055em", animation: `olune-lift 1s .1s ${EASE} backwards` }}>
          Questions, <span style={{ color: "var(--iris)" }}>answered.</span>
        </h1>
        <p style={{ margin: "24px 0 0", maxWidth: 520, fontSize: "clamp(17px,1.4vw,19px)", lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty", animation: `olune-rise .9s .3s ${EASE} both` }}>
          What Olune does, what it costs, and how everything connects. Can’t find it? Email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--ink)", fontWeight: 600 }}>{CONTACT_EMAIL}</a>.
        </p>

        <div style={{ width: "100%", maxWidth: 640, marginTop: 40, animation: `olune-rise .9s .42s ${EASE} both` }}>
          <GlassPanel level="raised" radius={999} padding={6}>
            <label style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 10px 0 18px", height: 50, cursor: "text" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" style={{ color: "var(--muted)", flex: "none" }} aria-hidden>
                <circle cx="11" cy="11" r="6.5" />
                <path d="M16 16l4 4" />
              </svg>
              <span className="sr-only">Search the FAQ</span>
              <input
                ref={searchRef}
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search — try “Xero”, “GST” or “offline”"
                style={{ all: "unset", flex: 1, minWidth: 0, fontSize: 16, color: "var(--ink)", textAlign: "left" }}
              />
              {q ? (
                <button type="button" onClick={() => setQ("")} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 999, background: "var(--t2)" }}>
                  Clear
                </button>
              ) : (
                <span aria-hidden style={{ fontSize: 10.5, fontWeight: 600, padding: "3px 7px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--hair)", color: "var(--muted)" }}>/</span>
              )}
            </label>
          </GlassPanel>
        </div>

        <div role="group" aria-label="Filter by topic" style={{ marginTop: 22, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, maxWidth: 820, animation: `olune-rise .9s .5s ${EASE} both` }}>
          {chips.map((c) => {
            const on = cat === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                onClick={() => setCat(c.id)}
                className={on ? undefined : "ol-hover-t2"}
                style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, color: on ? "var(--base)" : "var(--ink)", background: on ? "var(--ink)" : "var(--glass2)", border: `1px solid ${on ? "transparent" : "var(--hair)"}`, transition: `background .25s ${SPRING}` }}
              >
                {c.label}
                <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{c.n}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "clamp(56px,8vh,90px) 24px clamp(100px,14vh,160px)", display: "flex", justifyContent: "center" }}>
        <div className="ol-faq-grid" style={{ width: "100%", maxWidth: 1080, gap: "clamp(24px,5vw,72px)", alignItems: "start" }}>
          <aside className="ol-faq-aside" style={{ position: "sticky", top: 110, flexDirection: "column", gap: 4, maxWidth: 300 }}>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "0 0 12px" }}>Showing</div>
            <div aria-live="polite" style={{ fontFamily: "var(--font-display)", fontSize: 64, fontWeight: 600, letterSpacing: "-.06em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{shown}</div>
            <div style={{ fontSize: 15, color: "var(--muted)", marginTop: 6 }}>{shown === 1 ? "answer" : "answers"}{shown !== total ? ` of ${total}` : ""}</div>
            <div style={{ marginTop: 28, fontSize: 14, lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty" }}>Still stuck? A real person answers every email, usually the same day.</div>
            <a href={`mailto:${CONTACT_EMAIL}`} style={{ marginTop: 14, fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{CONTACT_EMAIL} →</a>
          </aside>

          <div style={{ display: "flex", flexDirection: "column", gap: 38, minWidth: 0 }}>
            {groups.map((g) => (
              <div key={g.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <h2 style={{ margin: 0, fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", padding: "0 4px 6px" }}>{g.label}</h2>
                {g.items.map((it) => {
                  // Searching opens every match so the answer that matched is visible.
                  const o = !!open[it.q] || ql.length > 2;
                  const panelId = `faq-${g.id}-${it.q.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
                  return (
                    <div
                      key={it.q}
                      style={{
                        borderRadius: 22,
                        background: o ? "linear-gradient(148deg,var(--refract),transparent 42%),var(--glass)" : "var(--glass2)",
                        border: `1px solid ${o ? "var(--edge)" : "var(--hair)"}`,
                        boxShadow: o ? "inset 0 1px 0 var(--sheen),0 20px 50px -30px var(--tg)" : "none",
                        backdropFilter: "blur(var(--blur)) saturate(1.9)",
                        WebkitBackdropFilter: "blur(var(--blur)) saturate(1.9)",
                        transition: `background .35s ${SPRING},box-shadow .35s,border-color .35s`,
                        overflow: "hidden",
                      }}
                    >
                      <h3 style={{ margin: 0 }}>
                        <button
                          type="button"
                          aria-expanded={o}
                          aria-controls={panelId}
                          onClick={() => setOpen((s) => ({ ...s, [it.q]: !s[it.q] }))}
                          style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 16, width: "100%", boxSizing: "border-box", padding: "20px 22px", textAlign: "left" }}
                        >
                          <span style={{ flex: 1, fontFamily: "var(--font-display)", fontSize: "clamp(17px,1.5vw,20px)", fontWeight: 600, letterSpacing: "-.025em" }}>{it.q}</span>
                          <span aria-hidden style={{ flex: "none", width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", background: o ? "var(--t3)" : "var(--t1)", border: "1px solid var(--tb)", transform: `rotate(${o ? 45 : 0}deg)`, transition: `transform .35s ${SPRING},background .35s` }}>
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M6 1v10M1 6h10" /></svg>
                          </span>
                        </button>
                      </h3>
                      <div id={panelId} style={{ display: "grid", gridTemplateRows: o ? "1fr" : "0fr", transition: `grid-template-rows .45s ${SPRING}` }}>
                        <div style={{ overflow: "hidden" }}>
                          {/* Always in the DOM (collapsed, not removed) so the answers stay crawlable. */}
                          <p style={{ margin: 0, padding: "0 clamp(22px,6vw,70px) 22px 22px", fontSize: 15.5, lineHeight: 1.7, color: "var(--muted)", textWrap: "pretty", opacity: o ? 1 : 0, transition: "opacity .35s" }}>{it.a}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {shown === 0 && (
              <GlassPanel radius={24} padding={32}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-.03em" }}>Nothing matches “{q}”.</div>
                  <div style={{ marginTop: 8, color: "var(--muted)" }}>
                    Try another word — or ask <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "var(--ink)", fontWeight: 600 }}>{CONTACT_EMAIL}</a>.
                  </div>
                </div>
              </GlassPanel>
            )}
          </div>
        </div>
      </section>
    </AuroraPage>
  );
}
