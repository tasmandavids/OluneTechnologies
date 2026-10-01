"use client";

// ============================================================================
//  components/marketing/aurora/LandingPage.tsx
//  Olune platform landing — port of "Olune Landing.dc.html" (Claude Design,
//  Aurora Glass). Scroll-linked motion runs off one rAF loop that writes CSS
//  custom properties onto the page root; the markup reads them with calc():
//    --hp  hero progress (0→1 over the first 75vh)  → stage tilt, sphere light
//    --c   chaos→calm progress through the sticky section
//    --d   day progress, --dk night amount, --tx the day track's offset
//    --tp  product-tour autoplay progress
//    --mx/--my, --px/--py  pointer parallax + cursor light
// ============================================================================

import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useLocale } from "next-intl";
import { useNumberFormat } from "@/lib/i18n/format";
import { PLANS, PLAN_ORDER } from "@/lib/plans/catalog";
import { PoweredByOlune } from "@/components/brand/PoweredByOlune";
import { AuroraPage } from "./chrome";
import { TRIAL_HREF, auroraCopy } from "./copy";
import { GlassPanel, GlowButton, OluneMark, RippleButton, TintPicker, applyTint, h2Style, microLabel, useReveal } from "./primitives";

const TABS = ["Classes", "Families", "Invoicing", "Cash flow", "Website"] as const;
const TAB_MS = 7000;
const EASE = "cubic-bezier(.16,1,.3,1)";

const serifH2: CSSProperties = { ...h2Style, fontWeight: 600, lineHeight: 1, letterSpacing: "-.045em" };
const card: CSSProperties = { background: "var(--surface)", border: "1px solid var(--hair)" };
const chip = (strong = false): CSSProperties => ({ fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, background: strong ? "var(--t3)" : "var(--t2)", border: "1px solid var(--tb)", whiteSpace: "nowrap" });
const quietChip: CSSProperties = { fontSize: 11.5, fontWeight: 600, padding: "4px 10px", borderRadius: 999, border: "1px solid var(--hair)", whiteSpace: "nowrap" };
const statLabel: CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" };
const liveDot = <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--iris)", animation: "olune-breathe 2.4s ease-in-out infinite" }} />;

// ── icons (1.5 stroke, round caps — the system's hand-rolled set) ─────────
const ico = (d: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const I = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.6 2.6 3 5.2" /></>,
  person: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5" /></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></>,
  wallet: <><rect x="3" y="5.5" width="18" height="14" rx="3" /><path d="M21 10h-4.5a2 2 0 0 0 0 4H21" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.8 5.6 3.8 9s-1.2 6.4-3.8 9c-2.6-2.6-3.8-5.6-3.8-9S9.4 5.6 12 3z" /></>,
  doc: <><path d="M6 3h9l4 4v14H6z" /><path d="M9.5 12h6M9.5 16h6" /></>,
  bag: <><path d="M5 8h14l-1.2 11.5a1.5 1.5 0 0 1-1.5 1.5H7.7a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M9 8a3 3 0 0 1 6 0" /></>,
  list: <path d="M4 7h16M4 12h10M4 17h6" />,
  ticket: <path d="M4 10a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V6H4z" />,
};

// ── chaos → calm pairs: messy artefact (scattered) → glass module (gridded)
type Chaos = { sx: string; sy: string; sr: string; gx: number; gy: number; mess: ReactNode; messStyle: CSSProperties; icon: ReactNode; title: string; sub: string };
const CHAOS: Chaos[] = [
  { sx: "-33vw", sy: "-12vh", sr: "-9deg", gx: -1, gy: -1.5, messStyle: { background: "var(--surface)", borderRadius: "20px 20px 20px 6px" }, mess: <><div style={{ fontSize: 10.5, color: "var(--muted)" }}>Parents group · 47 unread</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>Is class still on tonight??</div></>, icon: I.calendar, title: "Timetable", sub: "Live for every family" },
  { sx: "31vw", sy: "-16vh", sr: "7deg", gx: 1, gy: -1.5, messStyle: { background: "var(--surface)", border: "1px solid var(--ring)", borderRadius: 6, fontFamily: "var(--font-mono)", backgroundImage: "linear-gradient(var(--hair) 1px,transparent 1px),linear-gradient(90deg,var(--hair) 1px,transparent 1px)", backgroundSize: "100% 22px,60px 100%", padding: "10px 14px" }, mess: <><div style={{ fontSize: 10.5, color: "var(--muted)" }}>A1:F212</div><div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Term3_invoices_FINAL_v7.xlsx</div></>, icon: I.doc, title: "Invoicing", sub: "48 sent, every one tracked" },
  { sx: "-22vw", sy: "18vh", sr: "5deg", gx: -1, gy: -0.5, messStyle: { background: "var(--surface)", borderRadius: "20px 20px 6px 20px" }, mess: <><div style={{ fontSize: 10.5, color: "var(--muted)" }}>Teachers · 9:41 pm</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>Who&apos;s covering Jazz Thurs?</div></>, icon: I.person, title: "Cover", sub: "Mia Torres confirmed" },
  { sx: "35vw", sy: "10vh", sr: "-6deg", gx: 1, gy: -0.5, messStyle: { background: "color-mix(in srgb,var(--apricot) 55%,var(--surface))", borderRadius: 4 }, mess: <><div style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)" }}>Unpaid: 11 families</div><div style={{ fontSize: 12, marginTop: 2 }}>(I think?) — check bank</div></>, icon: I.wallet, title: "Payments", sub: "3 overdue, already reminded" },
  { sx: "-36vw", sy: "4vh", sr: "4deg", gx: -1, gy: 0.5, messStyle: { background: "var(--mist)", borderRadius: 6 }, mess: <><div style={{ fontSize: 10.5, color: "var(--muted)" }}>Envelope, front desk</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>Costume deposits — cash</div></>, icon: I.bag, title: "Shop", sub: "Deposits taken online" },
  { sx: "24vw", sy: "24vh", sr: "-3deg", gx: 1, gy: 0.5, messStyle: { background: "color-mix(in srgb,var(--apricot) 40%,var(--surface))", borderRadius: 4 }, mess: <><div style={{ fontSize: 15, fontWeight: 600, fontFamily: "var(--font-display)" }}>Waitlist (on the fridge)</div><div style={{ fontSize: 12, marginTop: 2 }}>call the Lees back??</div></>, icon: I.list, title: "Waitlist", sub: "Next family offered the spot" },
  { sx: "-12vw", sy: "30vh", sr: "-7deg", gx: -1, gy: 1.5, messStyle: { background: "var(--surface)", border: "1px solid var(--ring)", borderRadius: 10 }, mess: <><div style={{ fontSize: 10.5, color: "var(--error)" }}>Last updated 2022</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>Website timetable (wrong)</div></>, icon: I.globe, title: "Website", sub: "Always matches your timetable" },
  { sx: "4vw", sy: "-2vh", sr: "8deg", gx: 1, gy: 1.5, messStyle: { background: "var(--surface)", borderRadius: "20px 20px 20px 6px" }, mess: <><div style={{ fontSize: 10.5, color: "var(--muted)" }}>Missed call · 3</div><div style={{ fontSize: 14, fontWeight: 600, marginTop: 3 }}>Recital seating??</div></>, icon: I.ticket, title: "Events", sub: "Recital tickets on sale" },
];

