"use client";

// ============================================================================
//  components/marketing/aurora/primitives.tsx
//  Aurora Glass building blocks, ported from the Olune design system bundle
//  (components/surfaces/*, components/buttons/*, Olune Mark). Styling lives in
//  aurora.css; these only carry the per-instance inline values.
// ============================================================================

import {
  useEffect,
  useId,
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import Link from "next/link";
import "./aurora.css";

// ── GlassPanel ─────────────────────────────────────────────────────────────

type GlassLevel = "panel" | "raised" | "inset" | "base";

/**
 * Layered glass: 148° refraction, blur + saturate, one --edge border, sheen
 * on three inside edges. All four are what make it read as glass.
 */
export function GlassPanel({
  level = "panel",
  radius = 22,
  padding = 18,
  glow = false,
  style,
  className,
  children,
}: {
  level?: GlassLevel;
  radius?: number;
  padding?: number;
  glow?: boolean;
  style?: CSSProperties;
  className?: string;
  children?: ReactNode;
}) {
  const big = level === "raised";
  const inset = level === "inset";
  const blur = `blur(${big ? "var(--blur-lg)" : "var(--blur)"}) saturate(1.9)`;
  return (
    <div
      className={className}
      style={{
        position: "relative",
        borderRadius: radius,
        padding,
        background: inset ? "var(--glass2)" : "linear-gradient(148deg,var(--refract),transparent 42%),var(--glass)",
        backdropFilter: blur,
        WebkitBackdropFilter: blur,
        border: `1px solid ${inset ? "var(--hair)" : "var(--edge)"}`,
        boxShadow: inset
          ? "none"
          : `${big ? "var(--shadow)" : "var(--shadow-s)"},inset 0 1px 0 var(--sheen),inset 0 -1px 0 var(--sheen2),inset 1px 0 0 var(--sheen2)`,
        overflow: "hidden",
        ...style,
      }}
    >
      {glow && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: "-40% -20% auto auto",
            width: 190,
            height: 190,
            borderRadius: "50%",
            pointerEvents: "none",
            background: "radial-gradient(circle,var(--t3),transparent 68%)",
            animation: "olune-halo 9s ease-in-out infinite",
          }}
        />
      )}
      <div style={{ position: "relative", height: "100%" }}>{children}</div>
    </div>
  );
}

// ── AuroraField ────────────────────────────────────────────────────────────

const ORBS: CSSProperties[] = [
  { top: "-18%", left: "2%", width: "58vw", height: "58vw", background: "radial-gradient(circle at 50% 50%,var(--a1),transparent 67%)", filter: "blur(28px)", animation: "olune-drift1 44s ease-in-out infinite" },
  { bottom: "-26%", right: "-8%", width: "52vw", height: "52vw", background: "radial-gradient(circle at 50% 50%,var(--a2),transparent 67%)", filter: "blur(34px)", animation: "olune-drift2 58s ease-in-out infinite" },
  { top: "24%", right: "22%", width: "34vw", height: "34vw", background: "radial-gradient(circle at 50% 50%,var(--a3),transparent 67%)", filter: "blur(40px)", animation: "olune-drift3 66s ease-in-out infinite" },
];

const GRAIN =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='160' height='160' filter='url(%23n)' opacity='.5'/></svg>",
  );

/** Fixed atmosphere: three drifting tint orbs, film grain, vignette. */
export function AuroraField() {
  return (
    <div aria-hidden style={{ position: "fixed", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0, opacity: "var(--amb)" }}>
      {ORBS.map((o, i) => (
        <div key={i} style={{ position: "absolute", borderRadius: "50%", ...o }} />
      ))}
      <div style={{ position: "absolute", inset: 0, backgroundImage: `url("${GRAIN}")`, opacity: 0.035, mixBlendMode: "multiply" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(130% 90% at 50% -14%,transparent 42%,rgba(0,0,0,.055))" }} />
    </div>
  );
}

// ── Buttons ────────────────────────────────────────────────────────────────

/** Internal routes go through next/link; mailto/anchors stay plain <a>. */
function SmartLink({ href, className, style, children, onClick }: { href: string; className?: string; style?: CSSProperties; children: ReactNode; onClick?: (e: MouseEvent<HTMLAnchorElement>) => void }) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className={className} style={style} onClick={onClick}>
        {children}
      </Link>
    );
  }
  return (
    <a href={href} className={className} style={style} onClick={onClick}>
      {children}
    </a>
  );
}

