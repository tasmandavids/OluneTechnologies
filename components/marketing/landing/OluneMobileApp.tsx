"use client";

// ============================================================================
//  components/marketing/landing/OluneMobileApp.tsx
//  Interactive Olune Mobile showcase — an iOS device frame running a live,
//  clickable prototype of the app. Ported 1:1 from the Claude Design Studio
//  export ("Olune Mobile.dc.html" + its ios-frame starter): same roles, same
//  copy, same agent proposals, same scrubbable day.
//
//  Only the accent is re-pointed: the design shipped on #6B66C9, this uses the
//  marketing site's #8b7cf0 so the phone sits inside the landing palette.
//
//  Inline styles like the rest of the landing tree; hover/keyframes live in
//  styles/landing-design.css.
// ============================================================================

import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { DISPLAY, BODY } from "@/components/marketing/landing/chrome";

// ── palette (app surface, distinct from the page around it) ───────────────
const BRAND = "#8b7cf0";
const BRAND_HOT = "#a498f3";
const BRAND_DEEP = "#5f54a3";
const INK = "#0a0a0a";
const MUTED = "#6c6a7e";
const PAPER = "#faf8f3";
const LINE = "rgba(10,10,10,0.08)";
const GREEN = "#16a34a";
const RED = "#dc2626";
const NAVY = "#1a1535";

// ── data (verbatim from the design export) ────────────────────────────────
const ROSTER = ["Ruby T.", "Mia K.", "Ada L.", "Noor S.", "Ivy P.", "Jae W.", "Lila M.", "Ana R.", "Tess V.", "Kit B.", "Rae D.", "Nia O.", "Zoe F.", "Emme H.", "Cleo J.", "Sana G."] as const;

type RoleKey = "owner" | "teacher" | "parent";
type TabKey = "home" | "day" | "money" | "wrap";

const ROLES: Record<RoleKey, { label: string; initials: string; name: string }> = {
  owner: { label: "Studio admin", initials: "JD", name: "Owner" },
  teacher: { label: "Teacher", initials: "MR", name: "Teacher" },
  parent: { label: "Parent · Ruby", initials: "SH", name: "Parent" },
};

const PROPOSALS: Record<RoleKey, { id: string; title: string; body: string; cta: string; done: string }[]> = {
  owner: [
    { id: "inv", title: "Three families are late on term 3", body: "$312 outstanding. A warm reminder is written for each, in your voice.", cta: "Send all three", done: "Reminders sent · quietly" },
    { id: "cov", title: "Mara is out Thursday", body: "Kit is free, teaches the same syllabus and has covered Grade 3 twice.", cta: "Ask Kit to cover", done: "Kit asked · families notified if she says yes" },
  ],
  teacher: [
    { id: "reg", title: "Grade 3 register is ready", body: "14 expected, 2 away. Tap once at the door and it's logged for good.", cta: "Open the register", done: "Register open" },
    { id: "note", title: "Mia has arrived late three weeks running", body: "A gentle note to her family is drafted. Nothing sent without you.", cta: "Read the note", done: "Note sent to Mia's family" },
  ],
  parent: [
    { id: "pay", title: "Ruby's term 3 invoice is due Friday", body: "$48, or split across the term at no extra cost.", cta: "Pay $48", done: "Paid · receipt in your inbox" },
    { id: "cos", title: "Costume sizing closes Sunday", body: "Ruby's measurements from June are still on file. Confirm or update.", cta: "Confirm sizing", done: "Sizing confirmed" },
  ],
};

const STATS: Record<RoleKey, { label: string; value: string; sub: string }[]> = {
  owner: [{ label: "In today", value: "$1,240", sub: "↑ 18% on last Tuesday" }, { label: "Attendance", value: "92%", sub: "Best week this term" }],
  teacher: [{ label: "Your classes", value: "3", sub: "Two hours left" }, { label: "Notes owed", value: "0", sub: "All caught up" }],
  parent: [{ label: "Ruby this term", value: "11/12", sub: "One away, excused" }, { label: "Next class", value: "Thu 4:30", sub: "Studio B · Mara" }],
};

const HERO: Record<RoleKey, { line: string; sub: string }> = {
  owner: { line: "Three classes left tonight.", sub: "Everything else is already handled." },
  teacher: { line: "Grade 3 in twelve minutes.", sub: "Studio A · 14 expected" },
  parent: { line: "Ruby is in Studio A.", sub: "Checked in at 5:02 · out at 6:30" },
};

