"use client";

// ============================================================================
//  components/marketing/aurora/MobilePage.tsx — port of "Olune Mobile.dc.html".
//  An interactive phone that reshapes per role (owner / teacher / parent),
//  then the case for a phone app. Illustrative data, as the page says.
// ============================================================================

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AuroraPage } from "./chrome";
import { GlassPanel, HeroEyebrow, OluneMark, h2Style, microLabel, useReveal } from "./primitives";
import { CompareTable, StatGrid } from "./sections";

const EASE = "cubic-bezier(.16,1,.3,1)";
const SPRING = "cubic-bezier(.32,.72,0,1)";
type Role = "owner" | "teacher" | "parent";

const KIDS = ["Ana Okafor", "Mia Chen", "Ruby Tane", "Isla Patel", "Leo Brown", "Aria Ngata", "Zoe Walker", "Maya Reid"];
const ROLE_NOTES: Record<Role, string> = {
  owner: "Owners get the night at a glance, with the admin already drafted.",
  teacher: "Teachers get tonight’s register — tap names as they arrive. Works with no signal.",
  parent: "Parents see their child arrive, pay fees and hear from the teacher.",
};

const NEWS = [
  ["01", "An agent that drafts, not nags", "Late invoices, cover for a sick teacher, a note home — written and waiting. You approve in one tap."],
  ["02", "The moon is the status", "The mark eclipses as the day completes. One glance from the doorway tells you where the studio is."],
  ["03", "A scrubbable day", "Drag back to replay every room; drag forward and it predicts the rest of the evening."],
  ["04", "Offline-first, on-device", "Registers taken in a basement with no signal. Nothing about a child leaves the building."],
] as const;

const STATS = [
  ["4", "taps", "It has already done the admin", "Reminders, cover requests and notes home are drafted before you open the app."],
  ["0", "bars needed", "The register works with no signal", "Attendance is taken on the device and syncs the moment a bar comes back."],
  ["1", "screen", "One glance tells you the night", "The ring fills as classes finish. You know where the studio is without unlocking."],
  ["0", "data off device", "Ask it anything, out loud", "“Who hasn’t paid for term 3?” Answered from your own data, on the device."],
] as const;

const SHAPES = [
  { who: "Owners", title: "Your evenings back.", items: ["Cash in, fees owing and attendance on the home screen", "Late invoices chased in your voice", "Cover matched by syllabus and grade", "Close the day in one tap"], hot: false },
  { who: "Teachers", title: "Teach, don’t type.", items: ["Tonight’s register open before the door", "Tap names as they arrive — saves offline", "Progress notes drafted from your comments", "Nothing goes home until you’ve read it"], hot: true },
  { who: "Parents", title: "Quiet reassurance.", items: ["See your child checked in and out, live", "Term fees, plans and receipts in one place", "Costume sizing without a paper slip", "Notes from the teacher, straight to you"], hot: false },
];

const COMPARE = [
  ["At the studio door", "Register, tapped in seconds", "Not where you are"],
  ["Between two classes", "Approve the night’s drafts", "Needs a desk"],
  ["Term-end invoicing", "Approve and send", "Full ledger and exports"],
  ["Building the timetable", "Read and adjust", "Where the heavy lifting lives"],
] as const;

const phoneGlass: CSSProperties = { borderRadius: 20, padding: 14, background: "linear-gradient(148deg,var(--refract),transparent 42%),var(--glass)", border: "1px solid var(--edge)", boxShadow: "inset 0 1px 0 var(--sheen)" };
const phoneCard: CSSProperties = { borderRadius: 16, padding: 12, background: "var(--surface)", border: "1px solid var(--hair)" };
const tiny: CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--muted)" };
const bigLine: CSSProperties = { fontFamily: "var(--font-display)", fontSize: 27, fontWeight: 600, letterSpacing: "-.045em", lineHeight: 1.05 };

function ActionButton({ done, label, doneLabel, onClick }: { done: boolean; label: string; doneLabel: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ all: "unset", cursor: "pointer", padding: "8px 13px", borderRadius: 11, fontSize: 12, fontWeight: 600, background: done ? "var(--t3)" : "var(--ink)", color: done ? "var(--ink)" : "var(--base)", transition: "background .3s" }}>
      {done ? doneLabel : label}
    </button>
  );
}