/** Signature hero CTA: gradient ring that spins + glows on hover. */
export function GlowButton({ href, solid = false, children, style }: { href: string; solid?: boolean; children: ReactNode; style?: CSSProperties }) {
  return (
    <SmartLink href={href} className={"ol-btn-glow" + (solid ? " ol-btn-glow--solid" : "")} style={style}>
      {children}
    </SmartLink>
  );
}

const RIPPLE_SIZES = {
  sm: { height: 38, padding: "0 16px", borderRadius: 999, fontSize: 13.5 },
  md: { height: 34, padding: "0 14px", borderRadius: 10, fontSize: 12.5 },
  lg: { height: 46, padding: "0 22px", borderRadius: 14, fontSize: 14.5 },
} as const;

function spawnRipple(e: MouseEvent<HTMLElement>, solid: boolean) {
  const b = e.currentTarget;
  const r = b.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 1.1;
  const ink = document.createElement("span");
  ink.style.cssText =
    `position:absolute;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px;` +
    `width:${d}px;height:${d}px;border-radius:50%;pointer-events:none;opacity:.7;` +
    `background:radial-gradient(circle,${solid ? "var(--base)" : "var(--n)"},transparent 70%);` +
    `animation:olune-ripple .6s cubic-bezier(.16,1,.3,1) forwards`;
  b.appendChild(ink);
  window.setTimeout(() => ink.remove(), 650);
}

