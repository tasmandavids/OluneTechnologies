"use client";

// ============================================================================
//  components/marketing/aurora/CardPage.tsx — port of "Olune Card.dc.html".
//  A draggable 3D membership card that changes material per tier, the tier
//  ladder, an auto-cycling "tap" demo, and the case for the card.
// ============================================================================

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { AuroraPage } from "./chrome";
import { GlassPanel, HeroEyebrow, OluneMark, h2Style, microLabel, useReveal } from "./primitives";
import { CompareTable, StatGrid } from "./sections";

const EASE = "cubic-bezier(.16,1,.3,1)";
const SPRING = "cubic-bezier(.32,.72,0,1)";
const STEP_MS = 2600;

const TIERS = [
  { name: "Bronze", at: "Day one", bg: "linear-gradient(135deg,#5a3720 0%,#b98154 28%,#ecc39b 46%,#a56c40 66%,#4a2c17 100%)", ink: "#fff6ec", dot: "#b98154", glow: "rgba(214,150,96,.45)", irid: 0, mark: "dark", line: "Day one. The first card, and it isn’t plastic.", desc: "Issued the day a family enrols. Warm brushed bronze, matte back, in the app before the first class." },
  { name: "Silver", at: "1 year", bg: "linear-gradient(135deg,#7d818b 0%,#d9dce2 30%,#f7f8fa 46%,#a9adb6 66%,#5d6169 100%)", ink: "#1b1a2a", dot: "#b9bcc4", glow: "rgba(190,196,210,.55)", irid: 0, mark: "light", line: "One year. Cool metal, sharper edge.", desc: "One year with the studio. Cool brushed silver with a sharper edge — reissued automatically on the anniversary." },
  { name: "Gold", at: "3 years", bg: "linear-gradient(135deg,#6b4c10 0%,#d4a940 28%,#fbe7a6 46%,#b8871f 66%,#553a08 100%)", ink: "#2a1d04", dot: "#d4a940", glow: "rgba(230,190,90,.5)", irid: 0, mark: "light", line: "Three years. Warm, deep, unmistakable.", desc: "Three years in. Warm and deep — the card families notice in each other’s bags." },
  { name: "Platinum", at: "5 years", bg: "linear-gradient(135deg,#3f4248 0%,#a7abb3 28%,#eceef2 46%,#868a93 66%,#2f3237 100%)", ink: "#121218", dot: "#a7abb3", glow: "rgba(170,176,190,.5)", irid: 0.35, mark: "light", line: "Five years. Quiet, heavy, cold to the touch.", desc: "Five years. Quiet and heavy, with a faint iridescence that only shows when it moves." },
  { name: "Diamond", at: "10 years", bg: "linear-gradient(135deg,#14132a 0%,#2f2b6e 30%,#8f8ae0 48%,#2a2763 66%,#0e0d20 100%)", ink: "#f4f2ff", dot: "#8f8ae0", glow: "rgba(140,132,255,.55)", irid: 1, mark: "dark", line: "Ten years, by invitation. The studio’s own eclipse, in glass.", desc: "Ten years, by invitation from the director. The studio’s own eclipse, cut in glass." },
] as const;

const STEPS = ["The card lives in the app", "Tap — no unlock, no app hunt", "Logged, and the family knows"];

const STATS = [
  ["1", "tap", "No clipboard, no queue", "The register fills itself as families arrive. Nobody reads names off a list."],
  ["In & out", "timestamped", "Arrival and departure, both logged", "Pickup time is recorded, not remembered — with auto check-out after class."],
  ["0 s", "to notify", "Parents know before they ask", "The moment the card reads, the notice goes to whoever is on pickup."],
  ["5", "tiers", "It is worth keeping", "Bronze on the day they enrol, diamond at ten. Loyalty becomes something to carry."],
] as const;

const COMPARE = [
  ["Family arrives", "Tap — logged, parents notified", "Teacher marks a paper roll"],
  ["Pickup at the door", "Tap out, time recorded", "Nobody is sure when they left"],
  ["End-of-term report", "Already complete", "Retyped from the rolls"],
  ["Ten years with the studio", "A diamond card from the director", "A thank-you in the newsletter"],
] as const;

