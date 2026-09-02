"use client";

// ============================================================================
//  components/marketing/OluneLanding.tsx
//  1:1 port of the Claude Design Studio landing export (source of truth).
//  Styling is inline (as in the export); keyframes + hover states live in
//  styles/landing-design.css. Interaction model is the export's own:
//    - intro "eclipse opens" sequence (introStage 0→3)
//    - IntersectionObserver section reveals with staggered rv() transitions
//    - progress eclipse (bottom-right) fills as sections reveal
//    - climax eclipse opens when the promise section reveals
//    - mouse parallax on the hero decor layer
//    - pricing count-up triggered by the pricing reveal
//  Copy comes from next-intl messages (en matches the export verbatim);
//  product-mockup micro-copy is hardcoded English, exactly as designed.
// ============================================================================

import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { setLocale } from "@/app/actions/locale";
import { OluneLogo } from "@/components/brand/OluneLogo";
import { localeLabels, locales, type Locale } from "@/lib/i18n/config";
import { landingFontVars } from "./landing/fonts";
import { NEXT_UP, RELEASES } from "./landing/releases-data";

const ACCENT = "#8b7cf0";
const NAVY = "#1a1535";
const PURPLE_GRAD = `radial-gradient(circle at 62% 40%, #d6ccff 0%, ${ACCENT} 52%, #5b4bc4 100%)`;
// "Olune Dollar" supplies U+0024 only (see app/globals.css) — a single-bar
// dollar so NZ prices don't render with the two-bar glyph Bodoni draws.
const DISPLAY = "'Olune Dollar', var(--font-landing-display), 'Bodoni Moda', serif";
const BODY = "var(--font-landing-body), 'Archivo', sans-serif";

type MotionIntensity = "cinematic" | "subtle" | "off";
type RevealVariant = "up" | "left" | "right" | "scale" | "blur";

// openness 0 = total eclipse (navy over purple), ~0.44 = resting mark, 1 = full orb (navy gone)
function navyPhase(open: number) {
  let tx: number, ty: number, op = 1;
  if (open <= 0.44) {
    const k = open / 0.44;
    tx = 9 - 9 * k;
    ty = 9 - 9 * k;
  } else {
    const k = (open - 0.44) / 0.56;
    tx = -92 * k;
    ty = -74 * k;
    op = 1 - 0.92 * k;
  }
  return { tx, ty, op };
}

function rv(active: boolean, index: number, motion: MotionIntensity, variant: RevealVariant): CSSProperties {
  if (motion === "off") return { opacity: 1 };
  const cin = motion !== "subtle";
  const dur = cin ? 950 : 460;
  const step = cin ? 95 : 45;
  const delay = active ? index * step : 0;
  const tr = `${dur}ms cubic-bezier(.16,1,.3,1) ${delay}ms`;
  const base: CSSProperties = { opacity: active ? 1 : 0, transition: `opacity ${tr}, transform ${tr}, filter ${tr}` };
  if (active) return { ...base, transform: "none", filter: "none" };
  const map: Record<RevealVariant, string> = {
    up: `translateY(${cin ? 56 : 20}px)`,
    left: `translateX(${cin ? -72 : -26}px)`,
    right: `translateX(${cin ? 72 : 26}px)`,
    scale: "scale(0.8)",
    blur: "translateY(28px)",
  };
  return { ...base, transform: map[variant], filter: variant === "blur" ? "blur(13px)" : "none" };
}

function introTimings(motion: MotionIntensity) {
  if (motion === "off") return { s1: 0, s2: 0, s3: 0, openMs: 1, fadeMs: 1 };
  if (motion === "subtle") return { s1: 200, s2: 800, s3: 1300, openMs: 600, fadeMs: 450 };
  return { s1: 650, s2: 1750, s3: 2750, openMs: 1100, fadeMs: 900 };
}

// ── decor factories (verbatim from the export) ───────────────────────────
const mkOrb = (t: string, l: string, s: number, bg: string, bl: number, an: string, du: number, de: number): CSSProperties => ({
  position: "absolute", top: t, left: l, width: s, height: s, borderRadius: "50%", background: bg,
  filter: `blur(${bl}px)`, opacity: 1, animation: `${an} ${du}s ease-in-out ${de}s infinite`, pointerEvents: "none",
});

// Aurora Glass ambience (tokens/aurora.css --a1/--a2/--a3, ported verbatim) —
// three distinct hues rather than one accent tint, independent of studio
// branding, so the hero reads as "aurora" rather than "purple orb".
const AURORA_LAVENDER = "rgba(166,162,232,.34)";
const AURORA_SEAFOAM = "rgba(159,216,200,.30)";
const AURORA_APRICOT = "rgba(242,183,136,.22)";
const HERO_ORBS = [
  mkOrb("10%", "8%", 320, AURORA_LAVENDER, 62, "floatA", 22, 0),
  mkOrb("58%", "80%", 360, AURORA_SEAFOAM, 70, "floatB", 27, 2),
  mkOrb("74%", "16%", 220, AURORA_APRICOT, 54, "floatC", 20, 1),
];
const DECOR_A = [
  mkOrb("12%", "8%", 240, `${ACCENT}12`, 60, "floatA", 21, 0),
  mkOrb("66%", "84%", 280, "rgba(214,204,255,0.22)", 64, "floatB", 25, 2),
  mkOrb("30%", "70%", 150, `${ACCENT}12`, 38, "floatC", 18, 1),
];
const DECOR_B = [
  mkOrb("8%", "12%", 320, `${ACCENT}18`, 70, "floatB", 23, 0),
  mkOrb("62%", "80%", 240, "rgba(255,255,255,0.6)", 58, "floatA", 21, 2),
  mkOrb("80%", "20%", 190, `${ACCENT}14`, 48, "floatC", 17, 1),
  mkOrb("18%", "86%", 130, `${ACCENT}24`, 32, "floatA", 15, 0.5),
];

function stars(n: number, sa: number, sb: number, base: string): CSSProperties[] {
  const out: CSSProperties[] = [];
  for (let i = 0; i < n; i++) {
    const s = 1.5 + (i % 3);
    out.push({
      position: "absolute", top: `${(i * sa) % 100}%`, left: `${(i * sb) % 100}%`, width: s, height: s,
      borderRadius: "50%", background: i % 3 === 0 ? ACCENT : "#ffffff", opacity: 0.5, boxShadow: `0 0 7px ${base}`,
      animation: `twinkle ${2.4 + (i % 5) * 0.5}s ease-in-out ${(i % 7) * 0.35}s infinite`, pointerEvents: "none",
    });
  }
  return out;
}

const mkShoot = (top: string, left: string, delay: number, dur: number): CSSProperties => ({
  position: "absolute", top, left, width: 130, height: 2, borderRadius: 2,
  background: "linear-gradient(90deg, rgba(255,255,255,0), #ffffff)", boxShadow: "0 0 6px rgba(255,255,255,0.5)",
  opacity: 0, animation: `shootStar ${dur}s linear ${delay}s infinite`, pointerEvents: "none",
});

const mkRing = (size: number, dur: number, dir: string): CSSProperties => ({
  position: "absolute", top: "50%", left: "50%", width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2,
  borderRadius: "50%", border: "1px solid rgba(255,255,255,0.1)", animation: `spinSlow ${dur}s linear infinite ${dir}`, pointerEvents: "none",
});
const mkPlanet = (s: number, bg: string): CSSProperties => ({
  position: "absolute", top: -s / 2, left: "50%", marginLeft: -s / 2, width: s, height: s, borderRadius: "50%",
  background: bg, boxShadow: `0 0 14px ${ACCENT}`,
});

// bento cell ambient art, verbatim (index-matched to cell order)
function bentoArt(i: number): CSSProperties[] {
  const soft = "rgba(26,21,53,0.08)";
  if (i === 0) return [
    { position: "absolute", left: 8, top: 8, width: 3, height: 3, borderRadius: "50%", background: "#ffffff", animation: "twinkle 2.8s ease-in-out infinite" },
    { position: "absolute", left: 30, top: 54, width: 3, height: 3, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 8px ${ACCENT}`, animation: "twinkle 3.4s ease-in-out 0.7s infinite" },
    { position: "absolute", left: 14, top: 110, width: 2, height: 2, borderRadius: "50%", background: "#ffffff", animation: "twinkle 2.2s ease-in-out 1.2s infinite" },
  ];
  if (i === 1) return [
    { position: "absolute", right: 14, top: 0, width: 86, height: 104, borderRadius: 10, background: "#ffffff", border: "1px solid rgba(26,21,53,0.09)", boxShadow: "0 16px 34px -22px rgba(26,21,53,0.5)", animation: "bobY 6s ease-in-out infinite" },
    { position: "absolute", right: 30, top: 16, width: 54, height: 7, borderRadius: 4, background: soft, animation: "bobY 6s ease-in-out infinite" },
    { position: "absolute", right: 30, top: 30, width: 40, height: 7, borderRadius: 4, background: soft, animation: "bobY 6s ease-in-out infinite" },
    { position: "absolute", right: 30, top: 44, width: 48, height: 7, borderRadius: 4, background: soft, animation: "bobY 6s ease-in-out infinite" },
    { position: "absolute", right: 22, top: 74, width: 24, height: 24, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 16px ${ACCENT}`, animation: "checkPop 5.5s ease-in-out infinite" },
  ];
  if (i === 2) return [36, 54, 42, 66, 48].map((h, k) => ({
    position: "absolute", bottom: 0, right: 16 + k * 18, width: 11, height: h, borderRadius: "4px 4px 0 0",
    background: k === 3 ? `linear-gradient(180deg, ${ACCENT}, #6d5bd0)` : `${ACCENT}44`,
    transformOrigin: "bottom center", animation: `growY ${2.4 + (k % 3) * 0.4}s ease-in-out ${k * 0.2}s infinite alternate`,
  } as CSSProperties));
  if (i === 3) return [
    { position: "absolute", right: 16, top: 4, width: 70, height: 7, borderRadius: 4, background: soft, transformOrigin: "left center", animation: "growX 3s ease-in-out infinite alternate" },
    { position: "absolute", right: 16, top: 18, width: 54, height: 7, borderRadius: 4, background: soft, transformOrigin: "left center", animation: "growX 3.6s ease-in-out 0.4s infinite alternate" },
    { position: "absolute", right: 16, top: 32, width: 62, height: 7, borderRadius: 4, background: soft, transformOrigin: "left center", animation: "growX 3.2s ease-in-out 0.8s infinite alternate" },
    { position: "absolute", right: 40, top: 52, width: 22, height: 22, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 14px ${ACCENT}`, animation: "checkPop 5s ease-in-out infinite" },
  ];
  if (i === 4) return [
    { position: "absolute", right: 16, top: 12, width: 200, height: 8, borderRadius: 4, background: soft },
    { position: "absolute", right: 16, top: 12, width: 200, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${ACCENT}, #6d5bd0)`, transformOrigin: "left center", animation: "growX 3.4s ease-in-out infinite alternate" },
    { position: "absolute", right: 16, top: 38, width: 200, height: 8, borderRadius: 4, background: soft },
    { position: "absolute", right: 16, top: 38, width: 200, height: 8, borderRadius: 4, background: `linear-gradient(90deg, ${ACCENT}88, ${ACCENT}44)`, transformOrigin: "left center", animation: "growX 4.2s ease-in-out 0.6s infinite alternate" },
    { position: "absolute", right: 232, top: 30, width: 20, height: 20, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 14px ${ACCENT}`, animation: "checkPop 6s ease-in-out infinite" },
  ];
  if (i === 5) return [
    { position: "absolute", right: 14, top: 0, width: 72, height: 92, borderRadius: 8, background: "#ffffff", border: "1px solid rgba(26,21,53,0.09)", boxShadow: "0 16px 34px -22px rgba(26,21,53,0.5)", animation: "bobY 7s ease-in-out infinite" },
    { position: "absolute", right: 28, top: 14, width: 44, height: 6, borderRadius: 3, background: soft, animation: "bobY 7s ease-in-out infinite" },
    { position: "absolute", right: 28, top: 27, width: 32, height: 6, borderRadius: 3, background: soft, animation: "bobY 7s ease-in-out infinite" },
    { position: "absolute", right: 28, top: 40, width: 38, height: 6, borderRadius: 3, background: soft, animation: "bobY 7s ease-in-out infinite" },
    { position: "absolute", right: 8, top: 68, width: 18, height: 18, borderRadius: "50%", background: `radial-gradient(circle at 35% 32%, #d6ccff, ${ACCENT})`, boxShadow: `0 0 14px ${ACCENT}88`, animation: "bobY 3.2s ease-in-out infinite" },
  ];
  return [
    { position: "absolute", right: 16, top: 14, width: 30, height: 30, borderRadius: "50%", background: `radial-gradient(circle at 35% 32%, #d6ccff, ${ACCENT})`, animation: "livePulse 3s ease-in-out infinite, drift 6s ease-in-out infinite" },
    { position: "absolute", right: 54, top: 28, width: 22, height: 22, borderRadius: "50%", background: "#6d5bd0", animation: "livePulse 3s ease-in-out 0.6s infinite, drift 7s ease-in-out 0.5s infinite" },
    { position: "absolute", right: 84, top: 10, width: 16, height: 16, borderRadius: "50%", background: `${ACCENT}99`, animation: "livePulse 3s ease-in-out 1.2s infinite, drift 5s ease-in-out 1s infinite" },
  ];
}

// ── small shared pieces ───────────────────────────────────────────────────
function Starfield({ items }: { items: CSSProperties[] }) {
  return <>{items.map((s, i) => <div key={i} style={s} aria-hidden />)}</>;
}

const eyebrowStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,21,53,0.46)" };
const eyebrowDarkStyle: CSSProperties = { ...eyebrowStyle, color: "rgba(255,255,255,0.6)" };
const eyebrowAccentStyle: CSSProperties = { ...eyebrowStyle, color: ACCENT };
const accentDotStyle: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: ACCENT, display: "inline-block" };