/** Everyday glass/solid action with a tint ripple from the click point. */
export function RippleButton({
  href,
  onClick,
  variant = "glass",
  size = "md",
  sweep = false,
  children,
  style,
}: {
  href?: string;
  onClick?: () => void;
  variant?: "glass" | "solid";
  size?: keyof typeof RIPPLE_SIZES;
  sweep?: boolean;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const className = `ol-rb ol-rb--${variant}`;
  const s = { ...RIPPLE_SIZES[size], ...style };
  const inner = (
    <>
      {sweep && <span aria-hidden className="ol-rb__sweep" />}
      <span style={{ position: "relative", whiteSpace: "nowrap" }}>{children}</span>
    </>
  );
  if (href) {
    return (
      <SmartLink href={href} className={className} style={s} onClick={(e) => spawnRipple(e, variant === "solid")}>
        {inner}
      </SmartLink>
    );
  }
  return (
    <button
      type="button"
      className={className}
      style={s}
      onClick={(e) => {
        spawnRipple(e, variant === "solid");
        onClick?.();
      }}
    >
      {inner}
    </button>
  );
}

// ── Olune Mark ─────────────────────────────────────────────────────────────

/**
 * The Olune moon. crescent = the everyday lockup, corona = the eclipse used
 * on dark CTAs, signature = moon standing in for the "o".
 */
export function OluneMark({
  variant = "crescent",
  theme = "light",
  size = 22,
  word = true,
  markSize = "1.3em",
}: {
  variant?: "crescent" | "corona" | "signature";
  theme?: "light" | "dark";
  size?: number;
  word?: boolean;
  markSize?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const dark = theme === "dark";
  const wordStyle: CSSProperties = { fontFamily: "var(--font-display)", fontWeight: 600, letterSpacing: "-.06em" };
  return (
    <span aria-label="Olune" role="img" style={{ display: "inline-flex", alignItems: "center", gap: ".36em", lineHeight: 1, fontSize: size, color: dark ? "#f4f2ee" : "#15141a" }}>
      {variant === "crescent" && (
        <svg viewBox="0 0 100 100" aria-hidden style={{ display: "block", flex: "none", overflow: "visible", width: markSize, height: markSize }}>
          <defs>
            <linearGradient id={`g${uid}`} x1=".15" y1="0" x2=".85" y2="1">
              <stop offset="0" stopColor="#DCD9FA" />
              <stop offset=".55" stopColor="#A6A2E8" />
              <stop offset="1" stopColor="#6B66C9" />
            </linearGradient>
            <mask id={`m${uid}`}>
              <rect x="-20" y="-20" width="140" height="140" fill="#fff" />
              <circle cx="35" cy="38" r="40" fill="#000" />
            </mask>
          </defs>
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
          <circle cx="50" cy="50" r="40" fill={`url(#g${uid})`} mask={`url(#m${uid})`} />
        </svg>
      )}
      {variant === "corona" && (
        <svg viewBox="0 0 100 100" aria-hidden style={{ display: "block", flex: "none", overflow: "visible", width: markSize, height: markSize }}>
          <defs>
            <linearGradient id={`r${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#DCD9FA" stopOpacity=".2" />
              <stop offset=".6" stopColor="#A6A2E8" />
              <stop offset="1" stopColor="#ffffff" />
            </linearGradient>
            <radialGradient id={`h${uid}`} cx=".5" cy=".5" r=".5">
              <stop offset=".62" stopColor="#A6A2E8" stopOpacity=".55" />
              <stop offset="1" stopColor="#A6A2E8" stopOpacity="0" />
            </radialGradient>
            <filter id={`b${uid}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>
          <circle cx="50" cy="50" r="62" fill={`url(#h${uid})`} />
          <circle cx="50" cy="50" r="40" fill={dark ? "#0a0a10" : "#1B1A38"} />
          <circle cx="50" cy="50" r="40" fill="none" stroke={`url(#r${uid})`} strokeWidth="5" filter={`url(#b${uid})`} />
          <circle cx="50" cy="50" r="40" fill="none" stroke={`url(#r${uid})`} strokeWidth="2" />
          <g style={{ transformOrigin: "50px 50px", animation: "ol-mark-spin 14s linear infinite" }}>
            <circle cx="78.3" cy="78.3" r="7" fill="#fff" opacity=".7" filter={`url(#b${uid})`} />
            <circle cx="78.3" cy="78.3" r="2.6" fill="#fff" />
          </g>
        </svg>
      )}
      {variant === "signature" && (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: ".04em" }}>
          <svg viewBox="0 0 100 100" aria-hidden style={{ display: "block", flex: "none", width: ".78em", height: ".78em", overflow: "visible" }}>
            <defs>
              <linearGradient id={`s${uid}`} x1=".15" y1="0" x2=".85" y2="1">
                <stop offset="0" stopColor="#DCD9FA" />
                <stop offset=".55" stopColor="#A6A2E8" />
                <stop offset="1" stopColor="#6B66C9" />
              </linearGradient>
              <mask id={`c${uid}`}>
                <rect x="-20" y="-20" width="140" height="140" fill="#fff" />
                <circle cx="34" cy="37" r="44" fill="#000" />
              </mask>
            </defs>
            <circle cx="50" cy="50" r="44" fill="none" stroke="currentColor" strokeOpacity=".22" strokeWidth="6" />
            <circle cx="50" cy="50" r="44" fill={`url(#s${uid})`} mask={`url(#c${uid})`} />
          </svg>
          <span style={wordStyle}>lune</span>
        </span>
      )}
      {variant !== "signature" && word && <span style={{ ...wordStyle, transform: "translateY(-.04em)" }}>olune</span>}
    </span>
  );
}

// ── Tint ───────────────────────────────────────────────────────────────────

export const SWATCHES: [string, string][] = [
  ["Lumen", "#b9b5ee"], ["Iris", "#6b66c9"], ["Seafoam", "#9fd8c8"], ["Apricot", "#f2b788"], ["Mist", "#e7e5f1"],
  ["Blush", "#eec4d8"], ["Sky", "#bcd8f0"], ["Sand", "#e3d6bf"], ["Sage", "#c8d6bd"], ["Slate", "#b6b8c4"],
];

/**
 * Writes the --n/--t1…--tg ramp from one hex onto `el`, plus --studio: the
 * same hue darkened enough to carry white button text.
 */
export function applyTint(el: HTMLElement, hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const R = (n >> 16) & 255, G = (n >> 8) & 255, B = n & 255;
  const a = (v: number) => `rgba(${R},${G},${B},${v})`;
  const s = el.style;
  s.setProperty("--n", hex);
  s.setProperty("--t1", a(0.13));
  s.setProperty("--t2", a(0.22));
  s.setProperty("--t3", a(0.34));
  s.setProperty("--tb", a(0.46));
  s.setProperty("--tg", a(0.62));
  s.setProperty("--a1", a(0.34));
  const L = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
  const k = L > 0.62 ? 0.52 : L > 0.4 ? 0.3 : 0;
  const mix = (c: number, t: number) => Math.round(c * (1 - k) + t * k);
  s.setProperty("--studio", `rgb(${mix(R, 27)},${mix(G, 26)},${mix(B, 56)})`);
}

/** Ten curated studio tints. */
export function TintPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
      {SWATCHES.map(([name, hex]) => {
        const on = value.toLowerCase() === hex;
        return (
          <button
            key={hex}
            type="button"
            title={name}
            aria-label={`${name} tint`}
            aria-pressed={on}
            onClick={() => onChange(hex)}
            style={{
              all: "unset",
              cursor: "pointer",
              aspectRatio: "1",
              borderRadius: 11,
              background: hex,
              boxShadow: `inset 0 1px 0 rgba(255,255,255,.55),0 0 0 ${on ? 2 : 0}px var(--surface),0 0 0 ${on ? 4 : 0}px ${hex}`,
              transition: "box-shadow .28s cubic-bezier(.32,.72,0,1)",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Shared atoms ───────────────────────────────────────────────────────────

/** Tinted pill eyebrow with a breathing dot — every page hero opens with one. */
export function HeroEyebrow({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 14px 7px 10px", borderRadius: 999, background: "var(--t2)", border: "1px solid var(--tb)", fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", animation: "olune-rise .8s cubic-bezier(.16,1,.3,1) both" }}>
      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--iris)", animation: "olune-breathe 2.6s ease-in-out infinite" }} />
      {children}
    </div>
  );
}

export const microLabel: CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--muted)" };

export const h2Style: CSSProperties = { margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(36px,5vw,72px)", lineHeight: 1.02, letterSpacing: "-.05em", textWrap: "balance" };

/**
 * Scroll reveal: below-the-fold `[data-reveal]` elements start hidden and
 * blur-lift in as they enter, delayed by the attribute's value in ms.
 * Above-the-fold elements are left alone so nothing flashes on load.
 */
export function useReveal(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ease = "cubic-bezier(.16,1,.3,1)";
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.style.transitionDelay = `${Number(el.dataset.reveal) || 0}ms`;
          el.classList.remove("ol-reveal-pending");
          io.unobserve(el);
          // Hand transform back to hover states once the entrance is done.
          window.setTimeout(() => {
            el.style.transition = "";
            el.style.transitionDelay = "";
          }, 1400);
        }
      },
      { threshold: 0.15 },
    );
    root.querySelectorAll<HTMLElement>("[data-reveal]").forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.9) return;
      el.style.transition = `opacity 1s ${ease}, transform 1s ${ease}, filter 1s ${ease}`;
      el.classList.add("ol-reveal-pending");
      io.observe(el);
    });
    return () => io.disconnect();
  }, [rootRef]);
}