const DAY = [
  { time: "7:40 am", badge: <span style={chip()}>Enrolled</span>, title: "The waitlist moved itself.", body: "A spot opened in Ballet — Grade 2. The next family said yes before breakfast." },
  { time: "9:00 am", badge: <span style={{ ...quietChip, color: "var(--success)" }}>14 of 14</span>, title: "Ballet — Grade 2", body: "Checked in from the teacher's phone. Attendance done before the first plié." },
  { time: "12:30 pm", badge: <span style={chip()}>31 paid</span>, title: "Term 4 invoices, sent.", body: "48 in one go. Reminders already queued for the rest." },
  { time: "3:45 pm", badge: <span style={{ ...chip(true), display: "inline-flex", alignItems: "center", gap: 6 }}>{liveDot}In session</span>, title: "Jazz — Juniors", body: "Mia's covering. Families were told automatically — nobody asked the group chat." },
  { time: "5:10 pm", badge: <span style={chip()}>On sale</span>, title: "Recital tickets are live.", body: "On your own site, with seating, in your colours." },
  { time: "7:30 pm", badge: <span style={{ ...quietChip, color: "var(--success)" }}>Reconciled</span>, title: "The books balance.", body: "Payouts matched. NZ$12,480 this month, every dollar accounted for." },
];

const PLAN_COPY = {
  solo: { for: "For the one-person studio", name: "Solo", desc: "Everything you need to teach, take the roll and get fees paid. For the studio that is one person." },
  studio: { for: "For growing teams", name: "Studio", desc: "Everything in Solo, plus staff, substitutes, enrolment forms and your studio website." },
  scale: { for: "For busy studios", name: "Scale", desc: "Every module Olune has, including private lessons, badges and progress, production and costumes." },
} as const;

// Fibonacci sphere — the hero's dotted moon.
function spherePoints(n: number): [number, number, number, boolean][] {
  const ga = Math.PI * (3 - Math.sqrt(5));
  return Array.from({ length: n }, (_, i) => {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = ga * i;
    return [Math.cos(th) * r, y, Math.sin(th) * r, i % 29 === 0];
  });
}