const sectionStyle = (bg: string): CSSProperties => ({
  position: "relative", overflow: "hidden", background: bg, padding: "116px 48px",
  borderRadius: "48px 48px 0 0", marginTop: -48, boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)",
});

const ctaPrimaryStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 36px", borderRadius: 999, background: NAVY, color: "#ffffff", fontWeight: 700, fontSize: 16.5, boxShadow: "0 18px 40px -18px rgba(26,21,53,0.7)", transition: "transform 0.35s cubic-bezier(.16,1,.3,1), box-shadow 0.35s ease" };
const ctaGhostStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "4px 0", color: NAVY, fontWeight: 600, fontSize: 15.5, borderBottom: "1px solid rgba(26,21,53,0.3)", transition: "border-color 0.3s ease, color 0.3s ease" };
const ctaOnDarkStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "18px 36px", borderRadius: 999, background: "#ffffff", color: NAVY, fontWeight: 700, fontSize: 16.5, boxShadow: `0 20px 60px -16px ${ACCENT}`, transition: "transform 0.35s cubic-bezier(.16,1,.3,1), box-shadow 0.35s ease" };

// Aurora Glass panel recipe (tokens/aurora.css) — 148° refraction sheen over
// a translucent fill, blur+saturate, one edge border, sheen on the inside
// top/bottom. Colourless (white-based), so it layers over the landing's own
// ACCENT/NAVY palette instead of the tenant --brand tokens.
const GLASS_EDGE = "rgba(255,255,255,.78)";
const GLASS_PANEL: CSSProperties = {
  background: "linear-gradient(148deg, rgba(255,255,255,.5), transparent 42%), rgba(255,255,255,.4)",
  backdropFilter: "blur(28px) saturate(1.7)",
  WebkitBackdropFilter: "blur(28px) saturate(1.7)",
  border: `1px solid ${GLASS_EDGE}`,
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.8), inset 0 -1px 0 rgba(255,255,255,.3)",
};
const ctaGlassStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, padding: "16px 30px", borderRadius: 999, color: NAVY, fontWeight: 700, fontSize: 15.5, transition: "transform 0.35s cubic-bezier(.16,1,.3,1), box-shadow 0.35s ease, border-color 0.3s ease", ...GLASS_PANEL };
const heroChipStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 10, padding: "9px 16px", borderRadius: 999, fontSize: 12, color: "rgba(26,21,53,0.66)", ...GLASS_PANEL };
const grainStyle: CSSProperties = {
  position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.05, mixBlendMode: "overlay",
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E\")",
};

const liveBadgeStyle: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 7, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ACCENT, padding: "5px 12px", borderRadius: 999, background: `${ACCENT}16`, border: `1px solid ${ACCENT}44` };
const liveDotStyle: CSSProperties = { width: 7, height: 7, borderRadius: "50%", background: ACCENT, animation: "livePulse 2s ease-in-out infinite" };
const caretStyle: CSSProperties = { display: "inline-block", width: 2, height: 15, background: ACCENT, marginLeft: 3, verticalAlign: "middle", animation: "caretBlink 1s step-end infinite" };