const WRAP: Record<RoleKey, { title: string; body: string }> = {
  owner: { title: "Evenings, returned.", body: "Everything from today is logged, invoiced and filed. Nothing is waiting for you tomorrow morning." },
  teacher: { title: "Three classes, taught.", body: "Registers are in, two notes are written. Go home." },
  parent: { title: "Ruby danced today.", body: "In at 5:02, out at 6:30. Mara left a note about her turns." },
};

const WRAP_ROWS: Record<RoleKey, { label: string; value: string }[]> = {
  owner: [{ label: "Classes run", value: "7 of 7" }, { label: "Attendance logged", value: "96 dancers" }, { label: "Invoiced", value: "$1,240" }, { label: "Admin you touched", value: "4 taps" }],
  teacher: [{ label: "Classes taught", value: "3" }, { label: "Registers", value: "Complete" }, { label: "Notes home", value: "2 sent" }, { label: "Admin you touched", value: "2 taps" }],
  parent: [{ label: "Ruby's class", value: "Attended" }, { label: "Term paid", value: "Up to date" }, { label: "Next", value: "Thu 4:30" }, { label: "Messages", value: "1 from Mara" }],
};

const ROOMS = [
  { name: "Studio A", cls: "Grade 3 ballet · Mara", from: 0.28, to: 0.62 },
  { name: "Studio B", cls: "Jazz teens · Kit", from: 0.42, to: 0.78 },
  { name: "Studio C", cls: "Adult contemporary · Nina", from: 0.66, to: 0.95 },
] as const;

type Ask = { q: string; steps: string[]; answer: string; cta: string; toast: string };

const ASKS: Record<RoleKey, Ask[]> = {
  owner: [
    { q: "Who hasn't paid for term 3?", steps: ["Reading 128 invoices · on device", "Cross-checking 3 payment plans", "3 families outstanding · $312"], answer: "Three families: the Halls, the Ngatas and the Bergs. $312 in total, all under two weeks late. Reminders are drafted in your voice.", cta: "Send all three", toast: "Reminders sent · quietly" },
    { q: "Can we afford a fourth studio room?", steps: ["Modelling 12 months of cash flow", "Weighting term-3 enrolment trend", "Break-even in month 5"], answer: "Yes, if enrolment holds above 118. Break-even lands in month five and the Tuesday 5pm waitlist alone fills two classes.", cta: "Save this as a plan", toast: "Plan saved to your studio" },
    { q: "Who's free to cover Thursday?", steps: ["Checking 9 teacher calendars", "Matching syllabus + grade", "Kit is the best fit"], answer: "Kit. She's free 4–7, teaches the same syllabus and has covered Grade 3 twice this year.", cta: "Ask Kit to cover", toast: "Kit asked · we'll tell you when she replies" },
  ],
  teacher: [
    { q: "Who's missing from Grade 3?", steps: ["Reading tonight's register", "Checking absence notes", "2 away, 1 unaccounted"], answer: "Ivy and Tess are excused. Nia hasn't checked in and no note came through — want to ask her family?", cta: "Message Nia's family", toast: "Message sent to Nia's family" },
    { q: "Write Mia's progress note", steps: ["Reading 8 weeks of your notes", "Matching Grade 3 syllabus", "Draft ready · your phrasing"], answer: "Drafted: Mia's turns have settled and her port de bras is much softer. Suggest working on spotting before the exam.", cta: "Send to Mia's family", toast: "Note sent to Mia's family" },
  ],
  parent: [
    { q: "When is Ruby's next class?", steps: ["Checking Ruby's enrolments", "Thursday 4:30 · Studio B"], answer: "Thursday at 4:30 in Studio B with Mara. She's enrolled through to the end of term.", cta: "Add to my calendar", toast: "Added to your calendar" },
    { q: "How much do I owe?", steps: ["Reading your term 3 invoice", "$48 due Friday"], answer: "$48 for term 3, due Friday. You can pay it now or split it across the term at no extra cost.", cta: "Pay $48", toast: "Paid · receipt in your inbox" },
  ],
};