export default function LandingPage() {
  const locale = useLocale();
  const numberFormat = useNumberFormat();
  const T = auroraCopy(locale).hero;

  const rootRef = useRef<HTMLDivElement | null>(null);
  const sphereRef = useRef<HTMLCanvasElement | null>(null);
  const chaosRef = useRef<HTMLElement | null>(null);
  const tourRef = useRef<HTMLElement | null>(null);
  const dayRef = useRef<HTMLElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const clockRef = useRef<HTMLDivElement | null>(null);
  const tabStart = useRef(0);
  const tabProgress = useRef(0);

  const [tab, setTab] = useState(0);
  const [tint, setTint] = useState("#b9b5ee");
  const [navDark, setNavDark] = useState(false);
  const [annual, setAnnual] = useState(false);

  useReveal(rootRef);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const cache: Record<string, string> = {};
    const set = (k: string, v: string) => {
      if (cache[k] === v) return;
      cache[k] = v;
      root.style.setProperty(k, v);
    };
    const cl = (x: number) => Math.min(1, Math.max(0, x));
    const prog = (el: HTMLElement | null) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      const t = r.height - window.innerHeight;
      return t <= 0 ? 0 : cl(-r.top / t);
    };

    let px = window.innerWidth / 2, py = window.innerHeight / 3, tx = px, ty = py;
    let cS = 0, dS = 0, dark = false;
    tabStart.current = performance.now();
    const pts = spherePoints(2300);

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const drawSphere = (hp: number) => {
      const cv = sphereRef.current;
      if (!cv || window.scrollY > window.innerHeight * 1.8) return;
      const w = cv.clientWidth;
      if (!w) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const S = Math.round(w * dpr);
      if (cv.width !== S) {
        cv.width = S;
        cv.height = S;
      }
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, S, S);
      const R = S * 0.37, c = S / 2, t = reduced ? 0 : performance.now();
      const mx = px / window.innerWidth - 0.5, my = py / window.innerHeight - 0.5;
      const ay = t * 0.00011 + mx * 0.5, ax = -0.32 + my * 0.25;
      const cyR = Math.cos(ay), syR = Math.sin(ay), cxR = Math.cos(ax), sxR = Math.sin(ax);
      // The light swings round the sphere as you scroll: crescent → full moon.
      const th = (1 - hp) * 2.05 + 0.12;
      const lx = Math.sin(th) * 0.78, ly = Math.sin(th) * 0.62, lz = Math.cos(th);
      const base = Math.max(0.7, S / 900) * 1.15;
      const ss = (a: number, b: number, x: number) => {
        const k = cl((x - a) / (b - a));
        return k * k * (3 - 2 * k);
      };
      for (const p of pts) {
        const x1 = p[0] * cyR + p[2] * syR, z1 = -p[0] * syR + p[2] * cyR;
        const y2 = p[1] * cxR - z1 * sxR, z2 = p[1] * sxR + z1 * cxR;
        if (z2 < -0.05) continue;
        const s = ss(-0.1, 0.4, x1 * lx + y2 * ly + z2 * lz);
        const depth = 0.3 + 0.7 * Math.max(0, z2);
        ctx.globalAlpha = (0.1 + 0.9 * s) * depth;
        ctx.fillStyle = p[3] && s > 0.5 ? "#E59A62" : s > 0.55 ? "#6B66C9" : "#7A75D6";
        ctx.beginPath();
        ctx.arc(c + x1 * R, c + y2 * R, base * (0.55 + 1.35 * s) * (0.6 + 0.4 * depth), 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    let raf = 0;
    const frame = () => {
      const y = window.scrollY, H = window.innerHeight;
      const hp = cl(y / (H * 0.75));
      set("--hp", hp.toFixed(3));
      cS += (prog(chaosRef.current) - cS) * 0.14;
      set("--c", cS.toFixed(3));
      dS += (prog(dayRef.current) - dS) * 0.14;
      const d = dS, dk = cl((d - 0.5) / 0.38);
      set("--d", d.toFixed(4));
      set("--dk", dk.toFixed(3));
      const tr = trackRef.current;
      if (tr) set("--tx", (-d * Math.max(0, tr.scrollWidth - window.innerWidth)).toFixed(1) + "px");
      const ck = clockRef.current;
      if (ck) {
        const m = Math.round((7 * 60 + d * 14 * 60) / 5) * 5;
        const s = String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
        if (ck.textContent !== s) ck.textContent = s;
      }
      px += (tx - px) * 0.08;
      py += (ty - py) * 0.08;
      set("--px", px.toFixed(0) + "px");
      set("--py", py.toFixed(0) + "px");
      set("--mx", ((px / window.innerWidth - 0.5) * 2).toFixed(3));
      set("--my", ((py / H - 0.5) * 2).toFixed(3));
      drawSphere(hp);

      // Nav goes dark over the night half of the day scroll.
      const day = dayRef.current;
      let nd = false;
      if (day) {
        const r = day.getBoundingClientRect();
        nd = r.top < 40 && r.bottom > 40 && dk > 0.5;
      }
      if (nd !== dark) {
        dark = nd;
        setNavDark(nd);
      }

      // Product tour autoplay — paused (progress held) while off screen.
      const tour = tourRef.current;
      const now = performance.now();
      if (tour && !reduced) {
        const r = tour.getBoundingClientRect();
        const inView = r.top < H * 0.7 && r.bottom > H * 0.3;
        if (!inView) tabStart.current = now - tabProgress.current * TAB_MS;
        const tp = cl((now - tabStart.current) / TAB_MS);
        tabProgress.current = tp;
        set("--tp", tp.toFixed(3));
        if (tp >= 1) {
          tabStart.current = now;
          tabProgress.current = 0;
          setTab((i) => (i + 1) % TABS.length);
        }
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // Count-up on the hero stat cards once the stage has landed.
    const counters: number[] = [];
    const countTimer = window.setTimeout(() => {
      root.querySelectorAll<HTMLElement>("[data-count]").forEach((el) => {
        const to = Number(el.dataset.count), pre = el.dataset.prefix ?? "";
        const t0 = performance.now(), dur = 1600;
        const step = (t: number) => {
          const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
          el.textContent = pre + numberFormat.format(Math.round(to * e));
          if (p < 1) counters.push(requestAnimationFrame(step));
        };
        if (!reduced) counters.push(requestAnimationFrame(step));
      });
    }, 1300);

    return () => {
      cancelAnimationFrame(raf);
      counters.forEach(cancelAnimationFrame);
      window.clearTimeout(countTimer);
      window.removeEventListener("pointermove", onMove);
    };
  }, [numberFormat]);

  useEffect(() => {
    if (rootRef.current) applyTint(rootRef.current, tint);
  }, [tint]);

  const pickTab = (i: number) => {
    tabStart.current = performance.now();
    tabProgress.current = 0;
    setTab(i);
  };

  const words = (arr: string[], d0: number) => arr.map((text, i) => ({ text, delay: `${(d0 + i * 0.08).toFixed(2)}s` }));
  const h1a = words(T.h1a, 0.08);
  const h1b = words(T.h1b, 0.1 + T.h1a.length * 0.08 + 0.1);

  const rootVars = { "--hp": 0, "--c": 0, "--d": 0, "--dk": 0, "--mx": 0, "--my": 0, "--px": "-999px", "--py": "-999px", "--tp": 0, "--tx": "0px" } as CSSProperties;

  return (
    <div style={rootVars}>
      <AuroraPage active="home" navDark={navDark} rootRef={rootRef} footer={{ title: T.ctaA, accent: T.ctaB, body: T.ctaP }}>
        {/* cursor light */}
        <div aria-hidden style={{ position: "fixed", left: 0, top: 0, width: 640, height: 640, borderRadius: "50%", pointerEvents: "none", zIndex: 0, background: "radial-gradient(circle,var(--tg),transparent 62%)", opacity: 0.32, transform: "translate(calc(var(--px) - 320px),calc(var(--py) - 320px))", willChange: "transform" }} />

        {/* ── 01 HERO ─────────────────────────────────────────────────── */}
        <section id="top" style={{ position: "relative", zIndex: 1, padding: "clamp(120px,16vh,170px) 24px 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 14px 7px 10px", borderRadius: 999, background: "var(--t2)", border: "1px solid var(--tb)", fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink)", animation: `olune-rise .8s ${EASE} both` }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--iris)", animation: "olune-breathe 2.6s ease-in-out infinite" }} />
            {T.eyebrow}
          </div>
          <h1 style={{ margin: "30px 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(44px,7vw,112px)", lineHeight: 1.02, letterSpacing: "-.05em", display: "flex", flexDirection: "column", alignItems: "center", gap: ".04em", maxWidth: "100%" }}>
            <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: ".24em", paddingBottom: ".04em" }}>
              {h1a.map((w, i) => (
                <span key={i} style={{ display: "inline-block", animation: `olune-lift 1s ${EASE} backwards`, animationDelay: w.delay }}>{w.text}</span>
              ))}
            </span>
            <span style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: ".24em", paddingBottom: ".08em" }}>
              {h1b.map((w, i) => (
                <span key={i} style={{ display: "inline-block", color: "var(--iris)", animation: `olune-lift 1s ${EASE} backwards`, animationDelay: w.delay }}>{w.text}</span>
              ))}
            </span>
          </h1>
          <p style={{ margin: "32px 0 0", maxWidth: 540, fontSize: "clamp(17px,1.4vw,19px)", lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty", animation: `olune-rise .9s .8s ${EASE} both` }}>{T.sub}</p>
          <div style={{ marginTop: 36, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12, animation: `olune-rise .9s .92s ${EASE} both` }}>
            <GlowButton href={TRIAL_HREF} solid><span style={{ whiteSpace: "nowrap" }}>{T.trial} →</span></GlowButton>
            <GlowButton href="#tour"><span style={{ whiteSpace: "nowrap" }}>{T.see}</span></GlowButton>
          </div>

          {/* stage */}
          <div style={{ position: "relative", width: "100%", maxWidth: 1160, marginTop: "clamp(56px,9vh,96px)", perspective: 1800 }}>
            <div aria-hidden style={{ position: "absolute", left: "50%", top: "-10%", width: "min(92vw,900px)", aspectRatio: "1", transform: "translate(-50%,calc(var(--hp) * -140px)) scale(calc(1 + var(--hp) * .18))", pointerEvents: "none" }}>
              <div style={{ position: "absolute", inset: "-14%", borderRadius: "50%", background: "radial-gradient(circle,var(--tg),transparent 58%)", opacity: "calc(.35 + var(--hp) * .5)", animation: "olune-halo 9s ease-in-out infinite" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(from 210deg,transparent 0deg,var(--a1) 40deg,#fff 70deg,var(--a2) 110deg,transparent 160deg,transparent 230deg,var(--a3) 280deg,var(--a1) 320deg,transparent 360deg)", WebkitMask: "radial-gradient(circle closest-side,transparent 76%,#000 79%,#000 81%,transparent 86%)", mask: "radial-gradient(circle closest-side,transparent 76%,#000 79%,#000 81%,transparent 86%)", filter: "blur(7px)", animation: "ol-spin 48s linear infinite" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "conic-gradient(from 30deg,transparent 0deg,var(--iris) 60deg,transparent 140deg,transparent 360deg)", WebkitMask: "radial-gradient(circle closest-side,transparent 79.4%,#000 80%,transparent 80.6%)", mask: "radial-gradient(circle closest-side,transparent 79.4%,#000 80%,transparent 80.6%)", opacity: 0.6, animation: "ol-spin 22s linear infinite reverse" }} />
              <canvas ref={sphereRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", transform: "translate(calc(var(--mx) * -14px),calc(var(--my) * -10px))" }} />
            </div>

            <div style={{ position: "relative", transformOrigin: "50% 0", transform: "rotateX(calc((1 - var(--hp)) * 26deg)) translateY(calc((1 - var(--hp)) * 30px)) scale(calc(.9 + var(--hp) * .1))", animation: `olune-lift 1.2s 1s ${EASE} backwards` }}>
              <GlassPanel level="raised" radius={30} padding={14}>
                <div style={{ display: "flex", gap: 14, textAlign: "left" }} aria-label="Olune dashboard preview" role="img">
                  <div style={{ flex: "none", width: 58, borderRadius: 20, background: "var(--glass2)", border: "1px solid var(--hair)", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "16px 0" }}>
                    <OluneMark variant="crescent" word={false} markSize="26px" />
                    <div style={{ width: 26, height: 1, background: "var(--hair)" }} />
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: "var(--t3)", border: "1px solid var(--tb)", display: "grid", placeItems: "center", color: "var(--iris)" }}>{ico(I.today)}</div>
                    {[I.people, I.calendar, I.wallet, I.globe].map((d, i) => (
                      <div key={i} style={{ width: 38, height: 38, display: "grid", placeItems: "center", color: "var(--muted)" }}>{ico(d)}</div>
                    ))}
                  </div>
                  <div style={{ flex: 1, minWidth: 0, padding: "6px 8px 8px 0" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ flex: 1, maxWidth: 360, display: "flex", alignItems: "center", gap: 10, height: 38, padding: "0 12px", borderRadius: 12, background: "var(--glass2)", border: "1px solid var(--hair)", fontSize: 13, color: "var(--muted)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></svg>
                        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden" }}>Find anything…</span>
                        <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 6px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--hair)" }}>⌘K</span>
                      </div>
                      <div style={{ flex: 1 }} />
                      <div style={{ height: 38, padding: "0 16px", borderRadius: 12, background: "var(--ink)", color: "var(--base)", display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>+ New</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, margin: "24px 0 18px", flexWrap: "wrap" }}>
                      <div>
                        <div style={{ fontSize: 13, color: "var(--muted)" }}>Good evening,</div>
                        <div style={{ fontFamily: "var(--font-display)", fontSize: "clamp(24px,3vw,34px)", letterSpacing: "-.02em", marginTop: 2 }}>Aurora Dance Co.</div>
                      </div>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>Tuesday, 6 October</div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}>
                      {[
                        { label: "Active students", count: 182, prefix: "", trend: "↑ 6%", foot: "12 new this month", line: "2,28 20,24 36,26 54,16 72,13 88,15 106,4", delay: "1.4s" },
                        { label: "Revenue this month", count: 12480, prefix: "NZ$", trend: "↑ 4%", foot: "invoices + shop", line: "2,26 22,22 38,25 56,18 74,12 90,10 106,5", delay: "1.6s" },
                        { label: "Classes today", count: 6, prefix: "", trend: "", foot: "across 2 studios", line: "", delay: "" },
                      ].map((s) => (
                        <div key={s.label} style={{ ...card, borderRadius: 18, padding: "16px 18px", position: "relative", overflow: "hidden" }}>
                          <div style={statLabel}>{s.label}</div>
                          {s.line && (
                            <svg width="110" height="34" viewBox="0 0 110 34" style={{ position: "absolute", right: 14, top: 12 }} fill="none" aria-hidden>
                              <polyline points={s.line} stroke="var(--brand-hot)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1400" style={{ animation: `olune-draw 3s ${s.delay} ease-out both` }} />
                            </svg>
                          )}
                          <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: 8, marginTop: 20 }}>
                            <span data-count={s.count} data-prefix={s.prefix} style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>
                              {s.prefix}{numberFormat.format(s.count)}
                            </span>
                            {s.trend && <span style={{ ...quietChip, fontSize: 11, padding: "2px 8px" }}>{s.trend}</span>}
                          </div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.foot}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ ...card, marginTop: 12, borderRadius: 18, overflow: "hidden" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--hair)" }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Today&apos;s schedule</span>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 10, border: "1px solid var(--hair)" }}>Full timetable</span>
                      </div>
                      {[
                        { t: "9:00 am", c: "Ballet — Grade 2", who: "Mia Torres", s: <span style={{ ...quietChip, fontWeight: 500, color: "var(--muted)" }}>Done</span> },
                        { t: "3:45 pm", c: "Jazz — Juniors", who: "Mia Torres", live: true, s: <span style={{ ...chip(true), display: "inline-flex", alignItems: "center", gap: 6 }}>{liveDot}In session</span> },
                        { t: "4:30 pm", c: "Hip-hop — Teens", who: "Jordan Blake", s: <span style={chip()}>Upcoming</span> },
                        { t: "5:15 pm", c: "Pointe — Advanced", who: "Ava Reid", s: <span style={chip()}>Upcoming</span> },
                      ].map((r, i, arr) => (
                        <div key={r.t} style={{ display: "grid", gridTemplateColumns: "76px minmax(0,1fr) minmax(0,.7fr) 110px", alignItems: "center", gap: 12, padding: "12px 18px", borderBottom: i < arr.length - 1 ? "1px solid var(--hair)" : undefined, fontSize: 13, background: r.live ? "var(--t1)" : undefined }}>
                          <span style={{ color: "var(--muted)" }}>{r.t}</span>
                          <b style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.c}</b>
                          <span style={{ color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden" }}>{r.who}</span>
                          <span style={{ justifySelf: "start" }}>{r.s}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </GlassPanel>

              {/* satellites — wide screens only */}
              <div className="ol-wide-only" aria-hidden>
                <div style={{ position: "absolute", left: "-9%", top: "-4%", width: 250, transform: "translate(calc(var(--mx) * 22px),calc(var(--my) * 16px + var(--hp) * -70px))", textAlign: "left", animation: `olune-rise 1s 1.6s ${EASE} both` }}>
                  <GlassPanel radius={18} padding={14}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--t2)", display: "grid", placeItems: "center", color: "var(--success)", flex: "none" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                      </div>
                      <div><div style={{ fontSize: 13, fontWeight: 600 }}>Invoice #1042 paid</div><div style={{ fontSize: 12, color: "var(--muted)" }}>The Reid family · NZ$240</div></div>
                    </div>
                  </GlassPanel>
                </div>
                <div style={{ position: "absolute", right: "-9%", top: "6%", width: 260, transform: "translate(calc(var(--mx) * -26px),calc(var(--my) * -18px + var(--hp) * -110px))", textAlign: "left", animation: `olune-rise 1s 1.8s ${EASE} both` }}>
                  <GlassPanel radius={18} padding={14}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--t3)", border: "1px solid var(--tb)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, flex: "none" }}>AR</div>
                      <div><div style={{ fontSize: 13, fontWeight: 600 }}>New enrolment</div><div style={{ fontSize: 12, color: "var(--muted)" }}>Ava, 7 · Ballet — Grade 1</div></div>
                    </div>
                  </GlassPanel>
                </div>
                <div style={{ position: "absolute", right: "-7%", bottom: "-6%", width: 240, transform: "translate(calc(var(--mx) * 14px),calc(var(--my) * 10px + var(--hp) * -40px))", textAlign: "left", animation: `olune-rise 1s 2s ${EASE} both` }}>
                  <GlassPanel radius={18} padding={14}>
                    <div style={statLabel}>Cover sorted</div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Mia Torres → Jazz — Juniors</div>
                  </GlassPanel>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── MARQUEE ─────────────────────────────────────────────────── */}
        <div aria-hidden style={{ position: "relative", zIndex: 1, marginTop: "clamp(70px,10vh,120px)", overflow: "hidden", maskImage: "linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)", WebkitMaskImage: "linear-gradient(90deg,transparent,#000 12%,#000 88%,transparent)" }}>
          <div style={{ display: "flex", width: "max-content", animation: "ol-marquee 60s linear infinite", fontFamily: "var(--font-display)", fontSize: "clamp(30px,4vw,54px)", letterSpacing: "-.02em", color: "var(--muted)", whiteSpace: "nowrap" }}>
            {[0, 1].map((k) => (
              <span key={k} style={{ paddingRight: ".6em" }}>Ballet · Contemporary · Jazz · Hip-hop · Pointe · Acro · Tap · Musical theatre · Lyrical · Piano · Voice · Pottery ·</span>
            ))}
          </div>
        </div>

        {/* ── 02 CHAOS → CALM ─────────────────────────────────────────── */}
        <section ref={chaosRef} aria-label="From chaos to calm" style={{ position: "relative", zIndex: 1, height: "280vh" }}>
          <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", left: "50%", top: "58%", width: "min(110vw,1100px)", aspectRatio: "1", transform: "translate(-50%,-50%) scale(calc(.6 + var(--c) * .5))", borderRadius: "50%", background: "radial-gradient(circle,var(--t3),transparent 62%)", opacity: "var(--c)" }} />
            <div style={{ position: "absolute", left: 0, right: 0, top: "clamp(84px,13vh,140px)", display: "grid", justifyItems: "center", padding: "0 24px", textAlign: "center" }}>
              <div style={{ ...microLabel, gridArea: "1/1", opacity: "clamp(0, 1 - var(--c) * 2.4, 1)" }}>Your studio, right now</div>
              <div style={{ ...microLabel, gridArea: "1/1", color: "var(--iris)", opacity: "clamp(0, (var(--c) - .55) * 3, 1)" }}>Your studio, on Olune</div>
              <h2 style={{ ...serifH2, gridArea: "2/1", margin: "14px 0 0", fontSize: "clamp(34px,5vw,72px)", maxWidth: "17ch", opacity: "clamp(0, 1 - var(--c) * 2.4, 1)", filter: "blur(calc(var(--c) * 14px))" }}>
                Twelve tabs. Three group chats. One spreadsheet nobody trusts.
              </h2>
              <p aria-hidden style={{ ...serifH2, gridArea: "2/1", margin: "14px 0 0", fontSize: "clamp(34px,5vw,72px)", maxWidth: "17ch", alignSelf: "center", opacity: "clamp(0, (var(--c) - .55) * 3, 1)", filter: "blur(calc((1 - clamp(0, (var(--c) - .55) * 3, 1)) * 14px))" }}>
                One calm home.
              </p>
            </div>
            <div style={{ position: "absolute", inset: "22vh 0 0 0" }}>
              {CHAOS.map((c, i) => {
                const vars = { "--ci": `clamp(0, (var(--c) - ${(0.12 + i * 0.04).toFixed(2)}) * 2.6, 1)` } as CSSProperties;
                return (
                  <div
                    key={c.title}
                    style={{
                      ...vars,
                      position: "absolute",
                      left: "50%",
                      top: "50%",
                      width: "min(300px,45vw)",
                      height: 68,
                      margin: "-34px 0 0 calc(min(300px,45vw) / -2)",
                      transform: `translate(calc((1 - var(--ci)) * ${c.sx} + var(--ci) * ${c.gx} * min(160px,23.5vw)),calc((1 - var(--ci)) * ${c.sy} + var(--ci) * ${c.gy} * 84px)) rotate(calc((1 - var(--ci)) * ${c.sr}))`,
                    }}
                  >
                    <div style={{ position: "absolute", inset: 0, opacity: "calc(1 - var(--ci))", padding: "12px 16px", boxShadow: "var(--shadow-s)", boxSizing: "border-box", ...c.messStyle }}>{c.mess}</div>
                    <div style={{ position: "absolute", inset: 0, opacity: "var(--ci)", display: "flex", alignItems: "center", gap: 12, padding: "0 14px", borderRadius: 18, background: "linear-gradient(148deg,var(--refract),transparent 42%),var(--glass)", border: "1px solid var(--edge)", boxShadow: "inset 0 1px 0 var(--sheen)", backdropFilter: "blur(var(--blur)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur)) saturate(1.9)", boxSizing: "border-box" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 11, background: "var(--t2)", flex: "none", display: "grid", placeItems: "center", color: "var(--iris)" }}>{ico(c.icon, 16)}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{c.title}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.sub}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── 03 PRODUCT TOUR ─────────────────────────────────────────── */}
        <section id="tour" ref={tourRef} style={{ position: "relative", zIndex: 1, padding: "clamp(80px,12vh,140px) 24px", display: "flex", flexDirection: "column", alignItems: "center", scrollMarginTop: 60 }}>
          <div data-reveal="0" style={microLabel}>The product</div>
          <h2 data-reveal="80" style={{ ...serifH2, margin: "14px 0 0", textAlign: "center", maxWidth: "16ch" }}>Everything your studio runs on.</h2>

          <div data-reveal="160" role="tablist" aria-label="Product areas" style={{ marginTop: 40, display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, padding: 6, borderRadius: 999, background: "var(--glass)", border: "1px solid var(--edge)", boxShadow: "inset 0 1px 0 var(--sheen),var(--shadow-s)", backdropFilter: "blur(var(--blur)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur)) saturate(1.9)" }}>
            {TABS.map((label, i) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={i === tab}
                onClick={() => pickTab(i)}
                style={{ all: "unset", cursor: "pointer", position: "relative", overflow: "hidden", padding: "10px 18px", borderRadius: 999, fontSize: 14, fontWeight: 600, color: i === tab ? "var(--ink)" : "var(--muted)", background: i === tab ? "var(--surface)" : "transparent", transition: "background .3s cubic-bezier(.32,.72,0,1),color .3s" }}
              >
                {label}
                <span aria-hidden style={{ position: "absolute", left: 18, right: 18, bottom: 5, height: 2, borderRadius: 2, background: "var(--hair)", opacity: i === tab ? 1 : 0 }}>
                  <span style={{ display: "block", height: "100%", borderRadius: 2, background: "var(--iris)", width: i === tab ? "calc(var(--tp) * 100%)" : "0%" }} />
                </span>
              </button>
            ))}
          </div>

          <div role="tabpanel" aria-label={TABS[tab]} style={{ width: "100%", maxWidth: 1180, marginTop: 48, minHeight: 520 }}>
            <TourPanel tab={tab} />
          </div>
        </section>

        {/* ── 04 YOUR COLOUR ──────────────────────────────────────────── */}
        <section id="colour" style={{ position: "relative", zIndex: 1, padding: "clamp(60px,10vh,120px) 24px", display: "flex", justifyContent: "center" }}>
          <div style={{ width: "100%", maxWidth: 1180, display: "flex", flexWrap: "wrap", gap: "clamp(32px,6vw,80px)", alignItems: "center" }}>
            <div style={{ flex: "1 1 320px", maxWidth: 440 }}>
              <div data-reveal="0" style={microLabel}>Make it yours</div>
              <h2 data-reveal="80" style={{ ...serifH2, margin: "14px 0 0", fontSize: "clamp(36px,5vw,68px)" }}>One colour. Your whole studio.</h2>
              <p data-reveal="140" style={{ margin: "18px 0 0", fontSize: 17, lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty" }}>
                Pick a colour and Olune derives the rest — your portal, your website, every invoice. Try it: this page follows along.
              </p>
              <div data-reveal="200" style={{ marginTop: 28, maxWidth: 320 }}>
                <GlassPanel radius={22} padding={16}>
                  <TintPicker value={tint} onChange={setTint} />
                </GlassPanel>
              </div>
            </div>
            <div data-reveal="120" style={{ flex: "1.4 1 460px", minWidth: 0, position: "relative" }}>
              <div aria-hidden style={{ position: "absolute", inset: "-10%", borderRadius: "50%", background: "radial-gradient(circle,var(--tg),transparent 64%)", opacity: 0.7 }} />
              <GlassPanel level="raised" radius={28} padding={10} glow>
                <div style={{ ...card, borderRadius: 20, overflow: "hidden" }}>
                  <div style={{ padding: "clamp(28px,4vw,48px)", background: "radial-gradient(130% 130% at 100% 0%,var(--t3),transparent 58%),radial-gradient(90% 90% at 0% 100%,var(--t1),transparent 60%),var(--surface)", transition: "background .6s" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)", fontSize: 19 }}>
                        <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--studio)", color: "#fff", display: "grid", placeItems: "center", fontSize: 15, transition: "background .6s" }}>A</span>
                        Aurora Dance Co.
                      </div>
                      <div style={{ display: "flex", gap: 18, fontSize: 13, color: "var(--muted)" }}><span>Classes</span><span>Recital</span><span>Contact</span></div>
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(34px,4.4vw,60px)", letterSpacing: "-.045em", lineHeight: 0.98, marginTop: "clamp(36px,6vw,64px)", maxWidth: "11ch" }}>Find your feet. Then your stage.</div>
                    <div style={{ display: "flex", gap: 10, marginTop: 26, flexWrap: "wrap" }}>
                      <span style={{ padding: "12px 20px", borderRadius: 999, background: "var(--studio)", color: "#fff", fontSize: 14, fontWeight: 600, transition: "background .6s", boxShadow: "0 10px 30px -10px var(--tg)" }}>Book a free trial</span>
                      <span style={{ padding: "12px 20px", borderRadius: 999, border: "1px solid var(--ring)", fontSize: 14, fontWeight: 600 }}>See the timetable</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, padding: 16 }}>
                    {[["Tuesday", "Ballet — Grade 2", "9:00 · 2 spots left"], ["Wednesday", "Hip-hop — Teens", "4:30 · Open"], ["Saturday", "Recital 2026", "Tickets on sale"]].map(([d, c, s]) => (
                      <div key={d} style={{ borderRadius: 14, padding: 14, background: "var(--t1)", border: "1px solid var(--tb)", transition: "background .6s" }}>
                        <div style={statLabel}>{d}</div>
                        <div style={{ fontWeight: 600, marginTop: 6 }}>{c}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{s}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", padding: "4px 0 16px" }}>
                    <PoweredByOlune />
                  </div>
                </div>
              </GlassPanel>
            </div>
          </div>
        </section>

        {/* ── 05 A DAY WITH OLUNE ─────────────────────────────────────── */}
        <section id="day" ref={dayRef} aria-label="A Tuesday, with Olune" style={{ position: "relative", zIndex: 1, height: "420vh" }}>
          <div style={{ position: "sticky", top: 0, height: "100vh", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,var(--midnight),#100f24)", opacity: "var(--dk)" }} />
            <div aria-hidden style={{ position: "absolute", inset: 0, opacity: "calc(var(--dk) * .9)", backgroundImage: "radial-gradient(1.2px 1.2px at 12% 18%,#fff,transparent),radial-gradient(1px 1px at 28% 8%,#fff,transparent),radial-gradient(1.4px 1.4px at 44% 26%,#fff,transparent),radial-gradient(1px 1px at 63% 12%,#fff,transparent),radial-gradient(1.2px 1.2px at 78% 30%,#fff,transparent),radial-gradient(1px 1px at 90% 6%,#fff,transparent),radial-gradient(1px 1px at 6% 40%,#fff,transparent),radial-gradient(1.3px 1.3px at 54% 42%,#fff,transparent),radial-gradient(1px 1px at 36% 48%,#fff,transparent),radial-gradient(1px 1px at 84% 46%,#fff,transparent)" }} />

            {/* sun → moon along an arc */}
            <div aria-hidden style={{ position: "absolute", width: "clamp(90px,10vw,150px)", aspectRatio: "1", left: "calc(6% + var(--d) * 80%)", top: "calc(36% - sin(var(--d) * 180deg) * 24%)", transform: "translate(-50%,-50%)" }}>
              <div style={{ position: "absolute", inset: "-60%", borderRadius: "50%", background: "radial-gradient(circle,color-mix(in srgb,var(--apricot) 55%,transparent),transparent 62%)", opacity: "calc(1 - var(--dk))" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 40% 35%,#fffaf2,var(--apricot) 70%)", opacity: "calc(1 - var(--dk))" }} />
              <div style={{ position: "absolute", inset: "-30%", opacity: "var(--dk)", display: "grid", placeItems: "center" }}>
                <OluneMark variant="corona" theme="dark" word={false} markSize="clamp(110px,12vw,180px)" />
              </div>
            </div>

            <div style={{ position: "absolute", left: 0, right: 0, top: "clamp(90px,14vh,150px)", padding: "0 clamp(24px,5vw,72px)", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24, flexWrap: "wrap", color: "color-mix(in srgb,var(--halo) calc(var(--dk) * 100%),var(--ink))" }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".18em", textTransform: "uppercase", opacity: 0.7 }}>A Tuesday, with Olune</div>
                <h2 style={{ ...serifH2, margin: "12px 0 0", letterSpacing: "-.035em" }}>Evenings, returned.</h2>
              </div>
              <div ref={clockRef} aria-hidden style={{ fontFamily: "var(--font-display)", fontWeight: 500, fontSize: "clamp(56px,9vw,140px)", lineHeight: 0.85, letterSpacing: "-.04em", fontVariantNumeric: "tabular-nums" }}>07:00</div>
            </div>

            <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: "clamp(40px,9vh,90px)", height: 1, background: "color-mix(in srgb,var(--halo) calc(var(--dk) * 30%),var(--hair))" }} />

            <div ref={trackRef} style={{ position: "absolute", left: 0, bottom: "clamp(64px,13vh,130px)", display: "flex", alignItems: "flex-end", gap: 20, padding: "0 clamp(24px,5vw,72px)", transform: "translateX(var(--tx))", willChange: "transform" }}>
              {DAY.map((m) => (
                <div key={m.time} style={{ flex: "none", width: 300 }}>
                  <GlassPanel radius={22} padding={20}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{m.time}</span>
                      {m.badge}
                    </div>
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 24, letterSpacing: "-.03em", lineHeight: 1.1, marginTop: 16 }}>{m.title}</div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--muted)", marginTop: 8 }}>{m.body}</div>
                  </GlassPanel>
                </div>
              ))}
              <div style={{ flex: "none", width: "min(560px,80vw)", padding: "0 0 4px 28px", color: "var(--halo)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: "tabular-nums", opacity: 0.7 }}>9:00 pm</div>
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(44px,6vw,88px)", letterSpacing: "-.05em", lineHeight: 0.95, marginTop: 10 }}>
                  You&apos;re home.<br />Olune isn&apos;t.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 06 PRICING ──────────────────────────────────────────────── */}
        <section id="pricing" style={{ position: "relative", zIndex: 2, background: "var(--base)", padding: "clamp(90px,14vh,160px) 24px", display: "flex", flexDirection: "column", alignItems: "center", scrollMarginTop: 60 }}>
          <div data-reveal="0" style={microLabel}>Pricing</div>
          <h2 data-reveal="80" style={{ ...h2Style, margin: "14px 0 0", fontSize: "clamp(36px,5vw,68px)", textAlign: "center", maxWidth: "16ch" }}>
            Fair pricing. <span style={{ color: "var(--iris)" }}>No surprises.</span>
          </h2>
          <p data-reveal="140" style={{ margin: "18px 0 0", maxWidth: 540, textAlign: "center", fontSize: 17, lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty" }}>
            One plan replaces your class manager, your accounting app and your website builder. Unlimited students on every plan.
          </p>
          <div data-reveal="180" role="radiogroup" aria-label="Billing period" style={{ marginTop: 36, display: "flex", gap: 4, padding: 5, borderRadius: 999, background: "var(--glass)", border: "1px solid var(--edge)", boxShadow: "inset 0 1px 0 var(--sheen)", backdropFilter: "blur(var(--blur)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur)) saturate(1.9)" }}>
            {([["Monthly", false], ["Annual · 2 months free", true]] as const).map(([label, v]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={annual === v}
                onClick={() => setAnnual(v)}
                style={{ all: "unset", cursor: "pointer", padding: "9px 18px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, color: annual === v ? "var(--ink)" : "var(--muted)", background: annual === v ? "var(--surface)" : "transparent", transition: "background .3s cubic-bezier(.32,.72,0,1)" }}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ width: "100%", maxWidth: 1180, marginTop: 44, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 16, alignItems: "stretch" }}>
            {PLAN_ORDER.map((key, i) => {
              const plan = PLANS[key], copy = PLAN_COPY[key], hot = key === "studio";
              const monthly = plan.monthlyCents / 100, yearly = plan.annualCents / 100;
              const price = annual ? Math.round(yearly / 12) : monthly;
              return (
                <div key={key} data-reveal={String(i * 90)} className="ol-lift" style={{ position: "relative", display: "flex" }}>
                  <GlassPanel level={hot ? "raised" : "panel"} glow={hot} radius={28} padding={28} style={{ width: "100%" }}>
                    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 26, gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>{copy.for}</span>
                        {hot && <span style={chip(true)}>Most popular</span>}
                      </div>
                      <h3 style={{ margin: "18px 0 0", fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-.04em" }}>{copy.name}</h3>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 10 }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 60, fontWeight: 600, letterSpacing: "-.06em", fontVariantNumeric: "tabular-nums" }}>${price}</span>
                        <span style={{ fontSize: 14, color: "var(--muted)" }}>/mo</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", minHeight: 18 }}>{annual ? `Billed $${yearly} yearly` : ""}</div>
                      <p style={{ margin: "18px 0 0", fontSize: 15, lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty" }}>{copy.desc}</p>
                      <div style={{ flex: 1, minHeight: 24 }} />
                      <RippleButton href={TRIAL_HREF} variant={hot ? "solid" : "glass"} size="lg" sweep={hot} style={{ width: "100%" }}>
                        Start free
                      </RippleButton>
                    </div>
                  </GlassPanel>
                </div>
              );
            })}
          </div>
          <div data-reveal="120" style={{ marginTop: 28, maxWidth: 760, textAlign: "center", fontSize: 14, lineHeight: 1.7, color: "var(--muted)", textWrap: "pretty" }}>
            Every plan includes unlimited students, enrolments and timetabling, attendance, invoicing and payments, and free updates. No setup fees, ever. NZD, GST-inclusive.{" "}
            <Link href="/pricing" style={{ color: "var(--ink)", fontWeight: 600 }}>Compare plans in full →</Link>
          </div>
        </section>
      </AuroraPage>
    </div>
  );
}

// ── product-tour panels ────────────────────────────────────────────────────

function TourCopy({ title, body, points }: { title: string; body: string; points: string[] }) {
  return (
    <div style={{ flex: "1 1 300px", maxWidth: 420 }}>
      <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(28px,3vw,42px)", letterSpacing: "-.04em", lineHeight: 1.05 }}>{title}</h3>
      <p style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty" }}>{body}</p>
      <ul style={{ margin: "22px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10, fontSize: 15 }}>
        {points.map((p) => (
          <li key={p}>→ {p}</li>
        ))}
      </ul>
    </div>
  );
}

function TourRow({ copy, padding = 16, children }: { copy: { title: string; body: string; points: string[] }; padding?: number; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 48, animation: `olune-lift .7s ${EASE} backwards` }}>
      <TourCopy {...copy} />
      <div style={{ flex: "2 1 520px", minWidth: 0 }}>
        <GlassPanel level="raised" radius={26} padding={padding}>
          {children}
        </GlassPanel>
      </div>
    </div>
  );
}

const slot = (name: string, meta: string, h: number, tone: "plain" | "tint" | "live" = "plain") => ({ name, meta, h, tone });
const WEEK = [
  { d: "Mon", slots: [slot("Ballet 2", "9:00 · A", 70), slot("Contemporary", "4:00 · B", 100, "tint")] },
  { d: "Tue", today: true, slots: [slot("Ballet 2", "9:00 · A", 56), slot("Jazz Jnr", "3:45 · A · 16/18", 88, "live"), slot("Pointe", "5:15 · A", 70)] },
  { d: "Wed", slots: [slot("Hip-hop", "4:30 · B", 120, "tint"), slot("Acro", "6:00 · B", 60)] },
  { d: "Thu", slots: [slot("Tap", "3:30 · A", 80)], add: true },
  { d: "Fri", slots: [slot("Lyrical", "4:00 · A", 96, "tint"), slot("Open class", "6:00 · B", 64)] },
];

function TourPanel({ tab }: { tab: number }) {
  if (tab === 0) {
    return (
      <TourRow key="t0" copy={{ title: "Timetables that keep themselves.", body: "Build the term once. Rooms, teachers and capacity stay in sync — and every family sees the live version.", points: ["Drag to reschedule, families notified", "Room clashes caught before they happen", "Attendance from the teacher's phone"] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 14px" }}>
          <b style={{ fontWeight: 600 }}>Term 4 · Week 2</b>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>Studio A + B</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 8 }}>
          {WEEK.map((col) => (
            <div key={col.d} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: col.today ? "var(--iris)" : "var(--muted)", padding: "0 4px" }}>{col.d}</div>
              {col.slots.map((s) => (
                <div
                  key={s.name + s.meta}
                  style={{
                    borderRadius: 12,
                    padding: 10,
                    height: s.h,
                    boxSizing: "border-box",
                    overflow: "hidden",
                    ...(s.tone === "plain" ? card : { background: s.tone === "live" ? "var(--t3)" : "var(--t2)", border: "1px solid var(--tb)" }),
                    ...(s.tone === "live" ? { boxShadow: "0 0 0 3px var(--t2)" } : {}),
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {s.tone === "live" && liveDot}
                    {s.name}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--muted)" }}>{s.meta}</div>
                </div>
              ))}
              {col.add && <div style={{ border: "1.5px dashed var(--tb)", borderRadius: 12, padding: 10, height: 90, boxSizing: "border-box", display: "grid", placeItems: "center", fontSize: 12, color: "var(--muted)", textAlign: "center" }}>+ Add class</div>}
            </div>
          ))}
        </div>
      </TourRow>
    );
  }
  if (tab === 1) {
    return (
      <TourRow key="t1" padding={22} copy={{ title: "Every family, one page.", body: "Siblings, medical notes, enrolments and balance — together. No more digging through emails at 10 pm.", points: ["Parents update their own details", "Sibling discounts applied for you", "One message to every family in a class"] }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
          <div style={{ width: 56, height: 56, borderRadius: 18, background: "var(--t3)", border: "1px solid var(--tb)", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>R</div>
          <div style={{ flex: 1, minWidth: 160 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 26, letterSpacing: "-.03em" }}>The Reid family</div>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>Sarah Reid · 021 555 0142 · Ponsonby</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={statLabel}>Balance</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>NZ$0.00</div>
            <div style={{ fontSize: 12, color: "var(--success)", fontWeight: 600 }}>All paid</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12, marginTop: 20 }}>
          {[
            { kid: "Ava, 7", n: "2 classes", rows: [["Ballet — Grade 1", "Tue 9:00"], ["Acro — Open", "Wed 6:00"]], note: "Note: mild asthma — inhaler in bag" },
            { kid: "Jack, 10", n: "1 class", rows: [["Hip-hop — Juniors", "Wed 4:30"]], note: "Sibling discount · 10%" },
          ].map((k) => (
            <div key={k.kid} style={{ ...card, borderRadius: 16, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <b style={{ fontWeight: 600 }}>{k.kid}</b>
                <span style={{ ...chip(), padding: "3px 9px" }}>{k.n}</span>
              </div>
              <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8, fontSize: 13 }}>
                {k.rows.map(([c, t]) => (
                  <div key={c} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span>{c}</span><span style={{ color: "var(--muted)" }}>{t}</span></div>
                ))}
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)", paddingTop: 10, borderTop: "1px solid var(--hair)" }}>{k.note}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", borderRadius: 14, background: "var(--glass2)", border: "1px solid var(--hair)", fontSize: 13 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--iris)" }} />
          <span style={{ flex: 1 }}>Sarah updated the emergency contact</span>
          <span style={{ color: "var(--muted)" }}>2 min ago</span>
        </div>
      </TourRow>
    );
  }
  if (tab === 2) {
    const rows: [string, string, ReactNode, boolean?][] = [
      ["The Reid family", "NZ$240", <span key="p" style={{ ...quietChip, color: "var(--success)" }}>Paid</span>],
      ["The Lee family", "NZ$360", <span key="p" style={{ ...quietChip, color: "var(--success)" }}>Paid</span>],
      ["The Ngata family", "NZ$180", <span key="p" style={chip(true)}>Plan · 2 of 3</span>, true],
      ["The Patel family", "NZ$240", <span key="p" style={chip()}>Sent</span>],
      ["The Brown family", "NZ$120", <span key="p" style={{ ...quietChip, color: "var(--error)" }}>Reminder sent</span>],
    ];
    return (
      <TourRow key="t2" copy={{ title: "Invoices that chase themselves.", body: "Bill the whole term in one go. Reminders go out on schedule, so you never have to send the awkward email.", points: ["Term billing in one click", "Card, bank transfer or payment plan", "Gentle reminders, on your schedule"] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "4px 6px 14px", flexWrap: "wrap" }}>
          <div>
            <b style={{ fontWeight: 600 }}>Term 4 invoices</b>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>48 families · NZ$11,520</div>
          </div>
          <span aria-hidden className="ol-rb ol-rb--solid" style={{ height: 34, padding: "0 14px", borderRadius: 10, fontSize: 12.5, cursor: "default" }}>
            <span className="ol-rb__sweep" />
            <span style={{ position: "relative" }}>Send 48 invoices</span>
          </span>
        </div>
        <div style={{ ...card, borderRadius: 16, overflow: "hidden" }}>
          {rows.map(([fam, amt, status, live], i) => (
            <div key={fam} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 90px 120px", gap: 12, padding: "13px 16px", borderBottom: i < rows.length - 1 ? "1px solid var(--hair)" : undefined, fontSize: 13, alignItems: "center", background: live ? "var(--t1)" : undefined }}>
              <b style={{ fontWeight: 600 }}>{fam}</b>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{amt}</span>
              <span style={{ justifySelf: "start" }}>{status}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 14, height: 8, borderRadius: 999, background: "var(--glass2)", border: "1px solid var(--hair)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: "65%", borderRadius: 999, background: "var(--iris)", animation: `olune-fill 1.6s .3s ${EASE} both` }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
          <span>31 of 48 paid</span>
          <span>NZ$7,440 collected</span>
        </div>
      </TourRow>
    );
  }
  if (tab === 3) {
    const bars = [52, 61, 58, 72, 80, 92];
    const months = ["May", "Jun", "Jul", "Aug", "Sep", "Oct"];
    return (
      <TourRow key="t3" padding={22} copy={{ title: "Know where you stand.", body: "Revenue, payouts and what's still owing — at a glance, in real time. Your accountant will notice.", points: ["Payouts reconciled automatically", "Term-on-term comparisons", "Export to your accounting tool"] }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={statLabel}>Revenue · October</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 6 }}>
              <span style={{ fontSize: "clamp(36px,4vw,52px)", fontWeight: 700, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>NZ$12,480</span>
              <span style={{ ...quietChip, fontSize: 12, padding: "3px 9px" }}>↑ 4%</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "var(--glass2)", border: "1px solid var(--hair)", fontSize: 12, fontWeight: 600 }}>
            <span style={{ padding: "6px 10px", borderRadius: 9, background: "var(--t3)" }}>6 months</span>
            <span style={{ padding: "6px 10px", color: "var(--muted)" }}>Year</span>
          </div>
        </div>
        <div style={{ marginTop: 24, height: 220, display: "flex", alignItems: "flex-end", gap: "clamp(8px,2vw,22px)", padding: "0 4px", borderBottom: "1px solid var(--hair)" }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", height: "100%", justifyContent: "flex-end" }}>
              <div style={{ width: "100%", height: `${h}%`, borderRadius: "10px 10px 4px 4px", background: i === bars.length - 1 ? "var(--iris)" : "var(--t3)", transformOrigin: "bottom", animation: `olune-grow 1s ${(0.05 + i * 0.07).toFixed(2)}s ${EASE} both` }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: "clamp(8px,2vw,22px)", padding: "8px 4px 0", fontSize: 11.5, color: "var(--muted)" }}>
          {months.map((m, i) => (
            <span key={m} style={{ flex: 1, textAlign: "center", ...(i === months.length - 1 ? { color: "var(--ink)", fontWeight: 600 } : {}) }}>{m}</span>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, marginTop: 18 }}>
          {[["Paid out", "NZ$9,860"], ["Pending", "NZ$2,140"], ["Overdue", "NZ$480"]].map(([l, v]) => (
            <div key={l} style={{ ...card, borderRadius: 14, padding: "12px 14px" }}>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>{l}</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{v}</div>
            </div>
          ))}
        </div>
      </TourRow>
    );
  }
  return (
    <TourRow key="t4" padding={10} copy={{ title: "A website that's always right.", body: "Your timetable, prices and enrolment live on your own site. Change it once in Olune — it's live everywhere.", points: ["Your domain, your colours", "Trial bookings straight into Olune", "No web developer required"] }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 12px" }}>
        <span style={{ display: "flex", gap: 6 }}>
          {[0, 1, 2].map((k) => <span key={k} style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--ring)" }} />)}
        </span>
        <span style={{ flex: 1, maxWidth: 280, margin: "0 auto", textAlign: "center", fontSize: 12, color: "var(--muted)", padding: "5px 12px", borderRadius: 8, background: "var(--glass2)", border: "1px solid var(--hair)" }}>auroradance.co.nz</span>
      </div>
      <div style={{ ...card, borderRadius: 18, overflow: "hidden" }}>
        <div style={{ padding: "34px 30px", background: "radial-gradient(120% 120% at 100% 0%,var(--t3),transparent 60%),var(--surface)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-display)", fontSize: 18 }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--studio)", color: "#fff", display: "grid", placeItems: "center", fontSize: 14 }}>A</span>
            Aurora Dance Co.
          </div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-.04em", lineHeight: 1, marginTop: 26, maxWidth: "12ch" }}>Find your feet. Then your stage.</div>
          <div style={{ display: "flex", gap: 10, marginTop: 22, flexWrap: "wrap" }}>
            <span style={{ padding: "11px 18px", borderRadius: 999, background: "var(--studio)", color: "#fff", fontSize: 13, fontWeight: 600 }}>Book a free trial</span>
            <span style={{ padding: "11px 18px", borderRadius: 999, border: "1px solid var(--ring)", fontSize: 13, fontWeight: 600 }}>Timetable</span>
          </div>
        </div>
        <div style={{ padding: "6px 30px 18px" }}>
          {[["Ballet — Grade 2", "Tue 9:00", <span key="e" style={chip()}>Enrol · 2 spots</span>], ["Jazz — Juniors", "Tue 3:45", <span key="w" style={{ ...quietChip, color: "var(--muted)" }}>Waitlist</span>]].map(([c, t, s], i) => (
            <Fragment key={c as string}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, padding: "12px 0", borderBottom: i === 0 ? "1px solid var(--hair)" : undefined, fontSize: 13 }}>
                <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}><b style={{ fontWeight: 600 }}>{c}</b><span style={{ color: "var(--muted)" }}>· {t}</span></span>
                {s}
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </TourRow>
  );
}