/** Mac-style browser chrome framing the "three jobs" mockups (design's ChromeWindow). */
function ChromeWindow({ width, height, url, children }: { width: number; height: number; url: string; children: ReactNode }) {
  const t = useTranslations("marketing");
  return (
    // data-nosnippet: everything inside is a fake screenshot of a fictional
    // studio ("Classes 6 days a week · Ponsonby, Auckland", "Tempo Dance Co.").
    // Google was splicing that copy onto the end of the homepage's meta
    // description in search results, which read as though Olune ran classes.
    <div data-nosnippet style={{ width: "100%", maxWidth: width, overflow: "hidden", borderRadius: 16, border: "1px solid rgba(255,255,255,0.1)", background: "#202124", boxShadow: "0 24px 80px -24px rgba(26,21,53,0.55)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px 0" }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: 8, padding: "5px 14px", borderRadius: "9px 9px 0 0", background: "#3c3d40", fontSize: 11, color: "rgba(255,255,255,0.75)", whiteSpace: "nowrap" }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(255,255,255,0.35)" }} />
          {t("livePreview")}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 8 }}>
        <div style={{ margin: "0 4px", display: "flex", height: 26, flex: 1, alignItems: "center", gap: 8, borderRadius: 999, background: "#282a2d", padding: "0 14px" }}>
          <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: "50%", background: "rgba(255,255,255,0.3)" }} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{url}</span>
        </div>
      </div>
      <div style={{ height: 1, background: "rgba(255,255,255,0.1)" }} />
      <div style={{ height: height - 64, background: "#fdfcff" }}>{children}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function OluneLanding() {
  const t = useTranslations("marketing");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [langPending, startLangTransition] = useTransition();

  const [scrolled, setScrolled] = useState(false);
  const [introStage, setIntroStage] = useState(0);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [priceProgress, setPriceProgress] = useState(0);
  // Gates the count-up. False on the server and until the animation actually
  // arms, so the real prices — not $0 — are what ships in the HTML and what a
  // crawler (which never scrolls) reads.
  const [counting, setCounting] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const motion: MotionIntensity = reduceMotion ? "off" : "cinematic";
  const motionRef = useRef(motion);
  motionRef.current = motion;

  const sectionEls = useRef<Record<string, HTMLElement | null>>({});
  const pricingEl = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const navSentinel = useRef<HTMLDivElement | null>(null);
  const heroLayer = useRef<HTMLDivElement | null>(null);
  const cuStarted = useRef(false);
  const cuRaf = useRef(0);

  const startCountUp = useCallback(() => {
    if (cuStarted.current) return;
    cuStarted.current = true;
    if (motionRef.current === "off") { setPriceProgress(1); return; }
    setCounting(true);
    const t0 = performance.now();
    const dur = 1300;
    const tick = (now: number) => {
      let p = Math.min((now - t0) / dur, 1);
      p = 1 - Math.pow(1 - p, 3);
      setPriceProgress(p);
      if (p < 1) cuRaf.current = requestAnimationFrame(tick);
    };
    cuRaf.current = requestAnimationFrame(tick);
  }, []);

  const sectionRef = useCallback((key: string) => (el: HTMLElement | null) => {
    if (el && !sectionEls.current[key]) {
      sectionEls.current[key] = el;
      observerRef.current?.observe(el);
    }
  }, []);

  // Pricing needs both the shared reveal observer and its own early count-up
  // observer, so it gets a combined ref.
  const pricingSectionRef = useCallback((el: HTMLElement | null) => {
    pricingEl.current = el;
    sectionRef("pricing")(el);
  }, [sectionRef]);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduceMotion(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const key = Object.keys(sectionEls.current).find((k) => sectionEls.current[k] === entry.target);
          if (key) {
            setRevealed((s) => (s[key] ? s : { ...s, [key]: true }));
          }
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.16, rootMargin: "0px 0px -6% 0px" });
    observerRef.current = obs;
    Object.values(sectionEls.current).forEach((el) => { if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  // Price count-up arms well before the section reaches the viewport, so the
  // drop from the real price back to $0 always happens off screen. Never
  // firing (a crawler, or a visitor who never scrolls that far) simply leaves
  // the real prices on screen.
  useEffect(() => {
    const el = pricingEl.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (!entry.isIntersecting) return;
      obs.disconnect();
      // Deep-linked straight to #pricing: the cards are already on screen, so
      // counting up would just flash the real price away and back.
      if (entry.boundingClientRect.top < window.innerHeight) {
        cuStarted.current = true;
        setPriceProgress(1);
        return;
      }
      startCountUp();
    }, { rootMargin: "0px 0px 60% 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [startCountUp]);

  useEffect(() => {
    const el = navSentinel.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => setScrolled(!entries[0].isIntersecting), { threshold: 0 });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const { s1, s2, s3 } = introTimings(motion);
    if (motion === "off") { setIntroStage(3); return; }
    const t1 = setTimeout(() => setIntroStage((v) => Math.max(v, 1)), s1);
    const t2 = setTimeout(() => setIntroStage((v) => Math.max(v, 2)), s2);
    const t3 = setTimeout(() => setIntroStage((v) => Math.max(v, 3)), s3);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [motion]);

  useEffect(() => {
    let raf = 0, mx = 0, my = 0;
    const onMove = (e: MouseEvent) => {
      mx = e.clientX / window.innerWidth - 0.5;
      my = e.clientY / window.innerHeight - 0.5;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          const el = heroLayer.current;
          if (el) el.style.transform = `translate(${mx * 18}px, ${my * 18}px)`;
        });
      }
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => { window.removeEventListener("mousemove", onMove); if (raf) cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => () => { if (cuRaf.current) cancelAnimationFrame(cuRaf.current); }, []);

  const reveal = useCallback(
    (key: string, i = 0, variant: RevealVariant = "up") => rv(!!revealed[key], i, motion, variant),
    [revealed, motion],
  );
  const heroReveal = useCallback(
    (i: number, variant: RevealVariant = "blur") => rv(introStage >= 2, i, motion, variant),
    [introStage, motion],
  );

  const { openMs, fadeMs } = introTimings(motion);
  const italic = { i: (chunks: ReactNode) => <span style={{ fontStyle: "italic" }}>{chunks}</span> };

  function switchLocale(next: Locale) {
    if (next === locale) return;
    startLangTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  // ---------- intro ----------
  const showIntroOverlay = introStage < 3;
  const introOpen = introStage >= 1 ? 0.44 : 0;
  const ip = navyPhase(introOpen);
  const introRing = (delay: number): CSSProperties => ({
    position: "absolute", top: "50%", left: "50%", width: 190, height: 190, marginLeft: -95, marginTop: -95,
    borderRadius: "50%", border: `1px solid ${ACCENT}66`, animation: `ringExpand 3.4s ease-out ${delay}s infinite`,
    opacity: introStage >= 1 && introStage < 2 ? 1 : 0, transition: "opacity 500ms ease", pointerEvents: "none",
  });

  // ---------- progress eclipse ----------
  const SECTION_KEYS = ["human", "jobs", "bento", "why", "everyday", "promise", "pricing", "about", "updates", "compare", "footer"];
  const progress = SECTION_KEYS.filter((k) => revealed[k]).length / SECTION_KEYS.length;
  const pp2 = navyPhase(0.44 + progress * 0.56);

  // ---------- climax eclipse ----------
  const cp = navyPhase(revealed.promise ? 1 : 0.2);

  // ---------- data (copy via i18n; en matches the export verbatim) ----------
  const heroWords1 = t("hero.titleLine1").split(" ");
  const heroWords2 = t("hero.titleLine2").split(" ");
  const tickerWords = (["enrolments", "timetables", "attendance", "invoicing", "families", "classes", "payments", "reports"] as const).map((k) => t(`hero.marquee.${k}`));
  const tickerLoop = [...tickerWords, ...tickerWords];
  const chaosLabels = t.raw("problem.oldWayItems") as string[];

  const bentoCells = ([
    { key: "website", col: 2, row: 2, feature: true },
    { key: "invoicing", col: 2, row: 1, feature: false },
    { key: "cashFlow", col: 1, row: 1, feature: false },
    { key: "paymentPlans", col: 1, row: 1, feature: false },
    { key: "classes", col: 2, row: 1, feature: false },
    { key: "checkin", col: 1, row: 1, feature: false },
    { key: "families", col: 1, row: 1, feature: false },
  ] as const).map((c, i) => ({
    ...c,
    title: t(`bento.cells.${c.key}.title`),
    desc: t(`bento.cells.${c.key}.body`),
    art: bentoArt(i),
  }));

  const statBand = (["logins", "tools", "price"] as const).map((k) => ({
    n: t(`bento.stats.${k}.n`),
    l: t(`bento.stats.${k}.label`),
  }));

  const jobsRows = ([
    { key: "runClasses", num: "01", tag: "Classes", url: "app.olune.co.nz/classes" },
    { key: "money", num: "02", tag: "Money", url: "app.olune.co.nz/money" },
    { key: "liveSites", num: "03", tag: "Website", url: "app.olune.co.nz/site" },
  ] as const).map((r, i) => ({
    ...r,
    title: t(`featuresSection.${r.key}.title`),
    body: t(`featuresSection.${r.key}.subtitle`),
    chromeWidth: 560,
    chromeHeight: i === 2 ? 478 : 400,
    reverse: i % 2 === 1,
  }));

  // Class rolls with their term fill — the progress bars read as capacity.
  const classRolls = [
    { name: "Ballet Grade 3 · Tue 5:30pm", pct: "90%", delay: "0s", done: true },
    { name: "Hip hop Juniors · Wed 6:00pm", pct: "62%", delay: "0.6s", done: false },
    { name: "Contemporary Seniors · Sat 10:00am", pct: "38%", delay: "1.2s", done: false },
  ];
  const financeBars = [42, 68, 55, 88, 72, 96, 80];
  const cafeMenu = [
    { name: "Ballet", price: "Tue & Thu · 5:30pm", swatch: "repeating-linear-gradient(45deg, #ecd9ef 0 6px, #f3e7f5 6px 12px)" },
    { name: "Hip hop", price: "Wed · 6:00pm", swatch: "repeating-linear-gradient(45deg, #e2cbe6 0 6px, #ecdbef 6px 12px)" },
    { name: "Contemporary", price: "Sat · 10:00am", swatch: "repeating-linear-gradient(45deg, #e8d2e2 0 6px, #f1e2ed 6px 12px)" },
  ];

  const whyCards = (["faster", "value", "craft"] as const).map((k, i) => ({
    num: ["I", "II", "III"][i],
    title: t(`whyChoose.items.${k}.title`),
    body: t(`whyChoose.items.${k}.body`),
  }));
  const everydayItems = (["mornings", "money", "families", "evenings"] as const).map((k, i) => ({
    num: ["I", "II", "III", "IV"][i],
    title: t(`everyday.items.${k}.title`),
    body: t(`everyday.items.${k}.body`),
  }));

  const pp = counting ? priceProgress : 1;
  const pricingTiers = ([
    { key: "solo", target: 29, highlight: false },
    { key: "studio", target: 59, highlight: true },
    { key: "scale", target: 120, highlight: false },
  ] as const).map((p) => ({
    ...p,
    name: t(`pricingSection.plans.${p.key}.name`),
    tagline: t(`pricingSection.plans.${p.key}.tag`),
    body: t(`pricingSection.plans.${p.key}.desc`),
    price: `$${Math.round(p.target * pp)}`,
  }));

  const compareRows = (["classes", "invoicing", "websites", "sync", "cost", "tools", "purpose"] as const).map((k) => ({
    label: t(`compareSection.rows.${k}.label`),
    usual: t(`compareSection.rows.${k}.stack`),
    olune: t(`compareSection.rows.${k}.olune`),
  }));
  const compareHighlights = (["faster", "cheaper", "better"] as const).map((k) => ({
    k: t(`compareSection.highlights.${k}.k`),
    v: t(`compareSection.highlights.${k}.v`),
  }));

  // Keep these two lists in step with LandingNav/LandingFooter in
  // components/marketing/landing/chrome.tsx — the home page carries its own
  // copy, so a link added there has to be added here too or it only shows up
  // on the FAQ/Team/Mobile pages.
  const navLinks = [
    { label: t("features"), href: "/#features" },
    { label: t("pricing"), href: "/#pricing" },
    { label: "Mobile", href: "/mobile" },
    { label: "Card", href: "/card" },
    { label: "FAQ", href: "/faq" },
    { label: "Team", href: "/team" },
    { label: "Updates", href: "/#updates" },
    { label: t("about"), href: "/#about" },
  ];
  // Real routes first, and with the anchor text Google should read as the page
  // name — sitelink labels are drawn from anchor text and <title>, so "Card"
  // and "Team" were giving it nothing to work with. /instructors and /privacy
  // are in the sitemap but were unreachable from the homepage; a page with no
  // internal link is not a sitelink candidate. In-page anchors go last.
  const footerLinks = [
    { label: "Olune Mobile", href: "/mobile" },
    { label: "Check-in card", href: "/card" },
    { label: "Find an instructor", href: "/instructors" },
    { label: "Meet the team", href: "/team" },
    { label: "FAQ", href: "/faq" },
    { label: "Privacy", href: "/privacy" },
    { label: t("features"), href: "/#features" },
    { label: t("pricing"), href: "/#pricing" },
    { label: "Updates", href: "/#updates" },
    { label: t("signIn"), href: "/login" },
    { label: t("startFree"), href: "/onboarding" },
  ];

  const sceneStars = stars(26, 43, 57, "#ffffff");
  const aboutStars = stars(24, 41, 63, "#ffffff");
  const climaxStars = stars(20, 43, 61, "#ffffff");
  const footerStars = stars(14, 37, 53, ACCENT);
  const statStars = stars(12, 39, 71, ACCENT);
  const releaseStars = stars(22, 47, 59, ACCENT);

  // release notes — newest leads as the hero card, the rest fall onto the rail
  const [latestRelease, ...pastReleases] = RELEASES;

  const navLinkStyle: CSSProperties = { color: "rgba(26,21,53,0.66)", fontSize: 15, fontWeight: 500, transition: "color 0.25s ease" };

  return (
    <div
      id="olune-landing-root"
      className={landingFontVars}
      style={{ fontFamily: BODY, background: "#f7f6fb", color: NAVY, overflowX: "hidden", width: "100%", position: "relative" }}
    >
      <div ref={navSentinel} style={{ position: "absolute", top: 0, left: 0, width: 1, height: 1, pointerEvents: "none" }} />

      {/* progress eclipse — light fills in as the page reveals itself */}
      <div aria-hidden style={{ position: "fixed", bottom: 34, right: 34, width: 50, height: 50, zIndex: 40, pointerEvents: "none", opacity: introStage >= 2 ? 1 : 0, transition: "opacity 700ms ease", filter: `drop-shadow(0 0 ${6 + progress * 20}px ${ACCENT}${progress > 0.5 ? "cc" : "88"})` }}>
        <div style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: PURPLE_GRAD }} />
        <div style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY, transform: `translate(${pp2.tx}%, ${pp2.ty}%)`, opacity: pp2.op, transition: "transform 700ms cubic-bezier(.16,1,.3,1), opacity 700ms ease" }} />
      </div>

      {/* INTRO — total eclipse opens into the mark, then blooms into the page */}
      {showIntroOverlay && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 50% 46%, #ffffff 0%, #f0ebfb 55%, #e4dcf7 100%)", opacity: introStage >= 2 ? 0 : 1, visibility: introStage >= 2 ? "hidden" : "visible", pointerEvents: introStage >= 2 ? "none" : "auto", transition: `opacity ${fadeMs}ms ease, visibility ${fadeMs}ms ease` }}>
          <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", width: 1, height: 1 }}>
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 460, height: 460, borderRadius: "50%", marginLeft: -230, marginTop: -230, background: `radial-gradient(circle, ${ACCENT}66 0%, ${ACCENT}00 68%)`, transform: `scale(${introStage >= 1 ? 1.8 : 0.6})`, opacity: introStage >= 1 ? (introStage >= 2 ? 0 : 1) : 0, transition: `transform ${Math.round(openMs * 1.2)}ms cubic-bezier(.16,1,.3,1), opacity ${Math.round(openMs * 1.2)}ms ease`, pointerEvents: "none" }} />
            <div style={introRing(0)} />
            <div style={introRing(1.7)} />
            <div style={{ position: "absolute", top: "50%", left: "50%", width: 150, height: 150, marginLeft: -75, marginTop: -75, transform: `scale(${introStage >= 2 ? 3.2 : 1})`, opacity: introStage >= 2 ? 0 : 1, transition: `transform ${openMs}ms cubic-bezier(.16,1,.3,1), opacity ${Math.round(openMs * 0.8)}ms ease`, animation: introStage === 0 ? "introBreathe 2600ms ease-in-out infinite" : "none", filter: `drop-shadow(0 20px 50px ${ACCENT}55)` }}>
              <div style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: PURPLE_GRAD, boxShadow: `0 0 60px ${ACCENT}77` }} />
              <div style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY, transform: `translate(${ip.tx}%, ${ip.ty}%)`, opacity: ip.op, transition: `transform ${openMs}ms cubic-bezier(.16,1,.3,1), opacity ${openMs}ms ease` }} />
            </div>
          </div>
        </div>
      )}

      {/* nav + announcement bar, pinned together so the banner never overlaps the nav */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 60 }}>
        <nav className="dcl-nav" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: scrolled ? "15px 48px" : "24px 48px", background: scrolled ? "rgba(247,246,251,0.82)" : "#f7f6fb", backdropFilter: scrolled ? "blur(16px) saturate(1.4)" : "none", WebkitBackdropFilter: scrolled ? "blur(16px) saturate(1.4)" : "none", borderBottom: scrolled ? "1px solid rgba(26,21,53,0.07)" : "1px solid transparent", transition: "all 450ms cubic-bezier(.16,1,.3,1)" }}>
          <a href="#hero" style={{ display: "flex", alignItems: "center", gap: 11, fontFamily: DISPLAY, fontSize: 24, color: NAVY, letterSpacing: "0.005em", transition: "color 0.4s ease" }}>
            <span style={{ position: "relative", width: 22, height: 22, display: "inline-block", animation: "bobY 6s ease-in-out infinite" }}>
              <span style={{ position: "absolute", top: "15%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: ACCENT }} />
              <span style={{ position: "absolute", top: "6%", left: "5%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY }} />
            </span>
            olune
          </a>
          <div className="dcl-nav-links" style={{ display: "flex", alignItems: "center", gap: 40, flexWrap: "wrap" }}>
            {navLinks.map((l) => (
              <Link key={l.href} href={l.href} className="dcl-navlink" style={navLinkStyle}>{l.label}</Link>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <Link href="/login" className="dcl-navlink" style={navLinkStyle}>{t("signIn")}</Link>
            <Link href="/onboarding" className="dcl-cta-primary" style={{ padding: "10px 22px", borderRadius: 999, background: NAVY, color: "#ffffff", fontSize: 14.5, fontWeight: 700, transition: "transform 0.3s ease, box-shadow 0.3s ease" }}>{t("startFree")}</Link>
          </div>
        </nav>

        <div style={{ background: "#efeafb", color: "rgba(26,21,53,0.6)", textAlign: "center", padding: "10px 20px", fontSize: 13, letterSpacing: "0.01em", borderBottom: "1px solid rgba(26,21,53,0.07)" }}>
          Olune is currently under development — general release is due in December. All plans are free to try as much as you like until then.
        </div>
      </div>

      {/* HERO */}
      <section id="hero" className="dcl-section" style={{ position: "relative", background: "linear-gradient(180deg, #efeafb 0%, #f7f6fb 60%)", padding: "148px 48px 0", overflow: "hidden" }}>
        <div aria-hidden style={grainStyle} />
        <div aria-hidden style={{ position: "absolute", width: 1000, height: 1000, borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT}24 0%, ${ACCENT}00 66%)`, top: -300, left: "50%", transform: "translateX(-50%)", pointerEvents: "none", animation: "pulseGlow 10s ease-in-out infinite" }} />
        <div ref={heroLayer} aria-hidden style={{ position: "absolute", inset: "-8%", pointerEvents: "none", zIndex: 0 }}>
          <div style={{ position: "absolute", top: "12%", left: "22%", width: 720, height: 720, borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT}22 0%, rgba(214,204,255,0.16) 42%, transparent 70%)`, filter: "blur(34px)", animation: "floatB 26s ease-in-out infinite" }} />
          {HERO_ORBS.map((s, i) => <div key={i} style={s} />)}
        </div>

        <div style={{ maxWidth: 1120, margin: "0 auto", position: "relative", zIndex: 2, textAlign: "center" }}>
          <div style={{ margin: "0 auto 44px", width: "clamp(120px, 15vw, 176px)", ...heroReveal(0, "scale") }}>
            <OluneLogo variant="mark" theme="dark" size="hero" animated />
          </div>
          <h1 style={{ margin: "0 0 32px" }}>
            <span style={{ display: "block", fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(46px, 7.4vw, 118px)", lineHeight: 1.02, color: NAVY, letterSpacing: "-0.02em" }}>
              {heroWords1.map((w, i) => (
                // Real space between the word spans, not marginRight: the gap has
                // to survive HTML-to-text extraction. Crawlers (and LLM readers)
                // concatenate text nodes and ignore CSS, so margin-only spacing
                // served the H1 as one unreadable token.
                <Fragment key={i}>
                  {i > 0 ? " " : null}
                  <span style={{ display: "inline-block", ...heroReveal(i + 1, "blur") }}>{w}</span>
                </Fragment>
              ))}
            </span>
            {/* Separates the two display:block lines for text extractors. Whitespace-only
                content between block boxes generates no box, so this renders nothing. */}
            {" "}
            <span style={{ display: "block", fontFamily: DISPLAY, fontWeight: 500, fontStyle: "italic", fontSize: "clamp(46px, 7.4vw, 118px)", lineHeight: 1.04, letterSpacing: "-0.02em" }}>
              {heroWords2.map((w, i) => (
                <Fragment key={i}>
                  {i > 0 ? " " : null}
                  <span style={{ display: "inline-block", color: ACCENT, ...heroReveal(i + heroWords1.length + 1, "blur") }}>{w}</span>
                </Fragment>
              ))}
            </span>
          </h1>
          <p style={{ fontSize: 20, lineHeight: 1.7, color: "rgba(26,21,53,0.62)", maxWidth: 640, margin: "0 auto 44px", ...heroReveal(heroWords1.length + heroWords2.length + 1, "up") }}>{t("hero.subtitle")}</p>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 36, flexWrap: "wrap", marginBottom: 56, ...heroReveal(heroWords1.length + heroWords2.length + 2, "up") }}>
            <Link href="/onboarding" className="dcl-cta-primary" style={ctaPrimaryStyle}>{t("startFree")} <span aria-hidden>→</span></Link>
            <a href="#features" className="dcl-cta-glass" style={ctaGlassStyle}>{t("hero.seeInAction")}</a>
          </div>
          <p style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "clamp(17px, 1.6vw, 21px)", color: "rgba(26,21,53,0.4)", maxWidth: 620, margin: "0 auto", lineHeight: 1.5, ...heroReveal(heroWords1.length + heroWords2.length + 3, "up") }}>&quot;{t("hero.quote")}&quot;</p>
        </div>

        <div
          className="dcl-hero-chip"
          style={{ position: "absolute", right: 48, bottom: 24, zIndex: 3, ...heroChipStyle, ...heroReveal(heroWords1.length + heroWords2.length + 4, "up") }}
        >
          <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: ACCENT, animation: "livePulse 2s ease-in-out infinite", flexShrink: 0 }} />
          <span><b style={{ color: NAVY, fontWeight: 700 }}>{t("problem.eyebrow")}</b> — {t.rich("problem.sceneCaption", italic)}</span>
        </div>

        <div style={{ marginTop: 68, overflow: "hidden", position: "relative", zIndex: 2, maskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)", WebkitMaskImage: "linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)", ...GLASS_PANEL }}>
          <div style={{ display: "flex", width: "max-content", animation: "oluneMarquee 28s linear infinite", padding: "30px 0" }}>
            {tickerLoop.map((word, i) => (
              <span key={i} style={{ display: "flex", alignItems: "center", gap: 28, padding: "0 28px", fontFamily: DISPLAY, fontStyle: "italic", fontSize: 22, color: "rgba(26,21,53,0.34)", whiteSpace: "nowrap" }}>
                {word}
                <span style={{ color: ACCENT, fontSize: 13 }}>✦</span>
              </span>
            ))}
          </div>
        </div>
        <div style={{ height: 30 }} />
      </section>

      {/* HUMAN BIT */}
      <section id="human" ref={sectionRef("human")} className="dcl-section" style={sectionStyle("#f7f6fb")}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{DECOR_A.map((s, i) => <div key={i} style={s} />)}</div>
        <div className="dcl-grid-human" style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.35fr", gap: 80, alignItems: "start", position: "relative", zIndex: 2 }}>
          <div style={reveal("human", 0, "left")}>
            <div style={eyebrowStyle}><span style={accentDotStyle} />{t("problem.eyebrow")}</div>
            <div style={{ position: "relative", overflow: "hidden", borderRadius: 22, marginTop: 30, aspectRatio: "3 / 3.6", background: "linear-gradient(180deg, #191344 0%, #16112e 52%, #221a4e 100%)", boxShadow: "0 50px 100px -50px rgba(26,21,53,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Starfield items={sceneStars} />
              <div style={mkShoot("10%", "4%", 1.2, 7)} />
              <div style={mkShoot("26%", "34%", 4.6, 9)} />
              <div style={{ position: "absolute", top: "13%", left: "56%", width: 92, height: 92, animation: "bobY 8s ease-in-out infinite", filter: `drop-shadow(0 0 30px ${ACCENT}88)`, zIndex: 1 }}>
                <div style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: PURPLE_GRAD }} />
                <div style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: "#131028" }} />
              </div>
              <div style={{ position: "absolute", bottom: "-26%", left: "-24%", width: "110%", height: "46%", borderRadius: "50%", background: "#131028" }} />
              <div style={{ position: "absolute", bottom: "-30%", right: "-30%", width: "120%", height: "44%", borderRadius: "50%", background: "#0e0b20" }} />
              <div style={{ position: "absolute", bottom: "17%", left: "38%", width: 9, height: 12, borderRadius: 2, background: "#ffd9a0", boxShadow: "0 0 16px rgba(255,217,160,0.9)", animation: "twinkle 4s ease-in-out infinite" }} />
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 24px", fontSize: 14, color: "rgba(255,255,255,0.66)", background: "linear-gradient(180deg, rgba(14,11,32,0) 0%, rgba(14,11,32,0.85) 60%)", zIndex: 2 }}>
                {t.rich("problem.sceneCaption", italic)}
              </div>
            </div>
          </div>
          <div>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(34px, 4.4vw, 64px)", lineHeight: 1.1, margin: "0 0 40px", color: NAVY, letterSpacing: "-0.015em", ...reveal("human", 1, "up") }}>{t("problem.title")}</h2>
            <p style={{ fontSize: 19, lineHeight: 1.72, color: "rgba(26,21,53,0.64)", maxWidth: 640, margin: "0 0 24px", ...reveal("human", 2, "up") }}>{t("problem.body1")}</p>
            <p style={{ fontSize: 19, lineHeight: 1.72, color: "rgba(26,21,53,0.64)", maxWidth: 640, margin: 0, ...reveal("human", 3, "up") }}>{t("problem.body2")}</p>
          </div>
        </div>

        <div style={{ maxWidth: 1120, margin: "84px auto 0", position: "relative", zIndex: 2, ...reveal("human", 5, "up") }}>
          <div className="dcl-grid-band" style={{ display: "grid", gridTemplateColumns: "1.25fr auto 1fr", gap: 44, alignItems: "center" }}>
            <div>
              <div style={{ ...eyebrowStyle, marginBottom: 24 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(26,21,53,0.28)", display: "inline-block" }} />{t("problem.oldWay")}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, maxWidth: 470 }}>
                {chaosLabels.map((label, i) => (
                  <div key={label} style={{ transform: `rotate(${(i % 2 ? 1 : -1) * (3 + (i % 4) * 2)}deg)` }}>
                    <div className="dcl-chip" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "11px 17px", borderRadius: 999, background: "rgba(26,21,53,0.05)", border: "1px solid rgba(26,21,53,0.1)", color: "rgba(26,21,53,0.5)", fontSize: 14, fontWeight: 500, whiteSpace: "nowrap", animation: `drift ${4 + (i % 4)}s ease-in-out ${(i % 5) * 0.4}s infinite`, transition: "transform 0.3s ease, border-color 0.3s ease, color 0.3s ease", cursor: "default" }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="dcl-band-arrow" style={{ color: ACCENT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46, animation: "bobY 4s ease-in-out infinite" }}>→</div>
            <div>
              <div style={{ ...eyebrowAccentStyle, marginBottom: 24 }}><span style={accentDotStyle} />{t("problem.newWay")}</div>
              <div style={{ background: "#ffffff", borderRadius: 20, padding: 32, boxShadow: "0 40px 90px -50px rgba(26,21,53,0.5)", border: "1px solid rgba(26,21,53,0.06)", display: "flex", alignItems: "center", gap: 20 }}>
                <span style={{ position: "relative", width: 48, height: 48, flexShrink: 0, filter: "drop-shadow(0 6px 16px rgba(139,124,240,0.5))" }}>
                  <span style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: ACCENT }} />
                  <span style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY }} />
                </span>
                <div>
                  <div style={{ fontFamily: DISPLAY, fontSize: 27, color: NAVY, lineHeight: 1 }}>olune</div>
                  <div style={{ fontSize: 14.5, color: "rgba(26,21,53,0.56)", marginTop: 6 }}>{t("problem.newWayCaption")}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* BENTO — EVERYTHING IN ONE PLACE */}
      <section id="bento" ref={sectionRef("bento")} className="dcl-section" style={sectionStyle("linear-gradient(180deg, #efeafb 0%, #f7f6fb 100%)")}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{DECOR_A.map((s, i) => <div key={i} style={s} />)}</div>
        <div style={{ maxWidth: 1120, margin: "0 auto 56px", textAlign: "center", position: "relative", zIndex: 2, ...reveal("bento", 0, "up") }}>
          <div style={{ ...eyebrowStyle, justifyContent: "center" }}><span style={accentDotStyle} />{t("bento.eyebrow")}</div>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(38px, 5.2vw, 78px)", lineHeight: 1.05, color: NAVY, margin: "22px 0 0", letterSpacing: "-0.02em" }}>{t("bento.title")}</h2>
        </div>
        <div className="dcl-grid-bento" style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridAutoRows: 210, gridAutoFlow: "dense", gap: 20, position: "relative", zIndex: 2 }}>
          {bentoCells.map((cell, i) => (
            <div key={cell.key} className={cell.feature ? "dcl-bento-feature-span" : "dcl-bento-span"} style={{ gridColumn: `span ${cell.col}`, gridRow: `span ${cell.row}`, ...reveal("bento", i + 1, "scale") }}>
              <div
                className={cell.feature ? "dcl-bento-feature" : "dcl-bento-card"}
                style={cell.feature
                  ? { position: "relative", overflow: "hidden", height: "100%", borderRadius: 18, padding: 38, background: `linear-gradient(160deg, #2a2154 0%, ${NAVY} 60%, #3a2f7a 100%)`, display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: `0 30px 70px -40px ${ACCENT}`, transition: "transform 0.5s cubic-bezier(.16,1,.3,1), box-shadow 0.5s ease" }
                  : { position: "relative", overflow: "hidden", height: "100%", borderRadius: 18, padding: 28, background: "#ffffff", border: "1px solid rgba(26,21,53,0.08)", display: "flex", flexDirection: "column", justifyContent: "space-between", boxShadow: "0 20px 44px -34px rgba(26,21,53,0.4)", transition: "transform 0.5s cubic-bezier(.16,1,.3,1), box-shadow 0.5s ease, border-color 0.5s ease" }}
              >
                <div style={{ position: "relative", flex: 1, minHeight: 96 }}>
                  <span style={{ width: cell.feature ? 16 : 11, height: cell.feature ? 16 : 11, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 16px ${ACCENT}`, display: "inline-block" }} />
                  {cell.art.map((a, k) => <div key={k} style={a} aria-hidden />)}
                  {cell.feature && (
                    <>
                      <div style={{ position: "absolute", top: 0, right: -6, width: "74%", maxWidth: 320, borderRadius: 12, overflow: "hidden", background: "#faf5fb", boxShadow: "0 34px 70px -26px rgba(0,0,0,0.75)", transform: "rotate(2deg)", border: "1px solid rgba(255,255,255,0.16)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 14px", borderBottom: "1px solid rgba(58,32,64,0.12)" }}>
                          <span style={{ fontFamily: DISPLAY, fontSize: 13, color: "#3a2040" }}>Tempo Dance Co.</span>
                          <span style={{ display: "flex", gap: 10, fontSize: 9.5, fontWeight: 700, color: "rgba(58,32,64,0.6)" }}><span>Classes</span><span>Timetable</span><span>Visit</span></span>
                        </div>
                        <div style={{ padding: "14px 14px 13px", background: "linear-gradient(135deg, #2a1a33 0%, #46284d 100%)" }}>
                          <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 16, lineHeight: 1.2, color: "#f3e4f6" }}>Term 3 enrolments open.</div>
                          <span style={{ display: "inline-block", marginTop: 8, padding: "4px 10px", borderRadius: 999, background: "#d4547e", color: "#ffffff", fontSize: 9, fontWeight: 700 }}>Book a trial class</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, padding: "10px 14px 12px" }}>
                          {["Ballet", "Hip hop", "Contemporary"].map((label, k) => (
                            <div key={label}>
                              <div style={{ height: 26, borderRadius: 6, background: ["repeating-linear-gradient(45deg, #ecd9ef 0 5px, #f3e7f5 5px 10px)", "repeating-linear-gradient(45deg, #e2cbe6 0 5px, #ecdbef 5px 10px)", "repeating-linear-gradient(45deg, #e8d2e2 0 5px, #f1e2ed 5px 10px)"][k] }} />
                              <div style={{ marginTop: 5, fontSize: 8.5, fontWeight: 700, color: "#3a2040" }}>{label}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div style={{ position: "absolute", left: 0, bottom: 4, display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(255,255,255,0.75)" }}><span style={liveDotStyle} />Published just now</div>
                    </>
                  )}
                </div>
                <div>
                  <h3 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: cell.feature ? 30 : 22, color: cell.feature ? "#ffffff" : NAVY, margin: "18px 0 8px", lineHeight: 1.15 }}>{cell.title}</h3>
                  <p style={{ fontSize: cell.feature ? 16 : 14.5, lineHeight: 1.6, color: cell.feature ? "rgba(255,255,255,0.72)" : "rgba(26,21,53,0.56)", margin: 0, maxWidth: 320 }}>{cell.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ maxWidth: 940, margin: "68px auto 0", position: "relative", zIndex: 2, ...reveal("bento", 8, "scale") }}>
          <div style={{ position: "relative", overflow: "hidden", borderRadius: 24, padding: "52px 40px", background: `linear-gradient(150deg, #241b4e 0%, ${NAVY} 55%, #2c2260 100%)`, boxShadow: `0 50px 110px -60px ${ACCENT}` }}>
            <Starfield items={statStars} />
            <div style={mkShoot("12%", "6%", 2.4, 8)} />
            <div className="dcl-grid-stats3" style={{ position: "relative", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", zIndex: 2 }}>
              {statBand.map((stat, i) => (
                <div key={stat.l} className="dcl-stat-cell" style={{ padding: "10px 24px", textAlign: "center", borderLeft: i === 0 ? "none" : "1px solid rgba(255,255,255,0.12)", ...reveal("bento", i + 9, "up") }}>
                  <div style={{ fontFamily: DISPLAY, fontSize: "clamp(44px, 4.6vw, 68px)", color: "#ffffff", lineHeight: 1, animation: `countGlow ${4 + i}s ease-in-out infinite` }}>{stat.n}</div>
                  <div style={{ width: 64, height: 2, borderRadius: 1, margin: "16px auto 14px", background: `linear-gradient(90deg, transparent, ${ACCENT}, transparent)`, transformOrigin: "center", animation: `growX ${3 + i * 0.5}s ease-in-out infinite alternate` }} />
                  <div style={{ fontSize: 15, color: "rgba(255,255,255,0.6)" }}>{stat.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* THREE JOBS / FEATURES */}
      <section id="features" ref={sectionRef("jobs")} className="dcl-section" style={sectionStyle("#efeafb")}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{DECOR_B.map((s, i) => <div key={i} style={s} />)}</div>
        <div style={{ maxWidth: 1120, margin: "0 auto 56px", textAlign: "center", position: "relative", zIndex: 2, ...reveal("jobs", 0, "up") }}>
          <div style={{ ...eyebrowStyle, justifyContent: "center" }}><span style={accentDotStyle} />{t("featuresSection.eyebrow")}</div>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(38px, 5.2vw, 78px)", lineHeight: 1.05, color: NAVY, margin: "22px 0 0", letterSpacing: "-0.02em" }}>{t("featuresSection.title")} {t("featuresSection.titleEmphasis")}</h2>
        </div>

        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 96, position: "relative", zIndex: 2 }}>
          {jobsRows.map((row, i) => (
            <div key={row.key} style={{ display: "flex", flexDirection: row.reverse ? "row-reverse" : "row", gap: 64, alignItems: "center", flexWrap: "wrap", ...reveal("jobs", i + 1, row.reverse ? "right" : "left") }}>
              <div style={{ flex: 1, minWidth: 320 }}>
                <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 20, color: ACCENT }}>{row.num}</div>
                <h3 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(27px, 2.8vw, 40px)", color: NAVY, margin: "18px 0 20px", lineHeight: 1.15, letterSpacing: "-0.015em" }}>{row.title}</h3>
                <p style={{ fontSize: 17, lineHeight: 1.75, color: "rgba(26,21,53,0.6)", maxWidth: 460, margin: 0 }}>{row.body}</p>
              </div>
              <div className="dcl-jobs-mock" style={{ flex: 1, minWidth: 320, display: "flex", justifyContent: "center", transition: "transform 0.55s cubic-bezier(.16,1,.3,1)" }}>
                <ChromeWindow width={row.chromeWidth} height={row.chromeHeight} url={row.url}>
                  <div style={{ width: "100%", height: "100%", background: "#fdfcff", display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start", padding: "26px 30px", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
                      <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 22, color: NAVY }}>{row.tag}</div>
                      <span style={liveBadgeStyle}><span style={liveDotStyle} />Live</span>
                    </div>

                    {row.key === "runClasses" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        {classRolls.map((task) => (
                          <div key={task.name} style={{ display: "flex", alignItems: "center", gap: 14, padding: "15px 18px", background: "#ffffff", border: "1px solid rgba(26,21,53,0.07)", borderRadius: 12, boxShadow: "0 12px 28px -22px rgba(26,21,53,0.4)" }}>
                            <span style={task.done
                              ? { width: 20, height: 20, borderRadius: "50%", background: ACCENT, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, animation: "checkPop 6s ease-in-out infinite", flexShrink: 0 }
                              : { width: 20, height: 20, borderRadius: "50%", border: "1.6px solid rgba(26,21,53,0.2)", flexShrink: 0 }}>{task.done ? "✓" : ""}</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13.5, fontWeight: 600, color: NAVY, marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{task.name}</div>
                              <div style={{ width: "100%", height: 7, borderRadius: 4, background: "rgba(26,21,53,0.06)", overflow: "hidden" }}>
                                <div style={{ width: task.pct, height: 7, borderRadius: 4, background: `linear-gradient(90deg, ${ACCENT}, #6d5bd0)`, transformOrigin: "left center", animation: `growX 3.4s ease-in-out ${task.delay} infinite alternate` }} />
                              </div>
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(26,21,53,0.45)", flexShrink: 0 }}>{task.pct}</span>
                          </div>
                        ))}
                        <div style={{ fontSize: 12.5, color: "rgba(26,21,53,0.45)", textAlign: "center" }}>Term 3 filling up · Ballet Grade 3 nearly full</div>
                      </div>
                    )}

                    {row.key === "money" && (
                      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 18 }}>
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(26,21,53,0.42)", marginBottom: 8 }}>This month</div>
                            <div style={{ fontFamily: DISPLAY, fontSize: 34, color: NAVY, lineHeight: 1, animation: "countGlow 4s ease-in-out infinite" }}>$14,280</div>
                          </div>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, background: `${ACCENT}16`, border: `1px solid ${ACCENT}44`, fontSize: 12.5, fontWeight: 700, color: NAVY, animation: "livePulse 3s ease-in-out infinite" }}>✓ Invoice #204 — Paid</span>
                        </div>
                        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 10, padding: "0 4px", borderBottom: "1px solid rgba(26,21,53,0.1)", minHeight: 120 }}>
                          {financeBars.map((h, k) => (
                            <div key={k} style={{ flex: 1, height: `${h}%`, borderRadius: "5px 5px 0 0", background: k === 5 ? `linear-gradient(180deg, ${ACCENT}, #6d5bd0)` : `${ACCENT}44`, transformOrigin: "bottom center", animation: `growY ${2.6 + (k % 3) * 0.5}s ease-in-out ${k * 0.25}s infinite alternate` }} />
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "rgba(26,21,53,0.4)", padding: "10px 4px 0" }}>
                          <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span><span>Jul</span>
                        </div>
                      </div>
                    )}

                    {row.key === "liveSites" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
                        <div style={{ fontSize: 13, color: "rgba(26,21,53,0.55)" }}>Editing <span style={{ fontWeight: 700, color: NAVY }}>tempodance.co.nz</span><span style={caretStyle} /></div>
                        <div style={{ flex: 1, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(26,21,53,0.12)", background: "#faf5fb", display: "flex", flexDirection: "column", boxShadow: "0 16px 36px -24px rgba(26,21,53,0.5)" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderBottom: "1px solid rgba(58,32,64,0.12)" }}>
                            <span style={{ fontFamily: DISPLAY, fontSize: 15, color: "#3a2040" }}>Tempo Dance Co.</span>
                            <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 10.5, fontWeight: 700, color: "rgba(58,32,64,0.6)" }}>
                              <span>Classes</span><span>Timetable</span><span>Visit</span>
                              <span style={{ padding: "4px 11px", borderRadius: 999, background: "#3a2040", color: "#faf5fb" }}>Enrol</span>
                            </span>
                          </div>
                          <div style={{ position: "relative", padding: "18px 16px 16px", background: "linear-gradient(135deg, #2a1a33 0%, #46284d 100%)", outline: `2px solid ${ACCENT}`, outlineOffset: -2 }}>
                            <span style={{ position: "absolute", top: 0, right: 0, fontSize: 9, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#ffffff", background: ACCENT, padding: "3px 9px", borderRadius: "0 0 0 6px" }}>Editing · Hero</span>
                            <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 21, color: "#f3e4f6", lineHeight: 1.15 }}>Every body can dance.</div>
                            <div style={{ fontSize: 11, color: "rgba(243,228,246,0.7)", margin: "6px 0 10px" }}>Classes 6 days a week · Ponsonby, Auckland</div>
                            <span style={{ display: "inline-block", padding: "5px 12px", borderRadius: 999, background: "#d4547e", color: "#ffffff", fontSize: 10.5, fontWeight: 700 }}>Book a trial class</span>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "12px 16px 14px" }}>
                            {cafeMenu.map((m) => (
                              <div key={m.name} style={{ background: "#ffffff", border: "1px solid rgba(58,32,64,0.12)", borderRadius: 8, overflow: "hidden" }}>
                                <div style={{ height: 34, background: m.swatch }} />
                                <div style={{ padding: "7px 9px" }}>
                                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#3a2040" }}>{m.name}</div>
                                  <div style={{ fontSize: 10, color: "rgba(58,32,64,0.55)" }}>{m.price}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div style={{ fontSize: 12.5, color: "rgba(26,21,53,0.45)", textAlign: "center" }}>Changes publish the moment you make them</div>
                      </div>
                    )}
                  </div>
                </ChromeWindow>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY STUDIOS */}
      <section id="why" ref={sectionRef("why")} className="dcl-section" style={sectionStyle("#f7f6fb")}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{DECOR_A.map((s, i) => <div key={i} style={s} />)}</div>
        <div style={{ maxWidth: 1120, margin: "0 auto 64px", textAlign: "center", position: "relative", zIndex: 2, ...reveal("why", 0, "up") }}>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(38px, 5.2vw, 78px)", lineHeight: 1.05, color: NAVY, margin: "22px 0 0", letterSpacing: "-0.02em" }}>{t("whyChoose.title")} {t("whyChoose.titleEmphasis")}</h2>
        </div>
        <div className="dcl-grid-why" style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0, position: "relative", zIndex: 2 }}>
          {whyCards.map((card, i) => (
            <div key={card.num} style={reveal("why", i + 1, "up")}>
              <div className="dcl-why-card dcl-why-inner" style={{ padding: "10px 40px", borderLeft: i === 0 ? "none" : "1px solid rgba(26,21,53,0.12)", transition: "transform 0.42s cubic-bezier(.16,1,.3,1)" }}>
                <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 34, color: ACCENT }}>{card.num}</div>
                <h3 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, color: NAVY, margin: "22px 0 16px", lineHeight: 1.25 }}>{card.title}</h3>
                <p style={{ fontSize: 16, lineHeight: 1.7, color: "rgba(26,21,53,0.58)", margin: 0 }}>{card.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* EVERYDAY DIFFERENCE */}
      <section id="everyday" ref={sectionRef("everyday")} className="dcl-section" style={sectionStyle("#efeafb")}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{DECOR_B.map((s, i) => <div key={i} style={s} />)}</div>
        <div style={{ maxWidth: 1120, margin: "0 auto 64px", textAlign: "center", position: "relative", zIndex: 2, ...reveal("everyday", 0, "up") }}>
          <div style={{ ...eyebrowStyle, justifyContent: "center" }}><span style={accentDotStyle} />{t("everyday.eyebrow")}</div>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(34px, 4.8vw, 64px)", lineHeight: 1.08, color: NAVY, margin: "22px 0 0", letterSpacing: "-0.018em" }}>{t("everyday.title")}</h2>
        </div>
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 28, position: "relative", zIndex: 2 }}>
          {everydayItems.map((item, i) => (
            <div key={item.num} style={reveal("everyday", i + 1, "up")}>
              <div className="dcl-everyday-card" style={{ height: "100%", padding: "34px 30px", background: "#ffffff", borderRadius: 10, boxShadow: "0 24px 50px -34px rgba(26,21,53,0.35)", border: "1px solid rgba(26,21,53,0.05)", transition: "transform 0.42s cubic-bezier(.16,1,.3,1), box-shadow 0.42s ease, border-color 0.42s ease" }}>
                <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 26, color: ACCENT }}>{item.num}</div>
                <h3 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 22, color: NAVY, margin: "20px 0 14px", lineHeight: 1.25 }}>{item.title}</h3>
                <p style={{ fontSize: 15.5, lineHeight: 1.65, color: "rgba(26,21,53,0.58)", margin: 0 }}>{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* PROMISE / CLIMAX — the light wins */}
      <section id="promise" ref={sectionRef("promise")} className="dcl-section" style={{ position: "relative", background: "#16112e", padding: "170px 48px", overflow: "hidden", textAlign: "center", borderRadius: "48px 48px 0 0", marginTop: -48, boxShadow: "0 -34px 80px -34px rgba(26,21,53,0.4)" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "linear-gradient(180deg, #100910, #FFFBF7)" }}><Starfield items={climaxStars} /></div>
        <div aria-hidden style={{ position: "absolute", top: "6%", left: "50%", width: 980, height: 980, marginLeft: -490, borderRadius: "50%", background: `repeating-conic-gradient(from 0deg, ${ACCENT}22 0deg 3deg, transparent 3deg 15deg)`, opacity: revealed.promise ? 0.55 : 0, transition: "opacity 1900ms ease", animation: "spinSlow 80s linear infinite", WebkitMaskImage: "radial-gradient(circle, #000 0%, transparent 60%)", maskImage: "radial-gradient(circle, #000 0%, transparent 60%)", pointerEvents: "none", zIndex: 0 }} />
        <div aria-hidden style={{ position: "absolute", top: "6%", left: "50%", width: "clamp(280px, 34vw, 460px)", height: "clamp(280px, 34vw, 460px)", transform: "translateX(-50%)", zIndex: 1, pointerEvents: "none", filter: `drop-shadow(0 0 90px ${ACCENT}66)` }}>
          <div style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: PURPLE_GRAD, boxShadow: `0 0 120px ${ACCENT}88`, animation: "pulseGlow 7s ease-in-out infinite" }} />
          <div style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY, transform: `translate(${cp.tx}%, ${cp.ty}%)`, opacity: cp.op, transition: "transform 1700ms cubic-bezier(.16,1,.3,1), opacity 1700ms ease" }} />
        </div>
        <div style={{ maxWidth: 880, margin: "0 auto", position: "relative", zIndex: 3, ...reveal("promise", 0, "scale") }}>
          <div style={{ ...eyebrowDarkStyle, justifyContent: "center" }}><span style={accentDotStyle} />{t("promise.eyebrow")}</div>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontStyle: "italic", fontSize: "clamp(40px, 6.6vw, 96px)", lineHeight: 1.05, color: "#ffffff", margin: "26px 0 34px", letterSpacing: "-0.02em" }}>{t("promise.title")} {t("promise.titleEmphasis")}</h2>
          <p style={{ fontSize: 19, lineHeight: 1.75, color: "rgba(255,255,255,0.68)", maxWidth: 620, margin: "0 auto 48px" }}>{t("promise.body")}</p>
          <Link href="/onboarding" className="dcl-cta-dark" style={ctaOnDarkStyle}>{t("promise.cta")} <span aria-hidden>→</span></Link>
          <p style={{ margin: "22px 0 0", fontSize: 14, color: "rgba(255,255,255,0.45)" }}>{t("promise.footnote")}</p>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" ref={pricingSectionRef} className="dcl-section" style={{ ...sectionStyle("#f7f6fb"), boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.2)" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{DECOR_A.map((s, i) => <div key={i} style={s} />)}</div>
        <div style={{ maxWidth: 1120, margin: "0 auto 60px", textAlign: "center", position: "relative", zIndex: 2, ...reveal("pricing", 0, "up") }}>
          <div style={{ ...eyebrowStyle, justifyContent: "center" }}><span style={accentDotStyle} />{t("pricingSection.eyebrow")}</div>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(38px, 5.2vw, 78px)", lineHeight: 1.05, color: NAVY, margin: "22px 0 20px", letterSpacing: "-0.02em" }}>{t("pricingSection.title")} {t("pricingSection.titleEmphasis")}</h2>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(26,21,53,0.56)", maxWidth: 560, margin: "0 auto" }}>{t("pricingSection.subtitle")}</p>
        </div>

        <div className="dcl-grid-pricing" style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, alignItems: "stretch", position: "relative", zIndex: 2 }}>
          {pricingTiers.map((tier, i) => (
            <div key={tier.key} style={reveal("pricing", i + 1, "up")}>
              <div
                className={tier.highlight ? "dcl-tier-hot" : "dcl-tier"}
                style={tier.highlight
                  ? { position: "relative", background: `linear-gradient(165deg, #2a2154 0%, ${NAVY} 55%, #4a3aa0 100%)`, borderRadius: 12, padding: "50px 40px", boxShadow: `0 40px 90px -34px ${ACCENT}`, transform: "translateY(-16px)", display: "flex", flexDirection: "column", transition: "transform 0.5s cubic-bezier(.16,1,.3,1), box-shadow 0.5s ease" }
                  : { position: "relative", height: "100%", background: "#ffffff", borderRadius: 12, padding: "50px 40px", border: "1px solid rgba(26,21,53,0.09)", display: "flex", flexDirection: "column", transition: "transform 0.5s cubic-bezier(.16,1,.3,1), box-shadow 0.5s ease, border-color 0.5s ease" }}
              >
                {tier.highlight && (
                  <div style={{ position: "absolute", top: -14, left: "50%", transform: "translateX(-50%)", background: ACCENT, color: NAVY, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "6px 16px", borderRadius: 999, boxShadow: `0 8px 24px -6px ${ACCENT}` }}>{t("pricingSection.mostPopular")}</div>
                )}
                <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: tier.highlight ? ACCENT : "rgba(26,21,53,0.38)", marginBottom: 14 }}>{tier.tagline}</div>
                <h3 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 30, color: tier.highlight ? "#ffffff" : NAVY, margin: "0 0 22px" }}>{tier.name}</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 22 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 56, color: tier.highlight ? "#ffffff" : NAVY }}>{tier.price}</span>
                  <span style={{ fontSize: 16, color: tier.highlight ? "rgba(255,255,255,0.65)" : "rgba(26,21,53,0.44)" }}>{t("pricingSection.perMonth")}</span>
                </div>
                <p style={{ fontSize: 15.5, lineHeight: 1.65, color: tier.highlight ? "rgba(255,255,255,0.8)" : "rgba(26,21,53,0.56)", flex: 1, margin: "0 0 30px" }}>{tier.body}</p>
                <Link href="/onboarding" style={tier.highlight
                  ? { display: "inline-flex", justifyContent: "center", padding: "16px 0", borderRadius: 999, background: "#ffffff", color: NAVY, fontWeight: 700, fontSize: 15.5 }
                  : { display: "inline-flex", justifyContent: "center", padding: "16px 0", borderRadius: 999, background: "transparent", color: NAVY, fontWeight: 700, fontSize: 15.5, border: "1px solid rgba(26,21,53,0.26)" }}>{t("startFree")}</Link>
              </div>
            </div>
          ))}
        </div>

        <p style={{ maxWidth: 780, margin: "56px auto 0", textAlign: "center", fontSize: 14.5, lineHeight: 1.7, color: "rgba(26,21,53,0.48)", position: "relative", zIndex: 2 }}>{t("pricingSection.includes")} {t("pricingSection.includesBody")}</p>

        <div style={{ maxWidth: 760, margin: "56px auto 0", borderTop: "1px solid rgba(26,21,53,0.14)", borderBottom: "1px solid rgba(26,21,53,0.14)", padding: "36px 0", textAlign: "center", position: "relative", zIndex: 2 }}>
          <p style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "clamp(19px, 2.2vw, 25px)", lineHeight: 1.5, color: NAVY, margin: 0 }}>
            <span style={{ color: ACCENT, fontWeight: 600, fontStyle: "normal", fontFamily: BODY, fontSize: 14, letterSpacing: "0.08em", textTransform: "uppercase", display: "block", marginBottom: 14 }}>{t("pricingSection.honestMath")}</span>
            {t("pricingSection.honestMathBody")}
          </p>
        </div>

        <div style={{ textAlign: "center", marginTop: 48, position: "relative", zIndex: 2 }}>
          <Link href="/onboarding" className="dcl-cta-primary" style={ctaPrimaryStyle}>{t("startFree")} <span aria-hidden>→</span></Link>
          <p style={{ margin: "18px 0 0", fontSize: 14, color: "rgba(26,21,53,0.48)" }}>{t("pricingSection.trialNote")}</p>
        </div>
      </section>

      {/* ABOUT */}
      <section id="about" ref={sectionRef("about")} className="dcl-section" style={sectionStyle("#efeafb")}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{DECOR_B.map((s, i) => <div key={i} style={s} />)}</div>
        <div className="dcl-grid-about" style={{ maxWidth: 1120, margin: "0 auto", display: "grid", gridTemplateColumns: "0.9fr 1.1fr", gap: 80, alignItems: "stretch", position: "relative", zIndex: 2 }}>
          <div style={{ ...reveal("about", 0, "left"), display: "flex" }}>
            <div style={{ position: "relative", overflow: "hidden", flex: 1, minHeight: 520, borderRadius: 22, background: "radial-gradient(circle at 50% 42%, #221a4e 0%, #16112e 62%, #120e26 100%)", boxShadow: "0 50px 100px -50px rgba(26,21,53,0.8)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <Starfield items={aboutStars} />
              <div style={mkShoot("8%", "8%", 3.4, 9)} />
              <div style={mkRing(190, 20, "normal")}><span style={mkPlanet(13, ACCENT)} /></div>
              <div style={mkRing(285, 34, "reverse")}><span style={mkPlanet(10, "#d6ccff")} /></div>
              <div style={mkRing(380, 48, "normal")}><span style={mkPlanet(16, `radial-gradient(circle at 35% 32%, #d6ccff, ${ACCENT})`)} /></div>
              <div style={{ position: "absolute", top: "50%", left: "50%", width: 110, height: 110, marginLeft: -55, marginTop: -55, animation: "introBreathe 6s ease-in-out infinite", filter: `drop-shadow(0 0 36px ${ACCENT}99)`, zIndex: 1 }}>
                <div style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: PURPLE_GRAD }} />
                <div style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: "#131028" }} />
              </div>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "20px 24px", fontSize: 14, color: "rgba(255,255,255,0.66)", background: "linear-gradient(180deg, rgba(14,11,32,0) 0%, rgba(14,11,32,0.85) 60%)", zIndex: 2 }}>
                {t.rich("aboutSection.sceneCaption", italic)}
              </div>
            </div>
          </div>
          <div style={reveal("about", 1, "right")}>
            <div style={eyebrowStyle}><span style={accentDotStyle} />{t("aboutSection.eyebrow")}</div>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(32px, 4.4vw, 56px)", lineHeight: 1.12, color: NAVY, margin: "22px 0 30px", letterSpacing: "-0.018em" }}>{t("aboutSection.title")} {t("aboutSection.titleEmphasis")}</h2>
            <p style={{ fontSize: 17.5, lineHeight: 1.75, color: "rgba(26,21,53,0.62)", margin: "0 0 22px" }}>{t("aboutSection.body1")}</p>
            <p style={{ fontSize: 17.5, lineHeight: 1.75, color: "rgba(26,21,53,0.62)", margin: "0 0 40px" }}>{t("aboutSection.body2")}</p>
            <div style={{ display: "flex", gap: 36, marginBottom: 48 }}>
              <Link href="/team" className="dcl-cta-ghost" style={ctaGhostStyle}>{t("aboutSection.meetTeam")}</Link>
              <Link href="/team" className="dcl-cta-ghost" style={ctaGhostStyle}>{t("aboutSection.ourStory")}</Link>
            </div>
            <div className="dcl-grid-stats3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, paddingTop: 40, borderTop: "1px solid rgba(26,21,53,0.14)" }}>
              {(["studioRun", "calm", "allInOne"] as const).map((k) => (
                <div key={k}>
                  <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 22, color: ACCENT, marginBottom: 8 }}>{t(`aboutSection.principles.${k}.t`)}</div>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(26,21,53,0.56)", margin: 0 }}>{t(`aboutSection.principles.${k}.d`)}</p>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 22, marginTop: 44, padding: "28px 30px", background: "#ffffff", borderRadius: 16, boxShadow: "0 30px 70px -46px rgba(26,21,53,0.45)", border: "1px solid rgba(26,21,53,0.05)" }}>
              <span style={{ position: "relative", width: 44, height: 44, flexShrink: 0, filter: "drop-shadow(0 6px 16px rgba(139,124,240,0.5))" }}>
                <span style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: ACCENT }} />
                <span style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY }} />
              </span>
              <p style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "clamp(22px, 2.4vw, 30px)", color: NAVY, margin: 0, lineHeight: 1.25 }}>&quot;{t("aboutSection.quote")}&quot;</p>
            </div>
          </div>
        </div>
      </section>

      {/* UPDATES — release notes. Newest release leads as a lit glass card, the
          rest hang off a rail beneath it. Copy lives in landing/releases-data.ts. */}
      <section id="updates" ref={sectionRef("updates")} className="dcl-section" style={{ position: "relative", background: "radial-gradient(circle at 50% -12%, #2b2158 0%, #1c1541 40%, #16112e 100%)", padding: "118px 48px 126px", overflow: "hidden", borderRadius: "48px 48px 0 0", marginTop: -48, boxShadow: "0 -34px 80px -34px rgba(26,21,53,0.4)" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <Starfield items={releaseStars} />
          <div style={mkShoot("12%", "6%", 2.4, 9)} />
          <div style={mkShoot("40%", "58%", 6.6, 11)} />
          <div style={{ position: "absolute", top: "-24%", left: "50%", width: 900, height: 900, marginLeft: -450, borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT}33 0%, ${ACCENT}00 64%)`, animation: "pulseGlow 12s ease-in-out infinite" }} />
        </div>

        <div style={{ maxWidth: 900, margin: "0 auto 58px", textAlign: "center", position: "relative", zIndex: 2, ...reveal("updates", 0, "up") }}>
          <div style={{ ...eyebrowDarkStyle, justifyContent: "center" }}><span style={accentDotStyle} />Release notes</div>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(36px, 4.8vw, 66px)", lineHeight: 1.08, color: "#ffffff", margin: "22px 0 22px", letterSpacing: "-0.02em" }}>
            Built in the open, <span style={{ fontStyle: "italic", color: ACCENT }}>shipped every week</span>
          </h2>
          <p style={{ fontSize: 17.5, lineHeight: 1.7, color: "rgba(255,255,255,0.6)", maxWidth: 600, margin: "0 auto" }}>
            Every release, dated and written down. Nothing here is a roadmap promise — it&apos;s already live in your studio.
          </p>
        </div>

        {/* the latest release */}
        <div style={{ maxWidth: 1080, margin: "0 auto", position: "relative", zIndex: 2, ...reveal("updates", 1, "scale") }}>
          <div className="dcl-rel-latest" style={{ position: "relative", overflow: "hidden", borderRadius: 22, padding: "clamp(30px, 3.6vw, 50px)", background: "linear-gradient(150deg, rgba(255,255,255,0.11) 0%, rgba(255,255,255,0.04) 46%, rgba(139,124,240,0.18) 100%)", border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(18px) saturate(1.35)", WebkitBackdropFilter: "blur(18px) saturate(1.35)", boxShadow: `0 60px 120px -56px ${ACCENT}`, transition: "transform 0.5s cubic-bezier(.16,1,.3,1), box-shadow 0.5s ease, border-color 0.5s ease" }}>
            <div aria-hidden style={{ position: "absolute", top: -140, right: -110, width: 420, height: 420, borderRadius: "50%", background: `radial-gradient(circle, ${ACCENT}55 0%, ${ACCENT}00 68%)`, filter: "blur(20px)", animation: "floatA 22s ease-in-out infinite", pointerEvents: "none" }} />
            <div className="dcl-grid-release" style={{ position: "relative", zIndex: 1, display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(28px, 4vw, 56px)", alignItems: "start" }}>
              <div>
                <span style={{ ...liveBadgeStyle, background: `${ACCENT}22`, borderColor: `${ACCENT}66` }}><span style={liveDotStyle} />Latest release</span>
                <div style={{ display: "flex", alignItems: "baseline", gap: 16, marginTop: 26, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(56px, 8vw, 104px)", lineHeight: 0.9, letterSpacing: "-0.03em", background: `linear-gradient(90deg, #ffffff, ${ACCENT}, #ffffff)`, backgroundSize: "200% auto", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "shimmer 6s linear infinite" }}>{latestRelease.version}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.42)" }}>{latestRelease.date}</span>
                </div>
                <h3 style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: "clamp(28px, 3.4vw, 44px)", lineHeight: 1.15, color: "#ffffff", margin: "18px 0 20px", letterSpacing: "-0.015em" }}>{latestRelease.name}</h3>
                <p style={{ fontSize: 16.5, lineHeight: 1.72, color: "rgba(255,255,255,0.66)", margin: 0 }}>{latestRelease.summary}</p>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                {latestRelease.points.map((point, i) => (
                  <li key={point} style={{ display: "flex", alignItems: "flex-start", gap: 14, padding: "16px 0", borderBottom: i === latestRelease.points.length - 1 ? "none" : "1px solid rgba(255,255,255,0.09)" }}>
                    <span aria-hidden style={{ position: "relative", width: 15, height: 15, flexShrink: 0, marginTop: 4 }}>
                      <span style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: PURPLE_GRAD, boxShadow: `0 0 12px ${ACCENT}aa` }} />
                      <span style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: "#1d1640" }} />
                    </span>
                    <span style={{ fontSize: 15.5, lineHeight: 1.6, color: "rgba(255,255,255,0.82)" }}>{point}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* everything before it, on the rail */}
        <div style={{ maxWidth: 1080, margin: "56px auto 0", position: "relative", zIndex: 2 }}>
          <div style={{ position: "relative", marginLeft: 8, paddingLeft: 42, borderLeft: `1px solid ${ACCENT}3d` }}>
            {pastReleases.map((release, i) => (
              <div key={release.version} style={reveal("updates", i + 2, "up")}>
                <div className="dcl-rel-row dcl-grid-release-row" style={{ position: "relative", display: "grid", gridTemplateColumns: "160px 1fr", gap: 28, padding: "28px 30px", marginBottom: 18, borderRadius: 16, border: "1px solid rgba(255,255,255,0.09)", background: "rgba(255,255,255,0.035)", transition: "transform 0.42s cubic-bezier(.16,1,.3,1), background 0.42s ease, border-color 0.42s ease" }}>
                  <span aria-hidden style={{ position: "absolute", left: -48, top: 34, width: 12, height: 12, borderRadius: "50%", background: PURPLE_GRAD, boxShadow: `0 0 14px ${ACCENT}aa`, border: "2px solid #1a1440" }} />
                  <div>
                    <div style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 38, lineHeight: 1, color: "rgba(255,255,255,0.9)", letterSpacing: "-0.02em" }}>{release.version}</div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(255,255,255,0.36)", marginTop: 12 }}>{release.date}</div>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: 26, color: ACCENT, margin: "0 0 12px", lineHeight: 1.2 }}>{release.name}</h3>
                    <p style={{ fontSize: 15.5, lineHeight: 1.68, color: "rgba(255,255,255,0.62)", margin: "0 0 18px" }}>{release.summary}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {release.points.map((point) => (
                        <span key={point} style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "8px 15px", borderRadius: 999, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", fontSize: 13.5, lineHeight: 1.4, color: "rgba(255,255,255,0.72)" }}>
                          <span aria-hidden style={{ width: 5, height: 5, borderRadius: "50%", background: ACCENT, flexShrink: 0 }} />
                          {point}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* what's still coming */}
        <div className="dcl-grid-nextup" style={{ maxWidth: 1080, margin: "46px auto 0", display: "grid", gridTemplateColumns: "1fr auto", gap: 32, alignItems: "center", padding: "32px 36px", borderRadius: 18, border: `1px dashed ${ACCENT}55`, background: `${ACCENT}12`, position: "relative", zIndex: 2, ...reveal("updates", pastReleases.length + 2, "up") }}>
          <div>
            <div style={{ ...eyebrowAccentStyle }}><span style={accentDotStyle} />{NEXT_UP.label}</div>
            <h3 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(24px, 2.8vw, 34px)", color: "#ffffff", margin: "16px 0 12px", lineHeight: 1.2 }}>
              {NEXT_UP.title} <span style={{ fontStyle: "italic", color: ACCENT }}>· {NEXT_UP.date}</span>
            </h3>
            <p style={{ fontSize: 15.5, lineHeight: 1.7, color: "rgba(255,255,255,0.62)", margin: 0, maxWidth: 620 }}>{NEXT_UP.body}</p>
          </div>
          <Link href="/onboarding" className="dcl-cta-dark" style={ctaOnDarkStyle}>{t("startFree")} <span aria-hidden>→</span></Link>
        </div>
      </section>

      {/* COMPARE */}
      <section id="compare" ref={sectionRef("compare")} className="dcl-section" style={sectionStyle("#f7f6fb")}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>{DECOR_A.map((s, i) => <div key={i} style={s} />)}</div>
        <div style={{ maxWidth: 900, margin: "0 auto 56px", textAlign: "center", position: "relative", zIndex: 2, ...reveal("compare", 0, "up") }}>
          <div style={{ ...eyebrowStyle, justifyContent: "center" }}><span style={accentDotStyle} />{t("compareSection.eyebrow")}</div>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(36px, 4.8vw, 66px)", lineHeight: 1.08, color: NAVY, margin: "22px 0 24px", letterSpacing: "-0.02em" }}>{t("compareSection.title")}</h2>
          <p style={{ fontSize: 17.5, lineHeight: 1.7, color: "rgba(26,21,53,0.56)", maxWidth: 620, margin: "0 auto" }}>{t("compareSection.subtitle")}</p>
        </div>

        <div style={{ maxWidth: 940, margin: "0 auto", background: "#ffffff", borderRadius: 12, padding: "8px 0", position: "relative", zIndex: 2, boxShadow: "0 40px 90px -50px rgba(26,21,53,0.45)", ...reveal("compare", 1, "up") }}>
          <div className="dcl-compare-row-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", padding: "26px 30px 20px", borderBottom: `2px solid ${NAVY}` }}>
            <div />
            <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "rgba(26,21,53,0.4)" }}>{t("compareSection.stackHeader")}</div>
            <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 18, color: ACCENT }}>olune</div>
          </div>
          {compareRows.map((row, i) => (
            <div key={row.label} className="dcl-compare-row dcl-compare-row-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", padding: "22px 30px", borderBottom: i === compareRows.length - 1 ? "none" : "1px solid rgba(26,21,53,0.09)", alignItems: "center", transition: "background 0.3s ease, transform 0.3s ease" }}>
              <div style={{ fontSize: 16.5, fontWeight: 600, color: NAVY }}>{row.label}</div>
              <div style={{ fontSize: 15, color: "rgba(26,21,53,0.46)" }}>{row.usual}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 15, fontWeight: 600, color: NAVY }}>
                <span style={{ color: ACCENT, fontSize: 16 }}>✓</span>{row.olune}
              </div>
            </div>
          ))}
        </div>

        <div className="dcl-grid-stats3" style={{ maxWidth: 940, margin: "64px auto 0", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40, textAlign: "center", position: "relative", zIndex: 2, ...reveal("compare", 2, "up") }}>
          {compareHighlights.map((h) => (
            <div key={h.k}>
              <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 27, color: ACCENT, marginBottom: 10 }}>{h.k}</div>
              <p style={{ fontSize: 15, color: "rgba(26,21,53,0.54)", lineHeight: 1.6, margin: 0 }}>{h.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FOOTER */}
      <footer ref={sectionRef("footer")} className="dcl-section" style={{ background: "#16112e", padding: "96px 48px 56px", position: "relative", overflow: "hidden", borderRadius: "48px 48px 0 0", marginTop: -48, boxShadow: "0 -34px 80px -34px rgba(26,21,53,0.4)" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <Starfield items={footerStars} />
          <div style={mkShoot("10%", "10%", 1.8, 8)} />
          <div style={mkShoot("30%", "48%", 5.2, 10)} />
        </div>
        <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 2, ...reveal("footer", 0, "up") }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <p style={{ fontSize: 16, color: "rgba(255,255,255,0.5)", margin: "0 0 32px" }}>{t("tagline")}</p>
          </div>
          <h2 style={{ fontFamily: DISPLAY, fontStyle: "italic", fontWeight: 500, fontSize: "clamp(80px, 16vw, 260px)", lineHeight: 1, textAlign: "center", margin: "0 0 60px", letterSpacing: "-0.02em", background: `linear-gradient(90deg, rgba(255,255,255,0.12), ${ACCENT}, rgba(255,255,255,0.12))`, backgroundSize: "200% auto", WebkitBackgroundClip: "text", backgroundClip: "text", color: "transparent", WebkitTextFillColor: "transparent", animation: "shimmer 7s linear infinite" }}>olune</h2>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 24, paddingTop: 40, borderTop: "1px solid rgba(255,255,255,0.12)" }}>
            <div style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
              {locales.map((code) => (
                <button
                  key={code}
                  type="button"
                  disabled={langPending}
                  onClick={() => switchLocale(code)}
                  className="dcl-lang"
                  style={{ fontSize: 14, color: code === locale ? ACCENT : "rgba(255,255,255,0.75)", fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: BODY, transition: "color 0.25s ease" }}
                >
                  {localeLabels[code]}
                </button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 32, flexWrap: "wrap" }}>
              {footerLinks.map((l) => (
                <Link key={l.label} href={l.href} className="dcl-footer-link" style={{ color: "rgba(255,255,255,0.55)", fontSize: 14.5, fontWeight: 500, transition: "color 0.25s ease" }}>{l.label}</Link>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