const faceBase: CSSProperties = { position: "absolute", inset: 0, borderRadius: 22, backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", overflow: "hidden", transition: "background .8s,color .8s", textAlign: "left" };
const micro: CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", opacity: 0.75 };

export default function CardPage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const motion = useRef({ rot: 0, target: 0, tx: 0, ty: 0, cx: 0, cy: 0, drag: null as null | { x: number; r: number } });
  const stepAt = useRef(0);
  const [tier, setTier] = useState(0);
  const [step, setStep] = useState(0);
  useReveal(rootRef);

  useEffect(() => {
    const m = motion.current;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onMove = (e: PointerEvent) => {
      if (m.drag) {
        m.rot = m.drag.r + (e.clientX - m.drag.x) * 0.55;
        return;
      }
      const st = stageRef.current;
      if (!st) return;
      const r = st.getBoundingClientRect();
      m.tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / r.width));
      m.ty = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / r.height));
    };
    const onUp = () => {
      if (!m.drag) return;
      m.drag = null;
      m.target = Math.round(m.rot / 180) * 180;
      if (stageRef.current) stageRef.current.style.cursor = "grab";
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    stepAt.current = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      if (!m.drag) m.rot += (m.target - m.rot) * 0.09;
      m.cx += (m.tx - m.cx) * 0.08;
      m.cy += (m.ty - m.cy) * 0.08;
      const c = cardRef.current;
      if (c) {
        c.style.transform = `rotateX(${(-m.cy * 10).toFixed(2)}deg) rotateY(${(m.rot + m.cx * 14).toFixed(2)}deg)`;
        c.style.setProperty("--gx", (50 + m.cx * 40 + (m.rot % 360) * 0.15).toFixed(1) + "%");
        c.style.setProperty("--ga", (((reduced ? 0 : t * 0.02) + m.rot) % 360).toFixed(1) + "deg");
      }
      if (!reduced && t - stepAt.current > STEP_MS) {
        stepAt.current = t;
        setStep((s) => (s + 1) % 3);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const T = TIERS[tier];
  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    motion.current.drag = { x: e.clientX, r: motion.current.rot };
    e.currentTarget.style.cursor = "grabbing";
  };
  const flip = () => {
    const m = motion.current;
    m.target = (Math.round(m.rot / 180) + 1) * 180;
  };
  const pickStep = (i: number) => {
    stepAt.current = performance.now();
    setStep(i);
  };
  const miniCard = (bg: string, ink: string, width: number | string, children: ReactNode) => (
    <div style={{ width, aspectRatio: "1.586", borderRadius: 14, background: bg, color: ink, boxShadow: "0 24px 40px -24px rgba(27,26,56,.5),inset 0 1px 0 rgba(255,255,255,.4)", padding: "12px 14px", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", fontFamily: "var(--font-display)", textAlign: "left" }}>
      {children}
    </div>
  );

  return (
    <AuroraPage active="card" rootRef={rootRef} footer={{ title: "Start counting", accent: "the years now.", body: "Everything is free to use until general release in December — set your studio up now and the ladder starts from the terms you already have on file." }}>
      <section style={{ position: "relative", zIndex: 1, padding: "clamp(130px,17vh,180px) 24px clamp(60px,10vh,110px)", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
        <HeroEyebrow>Membership · NFC check-in</HeroEyebrow>
        <h1 style={{ margin: "28px 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(48px,7.6vw,120px)", lineHeight: 1.02, letterSpacing: "-.055em", animation: `olune-lift 1s .1s ${EASE} backwards` }}>
          The check-in card, <span style={{ color: "var(--iris)" }}>earned.</span>
        </h1>
        <p style={{ margin: "24px 0 0", maxWidth: 580, fontSize: "clamp(17px,1.4vw,19px)", lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty", animation: `olune-rise .9s .3s ${EASE} both` }}>
          One tap at the door. Arrival and departure logged, parents notified, attendance done. And the card changes material as the years add up.
        </p>

        <div style={{ position: "relative", marginTop: "clamp(50px,8vh,80px)", width: "100%", maxWidth: 1180, display: "flex", flexWrap: "wrap", justifyContent: "center", alignItems: "center", gap: "clamp(36px,6vw,90px)", animation: `olune-lift 1.2s .45s ${EASE} backwards` }}>
          <div style={{ position: "relative", flex: "0 1 520px", display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div aria-hidden style={{ position: "absolute", inset: "-16% -8%", borderRadius: "50%", background: `radial-gradient(circle,${T.glow},transparent 62%)`, transition: "background .8s" }} />
            <div ref={stageRef} onPointerDown={onDown} role="img" aria-label={`${T.name} Olune check-in card for Ana Okafor`} style={{ position: "relative", width: "min(480px,86vw)", aspectRatio: "1.586", perspective: 1400, cursor: "grab", touchAction: "pan-y", userSelect: "none" }}>
              <div ref={cardRef} style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", willChange: "transform" }}>
                {/* front */}
                <div style={{ ...faceBase, background: T.bg, color: T.ink, boxShadow: "0 40px 80px -30px rgba(27,26,56,.55),inset 0 1px 0 rgba(255,255,255,.4),inset 0 0 0 1px rgba(255,255,255,.18)" }}>
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(115deg,transparent 30%,rgba(255,255,255,.55) 48%,transparent 62%)", backgroundSize: "250% 100%", backgroundPosition: "var(--gx,50%) 0", mixBlendMode: "soft-light" }} />
                  <div style={{ position: "absolute", inset: 0, opacity: T.irid, background: "conic-gradient(from var(--ga,0deg) at 70% 30%,rgba(220,217,250,.5),rgba(155,215,200,.45),rgba(242,183,136,.4),rgba(166,162,232,.5),rgba(220,217,250,.5))", mixBlendMode: "overlay", transition: "opacity .8s" }} />
                  <div style={{ position: "relative", height: "100%", boxSizing: "border-box", padding: "clamp(18px,4.5%,28px)", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <OluneMark variant="crescent" theme={T.mark} size={20} />
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase" }}>{T.name}</span>
                    </div>
                    <div style={{ flex: 1 }} />
                    <div style={micro}>Studio access</div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(22px,5vw,30px)", fontWeight: 600, letterSpacing: "-.035em", marginTop: 4 }}>Ana Okafor</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8, marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                      <span>Member since 2026 · Ellerslie</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, whiteSpace: "nowrap" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden><path d="M8.5 7a7 7 0 0 1 0 10M12 4.5a11 11 0 0 1 0 15M5 9.5a3.5 3.5 0 0 1 0 5" /></svg>
                        Tap to check in
                      </span>
                    </div>
                  </div>
                </div>
                {/* back */}
                <div style={{ ...faceBase, transform: "rotateY(180deg)", background: T.bg, color: T.ink, boxShadow: "0 40px 80px -30px rgba(27,26,56,.55),inset 0 0 0 1px rgba(255,255,255,.18)" }}>
                  <div style={{ position: "absolute", inset: 0, background: "rgba(10,10,16,.18)" }} />
                  <div style={{ position: "relative", height: "100%", boxSizing: "border-box", padding: "clamp(18px,4.5%,28px)", display: "flex", flexDirection: "column" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <OluneMark variant="corona" theme="dark" word={false} markSize="54px" />
                      <div>
                        <div style={micro}>Arrive · depart</div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600, letterSpacing: "-.03em", marginTop: 2 }}>Hold your phone to the moon.</div>
                      </div>
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.5, opacity: 0.85, marginTop: 12, maxWidth: "34ch" }}>One tap in. One tap out. Attendance and pickup are logged the moment it reads.</div>
                    <div style={{ flex: 1 }} />
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8, fontSize: 11.5 }}>
                      <div>
                        <div style={{ opacity: 0.7 }}>Card no.</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, letterSpacing: ".08em", marginTop: 2 }}>4021 8890 1147</div>
                      </div>
                      <span style={{ opacity: 0.7 }}>Lost? Freeze it in the app.</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 22, fontSize: 12.5, color: "var(--muted)", alignItems: "center" }}>
              <span>Drag to spin</span>
              <span aria-hidden style={{ opacity: 0.4 }}>·</span>
              <button type="button" onClick={flip} style={{ all: "unset", cursor: "pointer", fontWeight: 600, color: "var(--ink)" }}>Flip card →</button>
            </div>
          </div>

          <div style={{ flex: "1 1 320px", maxWidth: 400, textAlign: "left" }}>
            <GlassPanel level="raised" radius={26} padding={22}>
              <div role="radiogroup" aria-label="Card tier" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TIERS.map((t, i) => (
                  <button
                    key={t.name}
                    type="button"
                    role="radio"
                    aria-checked={i === tier}
                    aria-label={t.name}
                    onClick={() => setTier(i)}
                    className="ol-hover-scale"
                    style={{ all: "unset", cursor: "pointer", width: 38, height: 38, borderRadius: "50%", background: t.bg, boxShadow: i === tier ? "0 0 0 3px var(--surface),0 0 0 5px var(--iris)" : "inset 0 0 0 1px rgba(255,255,255,.3)", transition: `box-shadow .3s ${SPRING},transform .3s` }}
                  />
                ))}
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)", marginTop: 22 }}>Tier {tier + 1} of 5 · {T.at}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 38, fontWeight: 600, letterSpacing: "-.05em", marginTop: 6 }}>{T.name}</div>
              <p style={{ margin: "10px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty" }}>{T.desc}</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 18 }}>
                <div style={{ borderRadius: 16, padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--hair)" }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Unlocks at</div><div style={{ fontSize: 16, fontWeight: 700 }}>{T.at}</div></div>
                <div style={{ borderRadius: 16, padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--hair)" }}><div style={{ fontSize: 11, color: "var(--muted)" }}>Rewards</div><div style={{ fontSize: 16, fontWeight: 700 }}>Set by you</div></div>
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>

      {/* the ladder */}
      <section style={{ position: "relative", zIndex: 1, padding: "clamp(60px,10vh,120px) 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180 }}>
          <div data-reveal="0" style={microLabel}>Five materials</div>
          <h2 data-reveal="60" style={{ ...h2Style, margin: "14px 0 0" }}>The <span style={{ color: "var(--iris)" }}>ladder.</span></h2>
          <p data-reveal="120" style={{ margin: "18px 0 0", maxWidth: 560, fontSize: 17, lineHeight: 1.65, color: "var(--muted)", textWrap: "pretty" }}>
            Years count from a member’s first enrolled term. Cards reissue automatically. What a tier is worth is set by the studio — Olune neither sets nor funds any of it.
          </p>
          <div style={{ position: "relative", marginTop: 56, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,190px),1fr))", gap: 16 }}>
            {TIERS.map((t, i) => (
              <button
                key={t.name}
                type="button"
                data-reveal={String(i * 80)}
                onClick={() => {
                  setTier(i);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className="ol-lift-lg"
                style={{ all: "unset", cursor: "pointer", display: "flex", flexDirection: "column", gap: 14 }}
              >
                {miniCard(t.bg, t.ink, "100%", <>
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "-.04em" }}>olune</span>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase" }}>{t.name}</span>
                </>)}
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 9, height: 9, borderRadius: "50%", background: t.dot, boxShadow: "0 0 0 4px var(--t1)" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" }}>{t.at}</span>
                </span>
                <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--ink)", textWrap: "pretty" }}>{t.line}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* the tap */}
      <section style={{ position: "relative", zIndex: 1, padding: "clamp(60px,10vh,120px) 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180, display: "flex", flexWrap: "wrap", gap: "clamp(36px,6vw,90px)", alignItems: "center" }}>
          <div style={{ flex: "1 1 340px", maxWidth: 460 }}>
            <div data-reveal="0" style={microLabel}>At the door</div>
            <h2 data-reveal="60" style={{ ...h2Style, margin: "14px 0 0" }}>The <span style={{ color: "var(--iris)" }}>tap.</span></h2>
            <p data-reveal="120" style={{ margin: "18px 0 0", fontSize: 17, lineHeight: 1.65, color: "var(--muted)" }}>Three seconds at the door — phone out, phone away.</p>
            <div data-reveal="180" role="tablist" aria-label="Check-in steps" style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 8 }}>
              {STEPS.map((label, i) => {
                const on = i === step;
                return (
                  <button key={label} type="button" role="tab" aria-selected={on} onClick={() => pickStep(i)} style={{ all: "unset", cursor: "pointer", position: "relative", overflow: "hidden", display: "flex", gap: 16, alignItems: "center", padding: "16px 18px", borderRadius: 18, background: on ? "var(--glass)" : "transparent", border: `1px solid ${on ? "var(--edge)" : "transparent"}`, transition: `background .35s ${SPRING},border-color .35s` }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: on ? "var(--iris)" : "var(--muted)" }}>0{i + 1}</span>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, letterSpacing: "-.02em", color: on ? "var(--ink)" : "var(--muted)" }}>{label}</span>
                    <span aria-hidden style={{ position: "absolute", left: 0, bottom: 0, height: 2, background: "var(--iris)", width: on ? "100%" : "0%" }} />
                  </button>
                );
              })}
            </div>
          </div>
          <div data-reveal="100" style={{ flex: "1 1 400px", display: "flex", justifyContent: "center" }}>
            <GlassPanel level="raised" radius={40} padding={22} style={{ width: "min(380px,90vw)", boxSizing: "border-box" }}>
              <div role="tabpanel" aria-live="polite" style={{ height: 440, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14 }}>
                {step === 0 && (
                  <div key="s0" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, animation: `olune-rise .5s ${EASE} both` }}>
                    <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>Access · Ana Okafor</div>
                    {miniCard(T.bg, T.ink, 250, <>
                      <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-.04em" }}>olune</span>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>Ana Okafor</span>
                    </>)}
                    <div style={{ borderRadius: 16, padding: "12px 16px", background: "var(--surface)", border: "1px solid var(--hair)", textAlign: "left", width: 250, boxSizing: "border-box" }}>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>Up next</div>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>Senior contemporary · 6:00 pm</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>Studio 2 · with Marta</div>
                    </div>
                  </div>
                )}
                {step === 1 && (
                  <div key="s1" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, animation: `olune-rise .5s ${EASE} both` }}>
                    <div style={{ position: "relative", width: 140, height: 140, display: "grid", placeItems: "center" }}>
                      <span aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid var(--iris)", animation: "ol-ping 1.6s ease-out infinite" }} />
                      <span aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid var(--iris)", animation: "ol-ping 1.6s .5s ease-out infinite" }} />
                      <OluneMark variant="corona" word={false} markSize="110px" />
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 600, letterSpacing: "-.035em" }}>Reading…</div>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>Studio 2 · Ellerslie</div>
                    </div>
                  </div>
                )}
                {step === 2 && (
                  <div key="s2" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: "100%", animation: `olune-rise .5s ${EASE} both` }}>
                    <div style={{ width: 64, height: 64, borderRadius: "50%", display: "grid", placeItems: "center", background: "var(--success)", color: "#fff" }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-.045em" }}>You’re in.</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginTop: -8 }}>Checked in 5:58 pm · 2 min early</div>
                    <div style={{ width: "100%", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--hair)", textAlign: "left", marginTop: 6 }}>
                      {[["Class", "Senior contemporary"], ["Room", "Studio 2"], ["Pickup notice", "Sent to Dad"]].map(([k, v], i) => (
                        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "11px 14px", borderBottom: i < 2 ? "1px solid var(--hair)" : undefined, fontSize: 13 }}>
                          <span style={{ color: "var(--muted)" }}>{k}</span>
                          <b style={{ fontWeight: 600, color: i === 2 ? "var(--success)" : undefined }}>{v}</b>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </GlassPanel>
          </div>
        </div>
      </section>

      {/* why a card */}
      <section style={{ position: "relative", zIndex: 1, padding: "clamp(60px,10vh,120px) 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180 }}>
          <h2 data-reveal="0" style={{ ...h2Style, maxWidth: "15ch" }}>The doorway is where studios <span style={{ color: "var(--iris)" }}>lose time.</span></h2>
          <StatGrid stats={STATS} />
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "clamp(60px,10vh,120px) 24px clamp(100px,14vh,160px)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1000 }}>
          <h2 data-reveal="0" style={{ ...h2Style, textAlign: "center" }}>What the tap <span style={{ color: "var(--iris)" }}>replaces.</span></h2>
          <CompareTable heads={["The moment", "With the card", "Without it"]} rows={COMPARE} />
          <p data-reveal="0" style={{ margin: "28px auto 0", maxWidth: 640, textAlign: "center", fontSize: 13.5, lineHeight: 1.65, color: "var(--muted)", textWrap: "pretty" }}>
            The check-in card is in design. It rides on the membership records Olune already keeps, so the ladder counts from the first term you enrol — not from the day it ships.
          </p>
        </div>
      </section>
    </AuroraPage>
  );
}