const TAB_DEFS: { key: TabKey; label: string; parentLabel?: string; d: string }[] = [
  { key: "home", label: "Tonight", d: "M20 12.4A8 8 0 1 1 11.6 4a6.2 6.2 0 0 0 8.4 8.4Z" },
  { key: "day", label: "Day", d: "M12 7.5V12l2.8 1.8M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { key: "money", label: "Money", parentLabel: "Fees", d: "M3.5 7.5h17v9h-17zM12 14.4a2.4 2.4 0 1 1 0-4.8 2.4 2.4 0 0 1 0 4.8ZM6.6 7.5v9M17.4 7.5v9" },
  { key: "wrap", label: "Wrap", d: "m8.4 12.2 2.6 2.6 4.6-5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
];

const NOW = 0.58;

// ── small shared bits ─────────────────────────────────────────────────────
const cardStyle: CSSProperties = { border: `1px solid ${LINE}`, background: "#ffffff", borderRadius: 16 };
const eyebrowStyle: CSSProperties = { fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: MUTED };
const resetBtn: CSSProperties = { border: "none", background: "none", padding: 0, margin: 0, font: "inherit", color: "inherit", textAlign: "left", cursor: "pointer" };

/** The eclipse mark — the same two-circle logo the nav uses, at app scale. */
function Moon({ size, glow = false }: { size: number; glow?: boolean }) {
  return (
    <span aria-hidden style={{ position: "relative", width: size, height: size, display: "inline-block", filter: glow ? `drop-shadow(0 0 ${size * 0.28}px ${BRAND}66)` : undefined }}>
      <span style={{ position: "absolute", top: "15%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: BRAND }} />
      <span style={{ position: "absolute", top: "6%", left: "5%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY }} />
    </span>
  );
}

function StatusBar() {
  return (
    <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "21px 30px 19px", boxSizing: "border-box" }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: INK, fontVariantNumeric: "tabular-nums" }}>9:41</span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <svg width="17" height="11" viewBox="0 0 19 12"><rect x="0" y="7.5" width="3.2" height="4.5" rx="0.7" fill={INK} /><rect x="4.8" y="5" width="3.2" height="7" rx="0.7" fill={INK} /><rect x="9.6" y="2.5" width="3.2" height="9.5" rx="0.7" fill={INK} /><rect x="14.4" y="0" width="3.2" height="12" rx="0.7" fill={INK} /></svg>
        <svg width="24" height="12" viewBox="0 0 27 13"><rect x="0.5" y="0.5" width="23" height="12" rx="3.5" stroke={INK} strokeOpacity="0.35" fill="none" /><rect x="2" y="2" width="20" height="9" rx="2" fill={INK} /><path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill={INK} fillOpacity="0.4" /></svg>
      </span>
    </div>
  );
}

// ── the prototype ─────────────────────────────────────────────────────────
export function OluneMobileApp() {
  const [role, setRole] = useState<RoleKey>("owner");
  const [tab, setTab] = useState<TabKey>("home");
  const [sheet, setSheet] = useState<"roll" | "ask" | null>(null);
  const [present, setPresent] = useState<Record<string, boolean>>(() => Object.fromEntries(ROSTER.slice(0, 12).map((n) => [n, true])));
  const [scrub, setScrub] = useState(0.58);
  const [dragging, setDragging] = useState(false);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [askStep, setAskStep] = useState(0);
  const [askDone, setAskDone] = useState(false);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [closed, setClosed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const askTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 4200);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    askTimers.current.forEach(clearTimeout);
  }, []);

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  }

  function pickRole(next: RoleKey) {
    setRole(next);
    setTab("home");
    setSheet(null);
    setDismissed({});
    setClosed(false);
  }

  function runAsk(item: Ask) {
    askTimers.current.forEach(clearTimeout);
    askTimers.current = [];
    setSheet("ask");
    setAsk(item);
    setAskStep(0);
    setAskDone(false);
    item.steps.forEach((_, i) => {
      askTimers.current.push(setTimeout(() => setAskStep(i + 1), 520 * (i + 1)));
    });
    askTimers.current.push(setTimeout(() => setAskDone(true), 520 * item.steps.length + 380));
  }

  function scrubFrom(e: ReactPointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setScrub(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  }

  // ── derived ─────────────────────────────────────────────────────────────
  const presentCount = ROSTER.filter((n) => present[n]).length;
  const proposals = PROPOSALS[role].filter((p) => !dismissed[p.id]);

  const mins = Math.round(15 * 60 + scrub * 6 * 60);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const h12 = h24 > 12 ? h24 - 12 : h24;
  const scrubTime = `${h12}:${String(m).padStart(2, "0")}${h24 >= 12 ? " pm" : " am"}`;
  const future = scrub > NOW + 0.012;

  const askList = ASKS[role];
  const cur = ask ?? askList[0];

  const invoices = [
    { ini: "SH", name: "The Halls · Ruby", due: "9 days late", amount: "$48", tint: RED },
    { ini: "TN", name: "The Ngatas · Ana", due: "4 days late", amount: "$132", tint: RED },
    { ini: "BB", name: "The Bergs · Ivy, Zoe", due: "Due Friday", amount: "$132", tint: MUTED },
  ];

  return (
    <div className="dcl-mobile-showcase" style={{ display: "grid", gridTemplateColumns: "auto 340px", gap: 56, alignItems: "start", justifyContent: "center" }}>
      {/* ── device ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 18 }}>
        <div
          className="dcl-phone"
          style={{
            // Phone-shaped at every width: 402×812 on desktop, proportionally
            // narrower on small screens. Never squashed.
            width: "min(402px, 100%)", aspectRatio: "402 / 812", borderRadius: 48, overflow: "hidden", position: "relative",
            background: PAPER, color: INK, fontFamily: BODY, boxSizing: "border-box",
            boxShadow: "0 46px 90px -30px rgba(26,21,53,0.42), 0 0 0 1px rgba(26,21,53,0.12)",
            display: "flex", flexDirection: "column",
          }}
        >
          <div aria-hidden style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 126, height: 34, borderRadius: 24, background: "#000", zIndex: 50 }} />
          <StatusBar />

          {/* ambient wash */}
          <div aria-hidden style={{ position: "absolute", top: -120, left: -60, width: 340, height: 340, borderRadius: "50%", background: `radial-gradient(circle, ${BRAND}29, transparent 68%)`, filter: "blur(18px)", pointerEvents: "none" }} />
          <div aria-hidden style={{ position: "absolute", bottom: 60, right: -90, width: 300, height: 300, borderRadius: "50%", background: "radial-gradient(circle, rgba(242,183,136,0.16), transparent 66%)", filter: "blur(14px)", pointerEvents: "none" }} />

          {/* app header */}
          <div style={{ padding: "62px 22px 10px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 2 }}>
            <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={eyebrowStyle}>{ROLES[role].label}</span>
              <span style={{ fontFamily: DISPLAY, fontSize: 20, letterSpacing: "-0.015em" }}>Northbrook Dance</span>
            </span>
            <button
              type="button"
              onClick={() => {
                const keys = Object.keys(ROLES) as RoleKey[];
                pickRole(keys[(keys.indexOf(role) + 1) % keys.length]);
              }}
              className="dcl-ph-switch"
              style={{ ...resetBtn, display: "flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 6px", border: `1px solid ${LINE}`, borderRadius: 9999, background: "rgba(10,10,10,0.03)" }}
            >
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: `linear-gradient(140deg, #dcd9fa, ${BRAND})`, display: "flex", alignItems: "center", justifyContent: "center", color: "#1b1a38", fontSize: 11, fontWeight: 700 }}>{ROLES[role].initials}</span>
              <span style={eyebrowStyle}>switch</span>
            </button>
          </div>

          {/* scroll body */}
          <div className="dcl-ph-scroll" style={{ flex: 1, overflowY: "auto", position: "relative", zIndex: 2, padding: "0 22px 200px" }}>
            {tab === "home" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
                <button type="button" onClick={() => setTab("wrap")} style={{ ...resetBtn, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "18px 0 4px" }}>
                  <span style={{ position: "relative", width: 150, height: 150, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg aria-hidden viewBox="0 0 200 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}>
                      <circle cx="100" cy="100" r="92" fill="none" stroke="rgba(10,10,10,0.10)" strokeWidth="2" />
                      <circle cx="100" cy="100" r="92" fill="none" stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeDasharray="416 578" />
                    </svg>
                    <span style={{ display: "inline-block", animation: "olBreathe 9s ease-in-out infinite" }}><Moon size={104} glow /></span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, textAlign: "center" }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 28, letterSpacing: "-0.025em", lineHeight: 1.15 }}>{HERO[role].line}</span>
                    <span style={{ fontSize: 13, color: MUTED }}>{HERO[role].sub}</span>
                  </span>
                </button>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={eyebrowStyle}>Needs you</span>
                    <span style={{ ...eyebrowStyle, color: BRAND }}>Drafted on device</span>
                  </div>
                  {proposals.map((p) => (
                    <div key={p.id} style={{ ...cardStyle, padding: 16, display: "flex", flexDirection: "column", gap: 12, animation: "olRise .32s cubic-bezier(.16,1,.3,1) both" }}>
                      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                        <span style={{ width: 34, height: 34, flex: "none", borderRadius: 10, background: `${BRAND}2e`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg aria-hidden viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 12.4A8 8 0 1 1 11.6 4a6.2 6.2 0 0 0 8.4 8.4Z" /></svg>
                        </span>
                        <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.3 }}>{p.title}</span>
                          <span style={{ fontSize: 13, color: MUTED, lineHeight: 1.45 }}>{p.body}</span>
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button type="button" className="dcl-ph-primary" onClick={() => { setDismissed((d) => ({ ...d, [p.id]: true })); flash(p.done); }} style={{ ...resetBtn, flex: 1, borderRadius: 12, padding: 10, background: BRAND, color: "#fff", fontSize: 13, fontWeight: 600, textAlign: "center" }}>{p.cta}</button>
                        <button type="button" className="dcl-ph-ghost" onClick={() => setDismissed((d) => ({ ...d, [p.id]: true }))} style={{ ...resetBtn, border: `1px solid ${LINE}`, borderRadius: 12, padding: "10px 14px", color: MUTED, fontSize: 13 }}>Not now</button>
                      </div>
                    </div>
                  ))}
                  {proposals.length === 0 && (
                    <div style={{ border: "1px dashed rgba(10,10,10,0.12)", borderRadius: 16, padding: 22, textAlign: "center", color: MUTED, fontSize: 13 }}>Nothing waiting on you. Olune will speak up if that changes.</div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={eyebrowStyle}>Right now</span>
                  <button type="button" className="dcl-ph-row" onClick={() => setSheet("roll")} style={{ ...resetBtn, ...cardStyle, padding: 16, display: "flex", alignItems: "center", gap: 14, width: "100%" }}>
                    <span aria-hidden style={{ position: "relative", width: 10, height: 10, flex: "none" }}>
                      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: GREEN }} />
                      <span style={{ position: "absolute", inset: 0, borderRadius: "50%", background: GREEN, animation: "olPulse 2.4s ease-out infinite" }} />
                    </span>
                    <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontSize: 15, fontWeight: 600 }}>Grade 3 ballet · Studio A</span>
                      <span style={{ fontSize: 13, color: MUTED }}>{tick % 2 ? "Two arrived in the last minute" : "Started 6 minutes ago · Mara"}</span>
                    </span>
                    <span style={{ fontSize: 24, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{presentCount}/16</span>
                    <span aria-hidden style={{ color: MUTED, fontSize: 18 }}>›</span>
                  </button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {STATS[role].map((s) => (
                    <div key={s.label} style={{ ...cardStyle, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 5 }}>
                      <span style={eyebrowStyle}>{s.label}</span>
                      <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums" }}>{s.value}</span>
                      <span style={{ fontSize: 12, color: BRAND }}>{s.sub}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "day" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 24, letterSpacing: "-0.025em" }}>The day, scrubbed</span>
                  <span style={{ fontSize: 13, color: MUTED }}>Drag the line. Every room, every teacher, every arrival — replayed or predicted.</span>
                </div>

                <div style={{ ...cardStyle, borderRadius: 20, padding: "18px 16px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums" }}>{scrubTime}</span>
                    <span style={{ ...eyebrowStyle, color: future ? BRAND : MUTED }}>{future ? "Predicted" : "Replay"}</span>
                  </div>
                  <div
                    role="slider"
                    tabIndex={0}
                    aria-label="Scrub through the studio day"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(scrub * 100)}
                    aria-valuetext={scrubTime}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") { e.preventDefault(); setScrub((v) => Math.max(0, v - 0.04)); }
                      if (e.key === "ArrowRight") { e.preventDefault(); setScrub((v) => Math.min(1, v + 0.04)); }
                    }}
                    onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true); scrubFrom(e); }}
                    onPointerMove={(e) => { if (dragging) scrubFrom(e); }}
                    onPointerUp={() => setDragging(false)}
                    style={{ position: "relative", height: 26, display: "flex", alignItems: "center", cursor: "ew-resize", touchAction: "none" }}
                  >
                    <div style={{ height: 4, width: "100%", borderRadius: 999, background: "rgba(10,10,10,0.08)" }} />
                    <div style={{ position: "absolute", top: 11, left: 0, height: 4, borderRadius: 999, background: `linear-gradient(90deg, ${BRAND}, ${BRAND_HOT})`, width: `${scrub * 100}%` }} />
                    <div style={{ position: "absolute", top: 2, width: 22, height: 22, marginLeft: -11, borderRadius: "50%", background: "#fff", border: `1px solid ${LINE}`, boxShadow: "0 4px 12px rgba(10,10,10,0.2)", left: `${scrub * 100}%` }} />
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, fontVariantNumeric: "tabular-nums" }}>
                    <span>3:00 pm</span><span>6:00 pm</span><span>9:00 pm</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {ROOMS.map((r) => {
                    const live = scrub >= r.from && scrub <= r.to;
                    const past = scrub > r.to;
                    const fill = live ? Math.round(((scrub - r.from) / (r.to - r.from)) * 100) : past ? 100 : 0;
                    const tint = live ? (future ? BRAND : GREEN) : MUTED;
                    const heads = 12 + Math.trunc(r.from * 10);
                    return (
                      <div key={r.name} style={{ ...cardStyle, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10, opacity: live ? 1 : 0.55 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <span style={eyebrowStyle}>{r.name}</span>
                          <span style={{ fontSize: 12, color: tint }}>{live ? (future ? "Predicted" : "In session") : past ? "Finished" : "Empty"}</span>
                        </div>
                        <span style={{ fontSize: 15, fontWeight: 600 }}>{r.cls}</span>
                        <div style={{ height: 6, borderRadius: 999, background: "rgba(10,10,10,0.07)", overflow: "hidden" }}>
                          <div style={{ height: "100%", borderRadius: 999, background: tint, width: `${fill}%` }} />
                        </div>
                        <span style={{ fontSize: 12, color: MUTED }}>
                          {live ? (future ? `Expecting ${heads} dancers` : `${heads} in the room · 1 late`) : past ? "Register complete · notes filed" : "Doors open 20 minutes before"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "money" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 18, paddingTop: 14 }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 24, letterSpacing: "-0.025em" }}>Money, live</span>
                  <span style={{ fontSize: 13, color: MUTED }}>Term 3 · 128 families</span>
                </div>

                <div style={{ ...cardStyle, borderRadius: 20, padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={eyebrowStyle}>In today</span>
                      <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: "-0.025em", fontVariantNumeric: "tabular-nums" }}>{`$1,2${40 + (tick % 3) * 4}`}</span>
                    </span>
                    <span style={{ fontSize: 12, color: GREEN }}>↑ 18% on last Tuesday</span>
                  </div>
                  <svg aria-hidden viewBox="0 0 300 70" preserveAspectRatio="none" style={{ width: "100%", height: 70 }}>
                    <defs><linearGradient id="olfade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={BRAND} stopOpacity="0.28" /><stop offset="1" stopColor={BRAND} stopOpacity="0" /></linearGradient></defs>
                    <polyline points="0,54 30,50 60,56 90,42 120,46 150,33 180,36 210,24 240,28 270,14 300,10 300,70 0,70" fill="url(#olfade)" stroke="none" />
                    <polyline points="0,54 30,50 60,56 90,42 120,46 150,33 180,36 210,24 240,28 270,14 300,10" fill="none" stroke={BRAND} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <span style={eyebrowStyle}>Outstanding · $312</span>
                  {invoices.map((inv) => (
                    <div key={inv.name} style={{ ...cardStyle, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                      <span style={{ width: 34, height: 34, flex: "none", borderRadius: "50%", background: `${BRAND}26`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: BRAND }}>{inv.ini}</span>
                      <span style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{inv.name}</span>
                        <span style={{ fontSize: 12, color: inv.tint }}>{inv.due}</span>
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{inv.amount}</span>
                      <button type="button" className="dcl-ph-chase" onClick={() => flash(`Reminder sent to ${inv.name.split(" · ")[0]}`)} style={{ ...resetBtn, border: `1px solid ${LINE}`, fontSize: 12, padding: "7px 12px", borderRadius: 10 }}>Chase</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "wrap" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 22, paddingTop: 22, alignItems: "center", textAlign: "center" }}>
                <span style={{ display: "inline-block", animation: "olBreathe 9s ease-in-out infinite" }}><Moon size={96} glow /></span>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 28, letterSpacing: "-0.025em" }}>{closed ? "Goodnight." : WRAP[role].title}</span>
                  <span style={{ fontSize: 14, color: MUTED, lineHeight: 1.5, maxWidth: 280 }}>{closed ? "The studio is closed and tomorrow is already prepared. See you at nine." : WRAP[role].body}</span>
                </div>
                <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                  {WRAP_ROWS[role].map((w) => (
                    <div key={w.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", ...cardStyle, borderRadius: 14, animation: "olTick .32s cubic-bezier(.16,1,.3,1) both" }}>
                      <span style={{ fontSize: 13, color: MUTED }}>{w.label}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{w.value}</span>
                    </div>
                  ))}
                </div>
                {!closed && (
                  <button type="button" className="dcl-ph-primary" onClick={() => { setClosed(true); flash("Day closed · nothing left over"); }} style={{ ...resetBtn, width: "100%", borderRadius: 14, padding: 15, background: BRAND, color: "#fff", fontSize: 15, fontWeight: 600, textAlign: "center" }}>Close the day</button>
                )}
              </div>
            )}
          </div>

          {/* ask bar + tab bar */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 6, padding: "0 22px 30px", background: `linear-gradient(180deg, ${PAPER}00, ${PAPER} 32%)` }}>
            <button type="button" className="dcl-ph-ask" onClick={() => runAsk(askList[0])} style={{ ...resetBtn, display: "flex", width: "100%", alignItems: "center", gap: 10, padding: "13px 16px", marginBottom: 12, borderRadius: 9999, border: `1px solid ${LINE}`, background: "rgba(255,255,255,0.92)", backdropFilter: "blur(12px)" }}>
              <svg aria-hidden viewBox="0 0 24 24" width="17" height="17" fill="none" stroke={BRAND} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
              <span style={{ flex: 1, fontSize: 14, color: MUTED }}>Ask Olune anything</span>
              <span style={eyebrowStyle}>Hold</span>
            </button>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 6px" }}>
              {TAB_DEFS.map((t) => {
                const active = tab === t.key;
                return (
                  <button key={t.key} type="button" onClick={() => { setTab(t.key); setSheet(null); }} style={{ ...resetBtn, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "4px 12px", color: active ? INK : MUTED }}>
                    <svg aria-hidden viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: active ? 1 : 0.85 }}><path d={t.d} /></svg>
                    <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase" }}>{role === "parent" && t.parentLabel ? t.parentLabel : t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* register sheet */}
          {sheet === "roll" && (
            <div role="presentation" onClick={() => setSheet(null)} style={{ position: "absolute", inset: 0, zIndex: 20, background: "rgba(10,10,10,0.32)", display: "flex", alignItems: "flex-end" }}>
              <div role="presentation" onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxHeight: "82%", display: "flex", flexDirection: "column", background: "#fff", borderRadius: "26px 26px 0 0", borderTop: `1px solid ${LINE}`, animation: "olSheet .32s cubic-bezier(.16,1,.3,1) both" }}>
                <div style={{ padding: "14px 22px 10px", display: "flex", flexDirection: "column", gap: 12 }}>
                  <span aria-hidden style={{ width: 38, height: 4, borderRadius: 99, background: "rgba(10,10,10,0.15)", alignSelf: "center" }} />
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
                    <span style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      <span style={{ fontFamily: DISPLAY, fontSize: 20, letterSpacing: "-0.015em" }}>Grade 3 ballet</span>
                      <span style={{ fontSize: 12, color: MUTED }}>Studio A · 5:30 pm · Mara</span>
                    </span>
                    <span style={{ fontSize: 36, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>{presentCount}/16</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 10, background: "rgba(10,10,10,0.03)", border: "1px solid rgba(10,10,10,0.07)" }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: presentCount === 12 ? GREEN : BRAND }} />
                    <span style={{ fontSize: 12, color: MUTED }}>{presentCount === 12 ? "Saved on device · in sync" : "Saved on device · syncing when signal returns"}</span>
                  </div>
                </div>
                <div className="dcl-ph-scroll" style={{ flex: 1, overflowY: "auto", padding: "6px 14px 30px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {ROSTER.map((name) => {
                    const on = !!present[name];
                    return (
                      <button key={name} type="button" onClick={() => setPresent((p) => ({ ...p, [name]: !p[name] }))} style={{ ...resetBtn, display: "flex", alignItems: "center", gap: 9, padding: "11px 12px", borderRadius: 13, border: `1px solid ${on ? `${BRAND}80` : "rgba(10,10,10,0.07)"}`, background: on ? `${BRAND}1f` : "transparent" }}>
                        <span style={{ width: 20, height: 20, flex: "none", borderRadius: 7, border: `1.5px solid ${on ? BRAND : "rgba(10,10,10,0.22)"}`, background: on ? BRAND : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <svg aria-hidden viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: on ? 1 : 0 }}><path d="M20 6 9 17l-5-5" /></svg>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ask sheet */}
          {sheet === "ask" && (
            <div role="presentation" onClick={() => setSheet(null)} style={{ position: "absolute", inset: 0, zIndex: 24, background: "rgba(10,10,10,0.36)", display: "flex", alignItems: "flex-end" }}>
              <div role="presentation" onClick={(e) => e.stopPropagation()} style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16, background: "#fff", borderRadius: "26px 26px 0 0", borderTop: `1px solid ${LINE}`, padding: "16px 22px 34px", animation: "olSheet .32s cubic-bezier(.16,1,.3,1) both" }}>
                <span aria-hidden style={{ width: 38, height: 4, borderRadius: 99, background: "rgba(10,10,10,0.15)", alignSelf: "center" }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ position: "relative", width: 44, height: 44, flex: "none", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "50%", background: BRAND, opacity: 0.25, animation: "olPulse 2.6s ease-out infinite" }} />
                    <Moon size={34} />
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.35 }}>{cur.q}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                  {cur.steps.slice(0, askStep).map((label, i) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 10, animation: "olTick .28s ease-out both" }}>
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: "50%", flex: "none", background: i === askStep - 1 && !askDone ? BRAND : GREEN }} />
                      <span style={{ fontSize: 13, color: i === cur.steps.length - 1 ? INK : MUTED }}>{label}</span>
                    </div>
                  ))}
                </div>
                {askDone && (
                  <div style={{ border: `1px solid ${BRAND}66`, background: `${BRAND}1a`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12, animation: "olRise .32s cubic-bezier(.16,1,.3,1) both" }}>
                    <span style={{ fontSize: 14, lineHeight: 1.45 }}>{cur.answer}</span>
                    <button type="button" className="dcl-ph-primary" onClick={() => { setSheet(null); flash(cur.toast); }} style={{ ...resetBtn, borderRadius: 12, padding: 11, background: BRAND, color: "#fff", fontSize: 13, fontWeight: 600, textAlign: "center" }}>{cur.cta}</button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {askList.filter((a) => a.q !== cur.q).map((a) => (
                    <button key={a.q} type="button" className="dcl-ph-chip" onClick={() => runAsk(a)} style={{ ...resetBtn, padding: "9px 13px", borderRadius: 9999, border: `1px solid ${LINE}`, fontSize: 12, color: MUTED }}>{a.q}</button>
                  ))}
                </div>
                <span style={{ ...eyebrowStyle, textAlign: "center" }}>Runs on device · nothing leaves the studio</span>
              </div>
            </div>
          )}

          {/* toast */}
          {toast && (
            <div role="status" style={{ position: "absolute", left: 22, right: 22, bottom: 130, zIndex: 30, display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderRadius: 14, background: "#1b1a38", color: "#f7f4ee", boxShadow: "0 16px 40px -16px rgba(0,0,0,0.7)", animation: "olRise .28s cubic-bezier(.16,1,.3,1) both" }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: GREEN }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{toast}</span>
            </div>
          )}
        </div>

        <span style={{ ...eyebrowStyle, textAlign: "center" }}>Tap the moon · drag the day · ask anything</span>
      </div>

      {/* ── aside ── */}
      <aside style={{ display: "flex", flexDirection: "column", gap: 26, paddingTop: 8 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={eyebrowStyle}>Try a role</span>
          <div style={{ display: "flex", gap: 8 }}>
            {(Object.keys(ROLES) as RoleKey[]).map((k) => {
              const active = k === role;
              return (
                <button key={k} type="button" onClick={() => pickRole(k)} style={{ ...resetBtn, flex: 1, textAlign: "center", padding: "11px 8px", borderRadius: 12, fontSize: 14, fontWeight: 600, border: `1px solid ${active ? BRAND : "rgba(26,21,53,0.10)"}`, background: active ? BRAND : "#fff", color: active ? "#fff" : "rgba(26,21,53,0.6)" }}>
                  {ROLES[k].name}
                </button>
              );
            })}
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "rgba(26,21,53,0.58)" }}>
            One app, three roles. It reshapes around whoever is holding it — and it does the admin before you ask.
          </p>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <span style={eyebrowStyle}>What makes it new</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { t: "An agent that drafts, not nags", d: "Late invoices, cover for a sick teacher, a note home — written and waiting. You approve in one tap." },
              { t: "The moon is the status", d: "The brand mark eclipses as the day completes. One glance from the doorway tells you where the studio is." },
              { t: "A scrubbable day", d: "Drag backwards to replay what happened in every room; drag forward and it predicts the rest of the evening." },
              { t: "Offline-first, on-device", d: "Registers taken in a basement studio with no signal. Nothing about a child leaves the building to be understood." },
            ].map((c) => (
              <div key={c.t} className="dcl-why-card" style={{ background: "#fff", border: "1px solid rgba(26,21,53,0.08)", borderRadius: 16, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 5, transition: "transform 0.35s cubic-bezier(.16,1,.3,1)" }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: NAVY }}>{c.t}</span>
                <span style={{ fontSize: 13.5, lineHeight: 1.55, color: "rgba(26,21,53,0.58)" }}>{c.d}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
