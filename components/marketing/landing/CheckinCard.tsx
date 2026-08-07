"use client";

// ============================================================================
//  components/marketing/landing/CheckinCard.tsx
//  The Olune check-in card — a draggable, flippable 3D membership card that
//  changes material as a family's years with the studio add up. Ported 1:1
//  from the Claude Design Studio export ("Checkin Card.dc.html"): same five
//  tiers, same copy, same materials, same drag/flip physics.
//
//  Two things are re-pointed for the marketing site, exactly as the phone
//  showcase does it: the design's glass/aurora chrome becomes the landing's
//  light paper surfaces, and the #b9b5ee tint becomes the landing's #8b7cf0.
//  The card materials themselves (bronze → diamond) are verbatim.
//
//  Tier state lives in the page (CardPageClient) because three separate
//  sections read it — the stage, the ladder and the tap flow.
//
//  Inline styles like the rest of the landing tree; hover/keyframes live in
//  styles/landing-design.css.
// ============================================================================

import { useEffect, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { DISPLAY, BODY } from "@/components/marketing/landing/chrome";

// ── palette ───────────────────────────────────────────────────────────────
const ACCENT = "#8b7cf0";
const NAVY = "#1a1535";
const MUTED = "rgba(26,21,53,0.6)";
const HAIR = "rgba(26,21,53,0.08)";
const RING = "rgba(26,21,53,0.14)";

/** The design's tint ramp, recomputed on the landing accent (139,124,240). */
const T1 = "rgba(139,124,240,0.13)";
const T2 = "rgba(139,124,240,0.22)";
const TB = "rgba(139,124,240,0.46)";
const TG = "rgba(139,124,240,0.62)";

const MICRO: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" };
const resetBtn: CSSProperties = { border: "none", background: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" };

// ── the ladder (verbatim from the design export) ──────────────────────────
export type Tier = {
  key: string;
  name: string;
  rank: string;
  years: string;
  badge: string;
  tagline: string;
  blurb: string;
  since: string;
  id: string;
  number: string;
  taps: string;
  next: string;
  tapNote: string;
  perks: string[];
  m: [string, string, string];
  fx: string;
  ct: string;
  prism: number;
};

export const TIERS: Tier[] = [
  {
    key: "bronze", name: "Bronze", rank: "1", years: "3 years", badge: "Bronze · 3 yrs",
    tagline: "Three years in. The first card that isn’t plastic.",
    blurb: "Earned at the third enrolment anniversary. Warm brushed bronze, matte back, reissued the day it unlocks.",
    since: "2023", id: "Ellerslie", number: "4021 8890 1147", taps: "184",
    next: "Silver at five years — 1 yr 4 mo to go.",
    tapNote: "Bronze: two guest passes left this year.",
    perks: ["Two guest passes a year", "48-hour priority booking", "Free annual costume fitting", "Attendance history in the app"],
    m: ["#3a2416", "#a4713c", "#f0be86"], fx: "#ffdcae", ct: "#fff6ec", prism: 0,
  },
  {
    key: "silver", name: "Silver", rank: "2", years: "5 years", badge: "Silver · 5 yrs",
    tagline: "Five years. Cool metal, sharper edge.",
    blurb: "Polished silver with a mirrored bevel. Cool where bronze was warm, and it catches the light at the door.",
    since: "2021", id: "Ellerslie", number: "4021 8890 2036", taps: "296",
    next: "Gold at eight years — 2 yr 7 mo to go.",
    tapNote: "Silver: booking opens 5 days before general release.",
    perks: ["Four guest passes a year", "5-day priority booking", "10% off holiday programmes", "One missed class rolls over each term"],
    m: ["#464b54", "#a3abb6", "#f7f9fc"], fx: "#ffffff", ct: "#20202c", prism: 0,
  },
  {
    key: "gold", name: "Gold", rank: "3", years: "8 years", badge: "Gold · 8 yrs",
    tagline: "Eight years. Warm, deep, unmistakable.",
    blurb: "Struck gold with a hairline guilloche. Eight years is longer than most families stay anywhere.",
    since: "2018", id: "Ellerslie", number: "4021 8890 3312", taps: "451",
    next: "Platinum at twelve years — 3 yr 2 mo to go.",
    tapNote: "Gold: your reserved concert seat is held until 7:15 pm.",
    perks: ["Six guest passes a year", "7-day priority booking", "One private lesson a year", "Reserved concert seating"],
    m: ["#3d2b06", "#c1972f", "#ffeaa8"], fx: "#fff6d2", ct: "#2b1f04", prism: 0,
  },
  {
    key: "platinum", name: "Platinum", rank: "4", years: "12 years", badge: "Platinum · 12 yrs",
    tagline: "Twelve years. Quiet, heavy, cold to the touch.",
    blurb: "Sandblasted platinum on midnight. Heavier in the hand, quieter in the light, twelve years in the making.",
    since: "2014", id: "Ellerslie", number: "4021 8890 4488", taps: "612",
    next: "Diamond at fifteen years — by invitation, 2 yr 9 mo to go.",
    tapNote: "Platinum: 1 h 40 m of private studio time left this month.",
    perks: ["Unlimited guest passes", "First-look enrolment, every term", "Two private studio hours a month", "Family fees capped for life"],
    m: ["#15181f", "#4e5666", "#bcc6d8"], fx: "#eaf0f9", ct: "#f3f5fa", prism: 0,
  },
  {
    key: "diamond", name: "Diamond", rank: "5", years: "15 years · invitation", badge: "Diamond · invitation",
    tagline: "Fifteen years. The studio’s own eclipse, in glass.",
    blurb: "Faceted glass over midnight, refracting the moon. Issued by the studio director, never requested.",
    since: "2011", id: "Ellerslie", number: "4021 8890 0001", taps: "823",
    next: "The top of the ladder. There is nothing after Diamond.",
    tapNote: "Diamond: this term is on the house. Nothing to pay.",
    perks: ["By invitation — fifteen years with the studio", "Named on the studio wall", "Standing front-row concert seats", "A term on the house, every year"],
    m: ["#0b0a14", "#332f5c", "#928de6"], fx: "#e8e5ff", ct: "#f7f5ff", prism: 1,
  },
];

export const MEMBER_NAME = "Ana Okafor";

/** The material of a tier, as the custom properties every card face reads. */
export function tierVars(t: Tier): CSSProperties {
  return {
    "--m1": t.m[0], "--m2": t.m[1], "--m3": t.m[2],
    "--fx": t.fx, "--ct": t.ct, "--prism": String(t.prism),
  } as CSSProperties;
}

/** The NFC arcs that sit on every face of the card. */
function NfcMark({ size, width = 1.5 }: { size: number; width?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5.5 3.6a13.5 13.5 0 0 1 0 16.8" stroke="currentColor" strokeWidth={width} strokeLinecap="round" />
      <path d="M10 6.6a8.6 8.6 0 0 1 0 10.8" stroke="currentColor" strokeWidth={width} strokeLinecap="round" />
      <path d="M14.5 9.6a3.9 3.9 0 0 1 0 4.8" stroke="currentColor" strokeWidth={width} strokeLinecap="round" />
    </svg>
  );
}

// ══ 1 · the stage ═════════════════════════════════════════════════════════
// Drag to spin, release to keep spinning, "Flip card" snaps to the next face.
// The rotation lives outside React state (rAF writes the transform straight
// to the node) — re-rendering 60 times a second would fight the pointer.

type Rot = { x: number; y: number; vy: number; drag: boolean; lx: number; ly: number };

export function CheckinCardStage({ tier, index, onSelect }: { tier: Tier; index: number; onSelect: (i: number) => void }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const rot = useRef<Rot>({ x: -9, y: -24, vy: 0, drag: false, lx: 0, ly: 0 });
  const flipTo = useRef<number | null>(null);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const calm = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tick = () => {
      const r = rot.current;
      if (flipTo.current != null) {
        r.y += (flipTo.current - r.y) * 0.14;
        r.vy = 0;
        if (Math.abs(flipTo.current - r.y) < 0.3) { r.y = flipTo.current; flipTo.current = null; }
      } else if (!r.drag) {
        const base = calm ? 0 : 0.06;
        r.vy += (base - r.vy) * 0.035;
        r.y += r.vy;
        r.x += (-9 - r.x) * 0.05;
      }
      const el = cardRef.current;
      if (el) {
        el.style.transform = `rotateX(${r.x.toFixed(2)}deg) rotateY(${r.y.toFixed(2)}deg)`;
        const a = (r.y * Math.PI) / 180;
        el.style.setProperty("--sx", `${(50 + 46 * Math.sin(a)).toFixed(1)}%`);
        el.style.setProperty("--sop", (0.28 + 0.55 * Math.abs(Math.cos(a))).toFixed(3));
      }
      raf.current = requestAnimationFrame(tick);
    };

    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, []);

  function onDown(e: ReactPointerEvent<HTMLDivElement>) {
    const r = rot.current;
    r.drag = true; r.lx = e.clientX; r.ly = e.clientY;
    flipTo.current = null;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.style.cursor = "grabbing";
  }

  function onMove(e: ReactPointerEvent<HTMLDivElement>) {
    const r = rot.current;
    if (!r.drag) return;
    const dx = e.clientX - r.lx;
    const dy = e.clientY - r.ly;
    r.y += dx * 0.55;
    r.x = Math.max(-58, Math.min(58, r.x - dy * 0.35));
    r.vy = dx * 0.55;
    r.lx = e.clientX; r.ly = e.clientY;
  }

  function onUp(e: ReactPointerEvent<HTMLDivElement>) {
    rot.current.drag = false;
    e.currentTarget.style.cursor = "grab";
  }

  function flip() {
    flipTo.current = (Math.round(rot.current.y / 180) + 1) * 180;
  }

  const faceBase: CSSProperties = { position: "absolute", inset: 0, borderRadius: 26, overflow: "hidden", backfaceVisibility: "hidden" };

  return (
    <div style={{ background: "#ffffff", border: `1px solid ${HAIR}`, borderRadius: 28, padding: "26px 28px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <span style={{ ...MICRO, color: MUTED }}>Card · drag to spin</span>
        <button
          type="button"
          onClick={flip}
          className="dcl-cc-flip"
          style={{ ...resetBtn, border: `1px solid ${TB}`, background: T2, color: NAVY, fontFamily: BODY, fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 9999, transition: "transform .22s cubic-bezier(.32,.72,0,1), box-shadow .22s" }}
        >
          Flip card →
        </button>
      </div>

      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        style={{ position: "relative", height: "clamp(276px, 74vw, 392px)", perspective: 1500, perspectiveOrigin: "50% 44%", cursor: "grab", touchAction: "none", userSelect: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
      >
        <div style={{ ...tierVars(tier), position: "relative", width: "min(520px, 96%)", aspectRatio: "520 / 328" }}>
          {/* cast shadow on the panel below */}
          <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: 26, background: "radial-gradient(ellipse at 50% 50%, rgba(24,22,40,.34), transparent 68%)", filter: "blur(26px)", transform: "translateY(46%) scaleY(.22)" }} />

          <div style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", animation: "ccBob 7s ease-in-out infinite" }}>
            <div ref={cardRef} style={{ position: "absolute", inset: 0, transformStyle: "preserve-3d", transform: "rotateX(-9deg) rotateY(-24deg)", willChange: "transform" }}>

              {/* ── front ── */}
              <div style={{ ...faceBase, transform: "translateZ(3px)", background: "linear-gradient(148deg, var(--m1), var(--m2) 46%, var(--m3))", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.22), inset 0 1px 0 rgba(255,255,255,.4)" }}>
                <div aria-hidden style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(114deg, rgba(255,255,255,.075) 0 1px, transparent 1px 8px)" }} />
                <div aria-hidden style={{ position: "absolute", inset: 0, mixBlendMode: "soft-light", opacity: 0.85, background: "conic-gradient(from 128deg at 62% 38%, rgba(255,255,255,.6), rgba(0,0,0,.35) 22%, rgba(255,255,255,.45) 44%, rgba(0,0,0,.3) 68%, rgba(255,255,255,.55))" }} />
                <div aria-hidden style={{ position: "absolute", right: "-13.8%", bottom: "-29.3%", width: "65.4%", aspectRatio: "1", borderRadius: "50%", overflow: "hidden", opacity: 0.2, background: "radial-gradient(circle at 34% 30%, var(--fx), transparent 72%)", boxShadow: "inset 0 0 0 1px var(--fx)" }}>
                  <div style={{ position: "absolute", left: "30.6%", top: "-15.3%", width: "100%", aspectRatio: "1", borderRadius: "50%", background: "var(--m1)" }} />
                </div>
                <div aria-hidden style={{ position: "absolute", inset: 7, borderRadius: 19, border: "1px solid var(--fx)", opacity: 0.34, pointerEvents: "none" }} />
                <div aria-hidden style={{ position: "absolute", inset: 0, opacity: "var(--prism)", mixBlendMode: "overlay", background: "conic-gradient(from 205deg at 32% 18%, rgba(255,208,224,.62), rgba(186,222,255,.55), rgba(206,255,232,.5), rgba(255,240,198,.58), rgba(255,208,224,.62))" }} />
                <div aria-hidden style={{ position: "absolute", inset: 0, opacity: "var(--prism)", mixBlendMode: "screen", background: "linear-gradient(58deg, transparent 34%, rgba(255,255,255,.5) 41%, transparent 46%), linear-gradient(128deg, transparent 58%, rgba(255,255,255,.34) 63%, transparent 68%)" }} />
                <div aria-hidden style={{ position: "absolute", inset: 0, opacity: "var(--prism)", mixBlendMode: "screen", background: "linear-gradient(100deg, rgba(255,120,190,.5), rgba(120,200,255,.5) 22%, rgba(160,255,210,.45) 44%, rgba(255,235,140,.5) 66%, rgba(255,120,190,.5))", backgroundSize: "260% 100%", animation: "ccHolo 9s ease-in-out infinite" }} />
                <div aria-hidden style={{ position: "absolute", top: "50%", left: "var(--sx, 34%)", width: "78%", height: "190%", transform: "translate(-50%,-50%)", pointerEvents: "none", mixBlendMode: "screen", opacity: "var(--sop, .6)", background: "radial-gradient(closest-side, rgba(255,255,255,.62), rgba(255,255,255,.16) 46%, transparent 74%)" }} />
                <div aria-hidden style={{ position: "absolute", top: "-40%", left: 0, width: "34%", height: "180%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,.42), transparent)", mixBlendMode: "screen", animation: "ccSweep 7.5s cubic-bezier(.32,.72,0,1) infinite" }} />

                <div style={{ position: "absolute", inset: 0, padding: "clamp(18px, 5.8%, 32px)", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "var(--ct)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: "clamp(19px, 5vw, 26px)", letterSpacing: "-0.015em", lineHeight: 1 }}>olune</span>
                    <span style={{ ...MICRO, padding: "6px 11px", borderRadius: 9999, border: "1px solid var(--fx)", color: "var(--fx)", whiteSpace: "nowrap" }}>{tier.badge}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      <span style={{ ...MICRO, opacity: 0.72 }}>Studio access</span>
                      <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(21px, 5.8vw, 30px)", lineHeight: 1, letterSpacing: "-0.025em" }}>{MEMBER_NAME}</span>
                      <span style={{ fontSize: 12, letterSpacing: "0.04em", opacity: 0.72 }}>Member since {tier.since} · {tier.id}</span>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, color: "var(--fx)" }}>
                      <NfcMark size={30} />
                      <span style={{ ...MICRO, whiteSpace: "nowrap" }}>Tap to check in</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── back ── */}
              <div style={{ ...faceBase, transform: "rotateY(180deg) translateZ(3px)", background: "linear-gradient(208deg, var(--m2), var(--m1) 62%)", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.16)" }}>
                <div aria-hidden style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(72deg, rgba(0,0,0,.10) 0 1px, transparent 1px 9px)" }} />
                <div aria-hidden style={{ position: "absolute", inset: 0, mixBlendMode: "soft-light", opacity: 0.6, background: "conic-gradient(from 300deg at 40% 60%, rgba(255,255,255,.5), rgba(0,0,0,.35) 30%, rgba(255,255,255,.4) 62%, rgba(0,0,0,.3))" }} />
                <div aria-hidden style={{ position: "absolute", inset: 0, opacity: "var(--prism)", mixBlendMode: "overlay", background: "conic-gradient(from 20deg at 70% 70%, rgba(186,222,255,.5), rgba(255,208,224,.45) 34%, rgba(255,240,198,.5) 68%, rgba(186,222,255,.5))" }} />
                <div aria-hidden style={{ position: "absolute", inset: 7, borderRadius: 19, border: "1px solid var(--fx)", opacity: 0.2, pointerEvents: "none" }} />
                <div aria-hidden style={{ position: "absolute", right: "-10.8%", top: "50%", width: "53.8%", aspectRatio: "1", transform: "translateY(-50%)", borderRadius: "50%", border: "1px solid var(--fx)", opacity: 0.3 }} />
                <div aria-hidden style={{ position: "absolute", right: "-3.1%", top: "50%", width: "38.5%", aspectRatio: "1", transform: "translateY(-50%)", borderRadius: "50%", border: "1px solid var(--fx)", opacity: 0.42 }} />
                <div aria-hidden style={{ position: "absolute", right: "4.6%", top: "50%", width: "23.1%", aspectRatio: "1", transform: "translateY(-50%)", borderRadius: "50%", border: "1px solid var(--fx)", opacity: 0.6 }} />

                <div style={{ position: "absolute", inset: 0, padding: "clamp(18px, 5.8%, 32px)", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "var(--ct)" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, maxWidth: "58%" }}>
                    <span style={{ ...MICRO, opacity: 0.7 }}>Arrive · depart</span>
                    <span style={{ fontFamily: DISPLAY, fontSize: "clamp(17px, 4.4vw, 22px)", lineHeight: 1.25, letterSpacing: "-0.025em" }}>Hold your phone to the moon.</span>
                    <span style={{ fontSize: 12, lineHeight: 1.55, opacity: 0.72 }}>One tap in. One tap out. Attendance and pickup are logged the moment it reads.</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 18 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={{ ...MICRO, opacity: 0.62 }}>Card no.</span>
                      <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "0.16em", fontVariantNumeric: "tabular-nums" }}>{tier.number}</span>
                    </div>
                    <span style={{ ...MICRO, fontWeight: 400, letterSpacing: "0.06em", textTransform: "none", opacity: 0.55, textAlign: "right", maxWidth: "22ch", lineHeight: 1.5 }}>Lost card? Freeze it in the Olune app.</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* tier switcher */}
      <div style={{ display: "flex", gap: 8, padding: 6, borderRadius: 16, background: "rgba(26,21,53,0.03)", border: `1px solid ${HAIR}` }}>
        {TIERS.map((t, n) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onSelect(n)}
            aria-pressed={n === index}
            style={{
              ...resetBtn, flex: 1, padding: "11px 8px", borderRadius: 11, textAlign: "center",
              fontFamily: BODY, fontSize: 13, fontWeight: 600, letterSpacing: "0.02em",
              border: `1px solid ${n === index ? TB : "transparent"}`,
              background: n === index ? T2 : "transparent",
              color: n === index ? NAVY : MUTED,
              boxShadow: n === index ? `0 8px 20px -14px ${TG}` : "none",
              transition: "background .22s cubic-bezier(.32,.72,0,1), color .22s",
            }}
          >
            {t.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// ══ 2 · what the tier gets you ════════════════════════════════════════════

export function TierDetail({ tier }: { tier: Tier }) {
  return (
    <div style={{ background: "#ffffff", border: `1px solid ${HAIR}`, borderRadius: 28, padding: 26, display: "flex", flexDirection: "column", gap: 22, height: "100%", boxSizing: "border-box" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <span style={{ ...MICRO, color: MUTED }}>Tier {tier.rank} of 5</span>
        <h3 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 500, fontSize: 36, lineHeight: 1, letterSpacing: "-0.025em", color: NAVY }}>{tier.name}</h3>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: MUTED, textWrap: "pretty" }}>{tier.blurb}</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[{ k: "Unlocks at", v: tier.years }, { k: "Taps this year", v: tier.taps }].map((s) => (
          <div key={s.k} style={{ padding: "14px 16px", borderRadius: 14, background: "rgba(26,21,53,0.03)", border: `1px solid ${HAIR}`, display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ ...MICRO, color: MUTED }}>{s.k}</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 20, fontVariantNumeric: "tabular-nums", color: NAVY }}>{s.v}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <span style={{ ...MICRO, color: MUTED }}>What this studio gives it</span>
        <div>
          {tier.perks.map((perk) => (
            <div key={perk} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "11px 0", borderTop: `1px solid ${HAIR}` }}>
              <span aria-hidden style={{ flex: "none", width: 20, height: 20, marginTop: 1, borderRadius: "50%", background: T2, border: `1px solid ${TB}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: ACCENT }}>✓</span>
              <span style={{ fontSize: 15, lineHeight: 1.5, color: NAVY }}>{perk}</span>
            </div>
          ))}
        </div>
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: MUTED, textWrap: "pretty" }}>
          One studio&rsquo;s list, as an example. Olune counts the years and issues the card &mdash; what each tier is worth is yours to set.
        </p>
      </div>

      <div style={{ marginTop: "auto", padding: 16, borderRadius: 16, background: T1, border: `1px solid ${TB}`, display: "flex", flexDirection: "column", gap: 8 }}>
        <span style={{ ...MICRO, color: MUTED }}>Next</span>
        <span style={{ fontSize: 15, lineHeight: 1.55, color: NAVY }}>{tier.next}</span>
      </div>
    </div>
  );
}

// ══ 3 · the ladder ════════════════════════════════════════════════════════

export function TierLadder({ index, onSelect }: { index: number; onSelect: (i: number) => void }) {
  return (
    <div className="dcl-cc-ladder" style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0,1fr))", gap: 16 }}>
      {TIERS.map((t, n) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onSelect(n)}
          aria-pressed={n === index}
          className="dcl-cc-tier"
          style={{
            ...resetBtn, display: "flex", flexDirection: "column", gap: 12, padding: 10, borderRadius: 20,
            border: `1px solid ${n === index ? TB : HAIR}`,
            background: n === index ? T1 : "#ffffff",
            transform: n === index ? "translateY(-3px)" : "none",
            transition: "transform .22s cubic-bezier(.32,.72,0,1), background .22s, border-color .22s, box-shadow .22s",
          }}
        >
          <div style={{ ...tierVars(t), width: "100%" }}>
            <div style={{ position: "relative", height: 132, borderRadius: 16, overflow: "hidden", background: "linear-gradient(148deg, var(--m1), var(--m2) 46%, var(--m3))", boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)" }}>
              <div aria-hidden style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(114deg, rgba(255,255,255,.07) 0 1px, transparent 1px 8px)" }} />
              <div aria-hidden style={{ position: "absolute", inset: 0, mixBlendMode: "soft-light", opacity: 0.8, background: "conic-gradient(from 128deg at 62% 38%, rgba(255,255,255,.6), rgba(0,0,0,.35) 22%, rgba(255,255,255,.45) 44%, rgba(0,0,0,.3) 68%, rgba(255,255,255,.55))" }} />
              <div aria-hidden style={{ position: "absolute", right: -30, bottom: -40, width: 130, height: 130, borderRadius: "50%", overflow: "hidden", opacity: 0.2, background: "radial-gradient(circle at 34% 30%, var(--fx), transparent 72%)", boxShadow: "inset 0 0 0 1px var(--fx)" }}>
                <div style={{ position: "absolute", left: 40, top: -20, width: 130, height: 130, borderRadius: "50%", background: "var(--m1)" }} />
              </div>
              <div aria-hidden style={{ position: "absolute", top: "50%", left: "30%", width: "82%", height: "200%", transform: "translate(-50%,-50%)", mixBlendMode: "screen", opacity: 0.45, background: "radial-gradient(closest-side, rgba(255,255,255,.5), transparent 72%)" }} />
              <div aria-hidden style={{ position: "absolute", inset: 5, borderRadius: 11, border: "1px solid var(--fx)", opacity: 0.26 }} />
              <div aria-hidden style={{ position: "absolute", inset: 0, opacity: "var(--prism)", mixBlendMode: "overlay", background: "conic-gradient(from 205deg at 32% 18%, rgba(255,208,224,.62), rgba(186,222,255,.55), rgba(206,255,232,.5), rgba(255,240,198,.58), rgba(255,208,224,.62))" }} />
              <div style={{ position: "absolute", inset: 0, padding: "15px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between", color: "var(--ct)" }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 17, letterSpacing: "-0.015em" }}>olune</span>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
                  <span style={MICRO}>{t.name}</span>
                  <span style={{ color: "var(--fx)", display: "inline-flex" }}><NfcMark size={17} width={1.6} /></span>
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, padding: "0 2px" }}>
            <span style={{ fontSize: 15, fontWeight: 600, color: NAVY }}>{t.years}</span>
            <span style={{ fontSize: 13, lineHeight: 1.5, color: MUTED }}>{t.tagline}</span>
          </div>
        </button>
      ))}
    </div>
  );
}

// ══ 4 · the tap ═══════════════════════════════════════════════════════════
// Three phones: the card in the app, the reader, the confirmation. The frame
// matches the one the Olune Mobile showcase uses.

function Phone({ dark = false, children }: { dark?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="dcl-phone"
      style={{
        width: "min(340px, 100%)", aspectRatio: "340 / 720", borderRadius: 44, overflow: "hidden", position: "relative",
        fontFamily: BODY, boxSizing: "border-box", display: "flex", flexDirection: "column",
        boxShadow: "0 46px 90px -30px rgba(26,21,53,0.42), 0 0 0 1px rgba(26,21,53,0.12)",
      }}
    >
      <div aria-hidden style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 108, height: 30, borderRadius: 22, background: dark ? "#000" : "#000", zIndex: 50 }} />
      {children}
    </div>
  );
}

export function TapFlow({ tier }: { tier: Tier }) {
  const captionStyle: CSSProperties = { fontSize: 13, color: MUTED, paddingLeft: 4 };

  return (
    <div className="dcl-cc-flow" style={{ display: "flex", gap: 34, flexWrap: "wrap", justifyContent: "center" }}>

      {/* 1 · the card lives in the app */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <Phone>
          <div style={{ flex: 1, boxSizing: "border-box", padding: "62px 22px 34px", background: "#f2f1ed", display: "flex", flexDirection: "column", gap: 20, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, letterSpacing: "-0.025em", color: NAVY }}>Access</span>
              <span style={{ ...MICRO, color: MUTED }}>{MEMBER_NAME}</span>
            </div>
            <div style={tierVars(tier)}>
              <div style={{ position: "relative", height: 180, borderRadius: 20, overflow: "hidden", background: "linear-gradient(148deg, var(--m1), var(--m2) 46%, var(--m3))", boxShadow: "0 22px 44px -26px rgba(24,22,40,.5), inset 0 0 0 1px rgba(255,255,255,.22)" }}>
                <div aria-hidden style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(114deg, rgba(255,255,255,.07) 0 1px, transparent 1px 8px)" }} />
                <div aria-hidden style={{ position: "absolute", inset: 0, mixBlendMode: "soft-light", opacity: 0.8, background: "conic-gradient(from 128deg at 62% 38%, rgba(255,255,255,.6), rgba(0,0,0,.35) 22%, rgba(255,255,255,.45) 44%, rgba(0,0,0,.3) 68%, rgba(255,255,255,.55))" }} />
                <div aria-hidden style={{ position: "absolute", right: -40, bottom: -56, width: 180, height: 180, borderRadius: "50%", overflow: "hidden", opacity: 0.2, background: "radial-gradient(circle at 34% 30%, var(--fx), transparent 72%)", boxShadow: "inset 0 0 0 1px var(--fx)" }}>
                  <div style={{ position: "absolute", left: 55, top: -28, width: 180, height: 180, borderRadius: "50%", background: "var(--m1)" }} />
                </div>
                <div aria-hidden style={{ position: "absolute", top: "50%", left: "32%", width: "80%", height: "190%", transform: "translate(-50%,-50%)", mixBlendMode: "screen", opacity: 0.5, background: "radial-gradient(closest-side, rgba(255,255,255,.55), transparent 72%)" }} />
                <div aria-hidden style={{ position: "absolute", inset: 5, borderRadius: 12, border: "1px solid var(--fx)", opacity: 0.28 }} />
                <div aria-hidden style={{ position: "absolute", inset: 0, opacity: "var(--prism)", mixBlendMode: "overlay", background: "conic-gradient(from 205deg at 32% 18%, rgba(255,208,224,.62), rgba(186,222,255,.55), rgba(206,255,232,.5), rgba(255,240,198,.58), rgba(255,208,224,.62))" }} />
                <div style={{ position: "absolute", inset: 0, padding: 20, display: "flex", flexDirection: "column", justifyContent: "space-between", color: "var(--ct)" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 20, letterSpacing: "-0.015em" }}>olune</span>
                    <span style={{ ...MICRO, padding: "5px 9px", borderRadius: 9999, border: "1px solid var(--fx)", color: "var(--fx)" }}>{tier.name}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 20, letterSpacing: "-0.025em" }}>{MEMBER_NAME}</span>
                    <span style={{ fontSize: 12, opacity: 0.72 }}>Member since {tier.since}</span>
                  </div>
                </div>
              </div>
            </div>
            <div style={{ padding: 16, borderRadius: 16, background: "#fff", border: `1px solid ${HAIR}`, display: "flex", flexDirection: "column", gap: 8 }}>
              <span style={{ ...MICRO, color: MUTED }}>Up next</span>
              <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>Senior contemporary · 6:00 pm</span>
              <span style={{ fontSize: 12, color: MUTED }}>Studio 2 · Ellerslie · with Marta</span>
            </div>
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <div style={{ width: "100%", padding: 15, borderRadius: 9999, background: ACCENT, color: "#fff", textAlign: "center", fontSize: 14, fontWeight: 600, boxShadow: `0 16px 34px -18px ${TG}`, boxSizing: "border-box" }}>Hold near the reader</div>
              <span style={{ fontSize: 12, color: MUTED }}>or double-press the side button</span>
            </div>
          </div>
        </Phone>
        <span style={captionStyle}>1 · The card lives in the app</span>
      </div>

      {/* 2 · the reader */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <Phone dark>
          <div style={{ flex: 1, boxSizing: "border-box", padding: "62px 22px 34px", background: "radial-gradient(120% 80% at 50% 34%, #2a2748, #0a0a10 72%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 30, color: "#f4f2ee" }}>
            <div style={{ position: "relative", width: 190, height: 190, display: "flex", alignItems: "center", justifyContent: "center" }}>
              {[0, 0.8, 1.6].map((d) => (
                <div key={d} aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1px solid rgba(185,181,238,.5)", animation: `ccRing 2.4s cubic-bezier(.32,.72,0,1) ${d}s infinite` }} />
              ))}
              <div aria-hidden style={{ width: 100, height: 100, borderRadius: "50%", background: "radial-gradient(circle at 34% 30%, #dcd9fa, #a6a2e8 52%, #7a75d6)", position: "relative", overflow: "hidden", boxShadow: "0 0 60px rgba(166,162,232,.55)" }}>
                <div style={{ position: "absolute", width: 100, height: 100, borderRadius: "50%", background: "#0a0a10", left: 33, top: -15 }} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, textAlign: "center" }}>
              <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, letterSpacing: "-0.025em" }}>Hold near the reader</span>
              <span style={{ fontSize: 14, color: "#918fa2" }}>Studio 2 · Ellerslie</span>
            </div>
            <span style={{ ...MICRO, color: "rgba(185,181,238,.85)" }}>Reading…</span>
          </div>
        </Phone>
        <span style={captionStyle}>2 · Tap — no unlock, no app hunt</span>
      </div>

      {/* 3 · logged */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
        <Phone>
          <div style={{ flex: 1, boxSizing: "border-box", padding: "62px 22px 34px", background: "#f2f1ed", display: "flex", flexDirection: "column", gap: 22, overflow: "hidden" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, paddingTop: 22 }}>
              <div aria-hidden style={{ width: 80, height: 80, borderRadius: "50%", background: T2, border: `1px solid ${TB}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 14px ${T1}` }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4.5 12.6l4.6 4.6L19.5 6.8" stroke={ACCENT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, textAlign: "center" }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 29, letterSpacing: "-0.025em", color: NAVY }}>You&rsquo;re in</span>
                <span style={{ fontSize: 14, color: MUTED }}>Checked in 5:58 pm · 2 min early</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", borderRadius: 16, overflow: "hidden", background: "#fff", border: `1px solid ${HAIR}` }}>
              {[
                { k: "Class", v: "Senior contemporary" },
                { k: "Room", v: "Studio 2" },
                { k: "Pickup notice", v: "Sent to Dad" },
              ].map((r, i) => (
                <div key={r.k} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "13px 16px", borderBottom: i < 2 ? `1px solid ${HAIR}` : "none" }}>
                  <span style={{ fontSize: 14, color: MUTED }}>{r.k}</span>
                  <span style={{ fontSize: 14, fontWeight: 600, color: NAVY }}>{r.v}</span>
                </div>
              ))}
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 14, background: T1, border: `1px solid ${TB}`, fontSize: 12, lineHeight: 1.55, color: NAVY }}>{tier.tapNote}</div>
            <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10, alignItems: "center" }}>
              <div style={{ width: "100%", padding: 15, borderRadius: 9999, background: "#fff", border: `1px solid ${RING}`, color: NAVY, textAlign: "center", fontSize: 14, fontWeight: 600, boxSizing: "border-box" }}>Check out →</div>
              <span style={{ fontSize: 12, color: MUTED }}>Auto-checks out 15 min after class</span>
            </div>
          </div>
        </Phone>
        <span style={captionStyle}>3 · Logged, and the family knows</span>
      </div>
    </div>
  );
}
