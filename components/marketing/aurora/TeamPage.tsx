"use client";

// ============================================================================
//  components/marketing/aurora/TeamPage.tsx — port of "Olune Team.dc.html".
//  The design reserves a 16:8 slot for a team photo; until one exists the
//  slot shows the eclipse over the aurora instead of an empty placeholder.
// ============================================================================

import { useEffect, useRef, useState } from "react";
import { AuroraPage } from "./chrome";
import { GlassPanel, HeroEyebrow, OluneMark, useReveal } from "./primitives";

const EASE = "cubic-bezier(.16,1,.3,1)";
const STORY =
  "Olune started with frustration. Running a studio meant living inside a patchwork — a class manager here, an accounting app there, a website builder somewhere else, and spreadsheets quietly holding the whole thing together.".split(" ");

const VALUES = [
  ["01", "Studio-run", "Built by people who have actually run a studio term."],
  ["02", "Calm by design", "Every screen made to open, not dread."],
  ["03", "All in one", "Classes, families, money and your site — together."],
] as const;

const glassChip = { padding: "8px 14px", borderRadius: 999, background: "var(--glass)", border: "1px solid var(--edge)", backdropFilter: "blur(var(--blur)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur)) saturate(1.9)", fontSize: 12.5, fontWeight: 600 } as const;
const micro = { fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase" } as const;

export default function TeamPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const storyRef = useRef<HTMLElement | null>(null);
  const [p, setP] = useState(0);
  useReveal(rootRef);

  // Words light up as the sticky story section scrolls past.
  useEffect(() => {
    const onScroll = () => {
      const el = storyRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = r.height - window.innerHeight;
      const next = Math.min(1, Math.max(0, -r.top / t));
      setP((prev) => (Math.abs(next - prev) > 0.004 ? next : prev));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const lit = Math.round(p * 1.15 * STORY.length);

  return (
    <AuroraPage active="team" rootRef={rootRef} footer={{ title: "Follow", accent: "the build.", body: "Olune ships in the open — try it free before general release in December and help shape where it goes next." }}>
      <section style={{ position: "relative", zIndex: 1, padding: "clamp(140px,20vh,200px) 24px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <HeroEyebrow>Meet the team</HeroEyebrow>
        <h1 style={{ margin: "28px 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(48px,7.6vw,120px)", lineHeight: 1.02, letterSpacing: "-.055em", maxWidth: "12ch", animation: `olune-lift 1s .1s ${EASE} backwards` }}>
          The team behind <span style={{ color: "var(--iris)" }}>Olune.</span>
        </h1>
        <p style={{ margin: "24px 0 0", maxWidth: 540, fontSize: "clamp(17px,1.4vw,19px)", lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty", animation: `olune-rise .9s .3s ${EASE} both` }}>
          Not built by a boardroom. Built hands-on, every day, by a small team who lived the problem it solves.
        </p>

        <div style={{ position: "relative", width: "100%", maxWidth: 1180, marginTop: "clamp(56px,9vh,90px)", animation: `olune-lift 1.2s .5s ${EASE} backwards` }}>
          <GlassPanel level="raised" radius={32} padding={12}>
            <div data-base="dark" style={{ position: "relative", aspectRatio: "16/8", minHeight: 300, borderRadius: 24, overflow: "hidden", background: "radial-gradient(70% 90% at 78% 20%,rgba(140,132,255,.45),transparent 60%),radial-gradient(60% 70% at 12% 90%,rgba(110,200,190,.28),transparent 60%),radial-gradient(40% 50% at 40% 40%,rgba(242,183,136,.18),transparent 60%),var(--midnight)", display: "grid", placeItems: "center" }}>
              <OluneMark variant="corona" theme="dark" word={false} markSize="clamp(130px,18vw,240px)" />
              <div style={{ position: "absolute", left: 16, bottom: 16, display: "flex", flexWrap: "wrap", gap: 8, pointerEvents: "none", color: "var(--ink)" }}>
                <span style={glassChip}>Founding team</span>
                <span style={glassChip}>New Zealand</span>
              </div>
            </div>
          </GlassPanel>
        </div>
      </section>

      <section ref={storyRef} aria-label="Why Olune exists" style={{ position: "relative", zIndex: 1, height: "260vh" }}>
        <div style={{ position: "sticky", top: 0, height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 24px" }}>
          <div style={{ width: "100%", maxWidth: 1000 }}>
            <h2 style={{ ...micro, margin: 0, color: "var(--muted)", letterSpacing: ".18em" }}>Why Olune exists</h2>
            <p style={{ margin: "22px 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(26px,3.4vw,50px)", lineHeight: 1.2, letterSpacing: "-.035em", textWrap: "pretty" }}>
              {STORY.map((w, i) => (
                <span key={i} style={{ color: i < lit ? "var(--ink)" : "color-mix(in srgb, var(--ink) 16%, transparent)", transition: "color .4s cubic-bezier(.32,.72,0,1)" }}>
                  {w}{" "}
                </span>
              ))}
            </p>
            <div aria-hidden style={{ marginTop: 36, height: 3, maxWidth: 260, borderRadius: 3, background: "var(--hair)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: "var(--iris)", width: `${Math.min(100, p * 115).toFixed(1)}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "clamp(60px,10vh,120px) 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,320px),1fr))", gap: 16 }}>
          <div data-reveal="0">
            <GlassPanel radius={28} padding={32} style={{ height: "100%" }}>
              <h3 style={{ ...micro, margin: 0, color: "var(--muted)" }}>The breaking point</h3>
              <p style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.7, color: "var(--muted)", textWrap: "pretty" }}>
                Evenings lost to chasing fees. Registers that never made it back to the office. A website still showing last year’s timetable because changing it meant waiting on someone else. Four subscriptions, none of them talking — and the teaching buried under the admin.
              </p>
            </GlassPanel>
          </div>
          <div data-reveal="100">
            <GlassPanel level="raised" glow radius={28} padding={32} style={{ height: "100%" }}>
              <h3 style={{ ...micro, margin: 0, color: "var(--iris)" }}>So we built it</h3>
              <p style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.7, color: "var(--muted)", textWrap: "pretty" }}>
                We stopped duct-taping and started building. One calm home for the classes, the families, the money and the studio website — made in New Zealand and shaped daily by the studios using it.
              </p>
            </GlassPanel>
          </div>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "clamp(60px,12vh,140px) 24px", display: "flex", justifyContent: "center", textAlign: "center" }}>
        <figure data-reveal="0" style={{ margin: 0, maxWidth: 1000, display: "flex", flexDirection: "column", alignItems: "center" }}>
          <OluneMark variant="crescent" word={false} markSize="56px" />
          <blockquote style={{ margin: "34px 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(32px,4.6vw,68px)", lineHeight: 1.08, letterSpacing: "-.045em", textWrap: "balance" }}>
            “We built Olune because the admin was eating the work we <span style={{ color: "var(--iris)" }}>actually loved.</span>”
          </blockquote>
          <figcaption style={{ marginTop: 22, fontSize: 14, color: "var(--muted)" }}>The Olune founding team</figcaption>
        </figure>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "0 24px clamp(100px,14vh,160px)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,280px),1fr))", gap: 16 }}>
          {VALUES.map(([n, title, body], i) => (
            <div key={n} data-reveal={String(i * 90)} className="ol-lift">
              <GlassPanel radius={26} padding={28} style={{ height: "100%" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--iris)", fontVariantNumeric: "tabular-nums" }}>{n}</div>
                <h3 style={{ margin: "44px 0 0", fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-.04em" }}>{title}</h3>
                <div style={{ fontSize: 15, lineHeight: 1.6, color: "var(--muted)", marginTop: 8, textWrap: "pretty" }}>{body}</div>
              </GlassPanel>
            </div>
          ))}
        </div>
      </section>
    </AuroraPage>
  );
}
