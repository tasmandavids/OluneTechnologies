"use client";

// ============================================================================
//  components/marketing/landing/MobilePageClient.tsx — Olune Mobile.
//  Marketing page for the phone app: hero, live interactive prototype, the
//  benefits by role, and what the app does that the web app can't.
//
//  This is a visual guide ahead of the build — the prototype in
//  <OluneMobileApp /> is clickable but backed by fixtures, not real data.
//
//  Design-exact chrome (shared with the landing, FAQ and Team pages).
//  English-only for now, like FAQ and Team.
// ============================================================================

import type { CSSProperties } from "react";
import { landingFontVars } from "@/components/marketing/landing/fonts";
import { DevBanner, LandingNav, LandingFooter, Eyebrow, PrimaryButton, DISPLAY, BODY } from "@/components/marketing/landing/chrome";
import { OluneMobileApp } from "@/components/marketing/landing/OluneMobileApp";

const ACCENT = "#8b7cf0";
const NAVY = "#1a1535";

const sectionStyle: CSSProperties = { position: "relative", overflow: "hidden", padding: "116px 48px", borderRadius: "48px 48px 0 0", marginTop: -48 };
const h2Style: CSSProperties = { fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(28px, 3.4vw, 44px)", lineHeight: 1.1, letterSpacing: "-0.015em", color: NAVY, margin: 0 };
const leadStyle: CSSProperties = { fontSize: 17, lineHeight: 1.7, color: "rgba(26,21,53,0.6)", margin: "18px 0 0" };

/** The four things the phone does that a laptop never will. */
const BENEFITS = [
  {
    t: "It has already done the admin",
    d: "Olune drafts the reminder, the cover request and the note home before you open the app. You read one card and tap approve — the work is done, not queued.",
    stat: "4 taps",
    statLabel: "of admin in a full studio evening",
  },
  {
    t: "The register works with no signal",
    d: "Basement studios, church halls, school gyms. Attendance is taken on the device and syncs the moment a bar of signal comes back — nobody stands at the door waiting on a spinner.",
    stat: "0 bars",
    statLabel: "needed to take a register",
  },
  {
    t: "One glance tells you the whole night",
    d: "The moon mark eclipses as the day completes and the ring fills as classes finish. From the doorway, without unlocking anything, you know where the studio is.",
    stat: "1 screen",
    statLabel: "for every room, teacher and arrival",
  },
  {
    t: "Ask it anything, out loud",
    d: "“Who hasn't paid for term 3?” “Who's free to cover Thursday?” It reads your own studio data on the device and comes back with an answer and an action, not a search result.",
    stat: "On device",
    statLabel: "nothing about a child leaves the studio",
  },
] as const;

/** One app, three shapes. */
const ROLES = [
  {
    name: "Owners",
    line: "Your evenings back.",
    points: [
      "Cash in today, outstanding fees and attendance on the home screen",
      "Late invoices chased in your voice, with your approval",
      "Cover for a sick teacher matched by syllabus, grade and availability",
      "Close the day in one tap and nothing waits for you tomorrow",
    ],
  },
  {
    name: "Teachers",
    line: "Teach, don't type.",
    points: [
      "Tonight's register open before you reach the studio door",
      "Tap names as they arrive — it saves offline, permanently",
      "Progress notes drafted from your own eight weeks of comments",
      "Nothing goes to a family until you have read it",
    ],
  },
  {
    name: "Parents",
    line: "Quiet reassurance.",
    points: [
      "See your child checked in and out, live",
      "Term fees, payment plans and receipts in one place",
      "Costume sizing and event forms without a paper slip",
      "Notes from the teacher, straight to your phone",
    ],
  },
] as const;

/** Where the phone fits against the web app. */
const COMPARE = [
  { moment: "Standing at the studio door", phone: "Register, tapped in seconds", web: "Not where you are" },
  { moment: "Between two classes", phone: "Approve the night's drafts", web: "Needs a desk" },
  { moment: "Term-end invoicing run", phone: "Approve and send", web: "Full ledger and exports" },
  { moment: "Building the timetable", phone: "Read and adjust", web: "Where the heavy lifting lives" },
] as const;

export function MobilePageClient() {
  return (
    <div id="olune-landing-root" className={landingFontVars} style={{ fontFamily: BODY, background: "#f7f6fb", color: NAVY, overflowX: "hidden", width: "100%", position: "relative" }}>
      <DevBanner />
      <LandingNav />

      {/* HERO */}
      <section className="dcl-section" style={{ position: "relative", background: "linear-gradient(180deg, #efeafb 0%, #f7f6fb 60%)", padding: "170px 48px 80px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Eyebrow center>Olune Mobile</Eyebrow></div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(40px, 6vw, 82px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: NAVY, margin: "14px 0 0" }}>
            The studio in your pocket, <span style={{ fontStyle: "italic", color: ACCENT }}>already thinking.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.65, color: "rgba(26,21,53,0.6)", maxWidth: 600, margin: "24px auto 0" }}>
            One app, three roles. It reshapes around who is holding it — owner, teacher or parent — and it does the admin before you ask.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(26,21,53,0.45)", maxWidth: 560, margin: "18px auto 0" }}>
            A working preview of the design. Tap through it below — everything responds, the data is illustrative.
          </p>
        </div>
      </section>

      {/* LIVE PROTOTYPE */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#f7f6fb", padding: "96px 48px", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <OluneMobileApp />
        </div>
      </section>

      {/* BENEFITS */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#efeafb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ maxWidth: 660 }}>
            <Eyebrow>Why a phone app at all</Eyebrow>
            <h2 style={{ ...h2Style, marginTop: 14 }}>Studio work doesn&rsquo;t happen at a desk.</h2>
            <p style={leadStyle}>
              It happens in a doorway with a bag over one shoulder, in the ten minutes between two classes, in a car outside the hall. The phone app is built for those moments — not as a shrunken version of the web app, but as the part of Olune that comes with you.
            </p>
          </div>

          <div className="dcl-grid-bento" style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
            {BENEFITS.map((b) => (
              <div key={b.t} className="dcl-everyday-card" style={{ background: "#ffffff", border: "1px solid rgba(26,21,53,0.08)", borderRadius: 26, padding: "32px 32px 28px", display: "flex", flexDirection: "column", gap: 14, transition: "transform 0.4s cubic-bezier(.16,1,.3,1), box-shadow 0.4s ease, border-color 0.4s ease" }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: DISPLAY, fontSize: 32, letterSpacing: "-0.02em", color: ACCENT }}>{b.stat}</span>
                  <span style={{ fontSize: 12.5, color: "rgba(26,21,53,0.45)" }}>{b.statLabel}</span>
                </div>
                <h3 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-0.01em", color: NAVY }}>{b.t}</h3>
                <p style={{ margin: 0, fontSize: 15.5, lineHeight: 1.7, color: "rgba(26,21,53,0.6)" }}>{b.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ROLES */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#f7f6fb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ maxWidth: 640 }}>
            <Eyebrow>One app, three shapes</Eyebrow>
            <h2 style={{ ...h2Style, marginTop: 14 }}>It rearranges itself around you.</h2>
            <p style={leadStyle}>
              Nobody downloads a second app. The same install becomes an owner&rsquo;s console, a teacher&rsquo;s register or a parent&rsquo;s window into their child&rsquo;s week — decided by the account, not the download.
            </p>
          </div>

          <div className="dcl-grid-stats3" style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 36 }}>
            {ROLES.map((r, i) => (
              <div key={r.name} className="dcl-stat-cell" style={{ paddingLeft: i === 0 ? 0 : 32, borderLeft: i === 0 ? "none" : "1px solid rgba(26,21,53,0.1)" }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>{r.name}</p>
                <p style={{ margin: "12px 0 0", fontFamily: DISPLAY, fontSize: 27, lineHeight: 1.15, letterSpacing: "-0.015em", color: NAVY }}>{r.line}</p>
                <ul style={{ margin: "20px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
                  {r.points.map((p) => (
                    <li key={p} style={{ display: "flex", gap: 11, fontSize: 15, lineHeight: 1.6, color: "rgba(26,21,53,0.62)" }}>
                      <span aria-hidden style={{ flexShrink: 0, marginTop: 8, width: 5, height: 5, borderRadius: "50%", background: ACCENT }} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PHONE VS WEB */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#efeafb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ maxWidth: 620 }}>
            <Eyebrow>Phone and web, together</Eyebrow>
            <h2 style={{ ...h2Style, marginTop: 14 }}>Same studio, two hands.</h2>
            <p style={leadStyle}>
              The phone is for the moment; the web app is for the sit-down. They share one live database, so an approval on the way to the car is already reflected on the laptop when you get home.
            </p>
          </div>

          <div style={{ marginTop: 48, background: "#ffffff", border: "1px solid rgba(26,21,53,0.08)", borderRadius: 26, overflow: "hidden" }}>
            <div className="dcl-compare-row-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 16, padding: "18px 28px", borderBottom: "1px solid rgba(26,21,53,0.08)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,21,53,0.45)" }}>
              <span>The moment</span><span>On the phone</span><span>On the web</span>
            </div>
            {COMPARE.map((row) => (
              <div key={row.moment} className="dcl-compare-row dcl-compare-row-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 16, padding: "20px 28px", borderBottom: "1px solid rgba(26,21,53,0.06)", fontSize: 15.5, color: "rgba(26,21,53,0.62)", transition: "background 0.3s ease, transform 0.3s ease" }}>
                <span style={{ fontWeight: 600, color: NAVY }}>{row.moment}</span>
                <span style={{ color: ACCENT, fontWeight: 600 }}>{row.phone}</span>
                <span>{row.web}</span>
              </div>
            ))}
          </div>

          <p style={{ margin: "28px 0 0", fontSize: 14, lineHeight: 1.7, color: "rgba(26,21,53,0.45)" }}>
            Olune Mobile is in design — this page is the working guide the app is being built against. Everything you can tap above is the real interaction model, running on illustrative data. Studios on Olune today get it as part of their plan when it ships.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#f7f6fb", padding: "116px 48px 140px", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 2 }}>
          <h2 style={h2Style}>Start on the web. The phone is coming to you.</h2>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "rgba(26,21,53,0.56)", maxWidth: 500, margin: "16px auto 0" }}>
            Everything is free to use until general release in December — set your studio up now and Olune Mobile lands on top of the data you already have.
          </p>
          <div style={{ marginTop: 32 }}>
            <PrimaryButton href="/onboarding">Start free</PrimaryButton>
            <p style={{ margin: "16px 0 0", fontSize: 14, color: "rgba(26,21,53,0.48)" }}>No card needed. Set up in minutes.</p>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