export default function MobilePage() {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [role, setRole] = useState<Role>("owner");
  const [fees, setFees] = useState(false);
  const [kit, setKit] = useState(false);
  const [paid, setPaid] = useState(false);
  const [present, setPresent] = useState<Record<number, boolean>>({ 0: true, 1: true, 3: true, 4: true, 6: true });
  useReveal(rootRef);

  // The phone tilts toward the pointer.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onMove = (e: PointerEvent) => {
      root.style.setProperty("--mx", ((e.clientX / window.innerWidth - 0.5) * 2).toFixed(3));
      root.style.setProperty("--my", ((e.clientY / window.innerHeight - 0.5) * 2).toFixed(3));
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, []);

  const presentCount = Object.values(present).filter(Boolean).length;

  return (
    <AuroraPage active="mobile" rootRef={rootRef} footer={{ title: "Start on the web.", accent: "The phone is coming to you.", body: "Everything is free to use until general release in December — set your studio up now and Olune Mobile lands on top of the data you already have." }}>
      <section style={{ position: "relative", zIndex: 1, padding: "clamp(130px,17vh,180px) 24px clamp(60px,10vh,120px)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180, display: "flex", flexWrap: "wrap", alignItems: "center", gap: "clamp(40px,6vw,96px)" }}>
          <div style={{ flex: "1 1 380px", minWidth: 0 }}>
            <HeroEyebrow>Olune Mobile · in design</HeroEyebrow>
            <h1 style={{ margin: "28px 0 0", fontFamily: "var(--font-display)", fontWeight: 600, fontSize: "clamp(46px,6.4vw,96px)", lineHeight: 1.02, letterSpacing: "-.055em", animation: `olune-lift 1s .1s ${EASE} backwards` }}>
              The studio in your pocket, <span style={{ color: "var(--iris)" }}>already thinking.</span>
            </h1>
            <p style={{ margin: "24px 0 0", maxWidth: 480, fontSize: "clamp(17px,1.4vw,19px)", lineHeight: 1.6, color: "var(--muted)", textWrap: "pretty", animation: `olune-rise .9s .3s ${EASE} both` }}>
              One app, three roles. It reshapes around whoever is holding it — and does the admin before you ask.
            </p>
            <div style={{ marginTop: 34, animation: `olune-rise .9s .42s ${EASE} both` }}>
              <div style={{ ...microLabel, letterSpacing: ".16em", marginBottom: 12 }}>Try a role</div>
              <div role="tablist" aria-label="Role" style={{ display: "inline-flex", gap: 4, padding: 5, borderRadius: 999, background: "var(--glass)", border: "1px solid var(--edge)", boxShadow: "inset 0 1px 0 var(--sheen),var(--shadow-s)", backdropFilter: "blur(var(--blur)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur)) saturate(1.9)" }}>
                {(["owner", "teacher", "parent"] as Role[]).map((k) => (
                  <button key={k} type="button" role="tab" aria-selected={role === k} onClick={() => setRole(k)} style={{ all: "unset", cursor: "pointer", padding: "10px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600, textTransform: "capitalize", color: role === k ? "var(--ink)" : "var(--muted)", background: role === k ? "var(--surface)" : "transparent", boxShadow: role === k ? "var(--shadow-s)" : "none", transition: `background .3s ${SPRING},color .3s` }}>
                    {k}
                  </button>
                ))}
              </div>
              <p aria-live="polite" style={{ margin: "16px 0 0", fontSize: 14, color: "var(--muted)", maxWidth: 420 }}>{ROLE_NOTES[role]}</p>
            </div>
          </div>

          {/* phone */}
          <div style={{ flex: "0 1 380px", display: "flex", justifyContent: "center", perspective: 1600, animation: `olune-lift 1.2s .4s ${EASE} backwards` }}>
            <div style={{ position: "relative", transform: "rotateY(calc(var(--mx,0) * -8deg)) rotateX(calc(var(--my,0) * 6deg))", transition: "transform .2s ease-out" }}>
              <div aria-hidden style={{ position: "absolute", inset: "-18%", borderRadius: "50%", background: "radial-gradient(circle,var(--tg),transparent 62%)", opacity: 0.7 }} />
              <div style={{ position: "relative", width: "min(340px,86vw)", height: 700, borderRadius: 56, padding: 11, boxSizing: "border-box", background: "linear-gradient(150deg,#2a2840,#0c0b14 40%,#1b1a2a)", boxShadow: "0 50px 100px -40px rgba(27,26,56,.6),inset 0 0 0 1.5px rgba(255,255,255,.12)" }}>
                <div style={{ position: "relative", width: "100%", height: "100%", borderRadius: 46, overflow: "hidden", background: "radial-gradient(120% 60% at 100% 0%,var(--t3),transparent 60%),radial-gradient(90% 50% at 0% 100%,rgba(155,215,200,.25),transparent 60%),var(--base)" }}>
                  <div aria-hidden style={{ position: "absolute", top: 11, left: "50%", transform: "translateX(-50%)", width: 104, height: 30, borderRadius: 20, background: "#0a0a10", zIndex: 3 }} />
                  <div aria-hidden style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "17px 28px 0", fontSize: 13, fontWeight: 600, fontFamily: "var(--font-display)" }}>
                    <span>9:41</span>
                    <span style={{ width: 16, height: 9, borderRadius: 2, border: "1.2px solid currentColor", opacity: 0.8 }} />
                  </div>
                  <div style={{ padding: "26px 18px 18px", height: "calc(100% - 40px)", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 10, overflow: "hidden" }}>
                    {role === "owner" && (
                      <div key="owner" style={{ display: "flex", flexDirection: "column", gap: 10, animation: `olune-rise .5s ${EASE} both` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div><div style={tiny}>Studio admin</div><div style={{ fontSize: 14, fontWeight: 600 }}>Northbrook Dance</div></div>
                          <OluneMark variant="crescent" word={false} markSize="30px" />
                        </div>
                        <div style={{ ...bigLine, marginTop: 4 }}>Three classes left tonight.</div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: -4 }}>Everything else is already handled.</div>
                        <div style={{ ...tiny, marginTop: 6 }}>Needs you · drafted on device</div>
                        <div style={phoneGlass}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Three families are late on term 3</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>$312 outstanding. A warm reminder is written for each, in your voice.</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                            <ActionButton done={fees} label="Send all three" doneLabel="Sent ✓" onClick={() => setFees(true)} />
                            <span style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Not now</span>
                          </div>
                        </div>
                        <div style={phoneGlass}>
                          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Mara is out Thursday</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 3, lineHeight: 1.45 }}>Kit is free, teaches the same syllabus and has covered Grade 3 twice.</div>
                          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                            <ActionButton done={kit} label="Ask Kit to cover" doneLabel="Kit asked ✓" onClick={() => setKit(true)} />
                            <span style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: "var(--muted)" }}>Not now</span>
                          </div>
                        </div>
                        <div style={{ ...phoneCard, display: "flex", alignItems: "center", gap: 10, borderRadius: 18, padding: "12px 14px" }}>
                          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--iris)", animation: "olune-breathe 2.4s ease-in-out infinite" }} />
                          <div style={{ flex: 1 }}><div style={{ fontSize: 12.5, fontWeight: 600 }}>Grade 3 ballet · Studio A</div><div style={{ fontSize: 11, color: "var(--muted)" }}>Started 6 min ago · Mara</div></div>
                          <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>12/16</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div style={phoneCard}><div style={{ fontSize: 10, color: "var(--muted)" }}>In today</div><div style={{ fontSize: 19, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>$1,240</div></div>
                          <div style={phoneCard}><div style={{ fontSize: 10, color: "var(--muted)" }}>Attendance</div><div style={{ fontSize: 19, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>92%</div></div>
                        </div>
                      </div>
                    )}

                    {role === "teacher" && (
                      <div key="teacher" style={{ display: "flex", flexDirection: "column", gap: 10, animation: `olune-rise .5s ${EASE} both` }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div><div style={tiny}>Teacher · Mara</div><div style={{ fontSize: 14, fontWeight: 600 }}>Tonight’s register</div></div>
                          <span style={{ fontSize: 10.5, fontWeight: 600, padding: "4px 9px", borderRadius: 999, background: "var(--t2)", border: "1px solid var(--tb)" }}>Saved on device</span>
                        </div>
                        <div style={{ ...bigLine, marginTop: 4 }}>Grade 3 ballet</div>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "var(--muted)", marginTop: -4 }}>
                          <span>Studio A · 5:30 pm</span>
                          <b style={{ color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{presentCount}/8 in</b>
                        </div>
                        <div style={{ height: 5, borderRadius: 5, background: "var(--hair)", overflow: "hidden" }}>
                          <div style={{ height: "100%", background: "var(--iris)", borderRadius: 5, width: `${(presentCount / 8) * 100}%`, transition: `width .4s ${SPRING}` }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                          {KIDS.map((name, i) => {
                            const on = !!present[i];
                            return (
                              <button key={name} type="button" aria-pressed={on} onClick={() => setPresent((s) => ({ ...s, [i]: !s[i] }))} style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 14, background: on ? "var(--t1)" : "var(--surface)", border: `1px solid ${on ? "var(--tb)" : "var(--hair)"}`, transition: "background .25s,border-color .25s" }}>
                                <span style={{ width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, background: "var(--t2)" }}>{name.split(" ").map((x) => x[0]).join("")}</span>
                                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{name}</span>
                                <span style={{ width: 22, height: 22, borderRadius: "50%", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: "#fff", background: on ? "var(--iris)" : "var(--hair)", transition: "background .25s" }}>{on ? "✓" : ""}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {role === "parent" && (
                      <div key="parent" style={{ display: "flex", flexDirection: "column", gap: 10, animation: `olune-rise .5s ${EASE} both` }}>
                        <div><div style={tiny}>Parent · The Okafor family</div><div style={{ fontSize: 14, fontWeight: 600 }}>Northbrook Dance</div></div>
                        <div style={{ borderRadius: 24, padding: 18, marginTop: 4, background: "radial-gradient(120% 120% at 100% 0%,var(--t3),transparent 60%),var(--surface)", border: "1px solid var(--hair)" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11.5, fontWeight: 600, color: "var(--success)" }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--success)", animation: "olune-breathe 2.4s ease-in-out infinite" }} />Checked in · 5:58 pm
                          </div>
                          <div style={{ ...bigLine, marginTop: 10 }}>Ana is in class.</div>
                          <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>Senior contemporary · Studio 2 · with Marta</div>
                          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--hair)" }}>Pickup notice goes to Dad at 7:00 pm</div>
                        </div>
                        <div style={{ ...phoneGlass, display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10, color: "var(--muted)" }}>Term 3 fees</div>
                            <div style={{ fontSize: 20, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>$240.00</div>
                            <div style={{ fontSize: 11, color: "var(--muted)" }}>{paid ? "Receipt sent to your email" : "Due 14 October · or split in 3"}</div>
                          </div>
                          <ActionButton done={paid} label="Pay now" doneLabel="Paid ✓" onClick={() => setPaid(true)} />
                        </div>
                        <div style={{ ...phoneCard, borderRadius: 18, padding: 14 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)" }}><span>Note from Marta</span><span>Yesterday</span></div>
                          <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 6 }}>Ana nailed the floor sequence tonight — she’s ready for the recital solo.</div>
                        </div>
                        <div style={{ ...phoneCard, borderRadius: 18, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5 }}>
                          <span><b style={{ fontWeight: 600 }}>Costume sizing</b> · due Fri</span>
                          <span style={{ fontWeight: 600, color: "var(--iris)" }}>Open →</span>
                        </div>
                      </div>
                    )}

                    <div style={{ flex: 1 }} />
                    <div aria-hidden style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderRadius: 999, background: "var(--glass)", border: "1px solid var(--edge)", backdropFilter: "blur(var(--blur)) saturate(1.9)", WebkitBackdropFilter: "blur(var(--blur)) saturate(1.9)", fontSize: 12.5, color: "var(--muted)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                      <span style={{ flex: 1 }}>Ask Olune anything</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600 }}>Hold</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "clamp(40px,8vh,90px) 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180 }}>
          <h2 data-reveal="0" style={{ ...microLabel, margin: 0 }}>What makes it new</h2>
          <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,260px),1fr))", gap: 14 }}>
            {NEWS.map(([n, title, body], i) => (
              <div key={n} data-reveal={String(i * 80)} className="ol-lift">
                <GlassPanel radius={24} padding={24} style={{ height: "100%" }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600, color: "var(--iris)" }}>{n}</div>
                  <h3 style={{ margin: "36px 0 0", fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, letterSpacing: "-.035em", lineHeight: 1.15 }}>{title}</h3>
                  <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--muted)", marginTop: 8, textWrap: "pretty" }}>{body}</div>
                </GlassPanel>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "clamp(80px,12vh,140px) 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180 }}>
          <h2 data-reveal="0" style={{ ...h2Style, maxWidth: "14ch" }}>Studio work doesn’t happen <span style={{ color: "var(--iris)" }}>at a desk.</span></h2>
          <p data-reveal="80" style={{ margin: "20px 0 0", maxWidth: 620, fontSize: 17, lineHeight: 1.65, color: "var(--muted)", textWrap: "pretty" }}>
            It happens in a doorway with a bag over one shoulder, in the ten minutes between two classes, in a car outside the hall. The phone app is the part of Olune that comes with you.
          </p>
          <StatGrid stats={STATS} />
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "clamp(40px,8vh,90px) 24px", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1180 }}>
          <h2 data-reveal="0" style={h2Style}>One app, <span style={{ color: "var(--iris)" }}>three shapes.</span></h2>
          <p data-reveal="80" style={{ margin: "20px 0 0", maxWidth: 560, fontSize: 17, lineHeight: 1.65, color: "var(--muted)", textWrap: "pretty" }}>Nobody downloads a second app. The account decides what the install becomes.</p>
          <div style={{ marginTop: 44, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 16 }}>
            {SHAPES.map((s, i) => (
              <div key={s.who} data-reveal={String(i * 90)}>
                <GlassPanel level={s.hot ? "raised" : "panel"} glow={s.hot} radius={28} padding={28} style={{ height: "100%" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--muted)" }}>{s.who}</div>
                  <h3 style={{ margin: "12px 0 0", fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 600, letterSpacing: "-.045em" }}>{s.title}</h3>
                  <ul style={{ margin: "22px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column" }}>
                    {s.items.map((it) => (
                      <li key={it} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: "1px solid var(--hair)", fontSize: 14.5, lineHeight: 1.5 }}>
                        <span aria-hidden style={{ color: "var(--iris)", flex: "none" }}>→</span>
                        <span>{it}</span>
                      </li>
                    ))}
                  </ul>
                </GlassPanel>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ position: "relative", zIndex: 1, padding: "clamp(80px,12vh,140px) 24px clamp(100px,14vh,160px)", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 1000 }}>
          <h2 data-reveal="0" style={{ ...h2Style, textAlign: "center" }}>Same studio, <span style={{ color: "var(--iris)" }}>two hands.</span></h2>
          <p data-reveal="80" style={{ margin: "20px auto 0", maxWidth: 560, textAlign: "center", fontSize: 17, lineHeight: 1.65, color: "var(--muted)", textWrap: "pretty" }}>
            One live database. An approval on the way to the car is already on the laptop when you get home.
          </p>
          <CompareTable heads={["The moment", "On the phone", "On the web"]} rows={COMPARE} />
          <p data-reveal="0" style={{ margin: "28px auto 0", maxWidth: 640, textAlign: "center", fontSize: 13.5, lineHeight: 1.65, color: "var(--muted)", textWrap: "pretty" }}>
            Olune Mobile is in design — the preview above is the real interaction model, running on illustrative data. Studios on Olune get it as part of their plan when it ships.
          </p>
        </div>
      </section>
    </AuroraPage>
  );
}
