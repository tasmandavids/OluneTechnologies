"use client";

// ============================================================================
//  components/marketing/landing/CardPageClient.tsx — The check-in card.
//  Marketing page for the NFC membership card: hero, the live draggable card
//  with its tier detail, the five-tier ladder, the three-step tap, and what
//  it saves the studio at the door.
//
//  The card is a design preview — <CheckinCard /> is fully interactive but
//  the members and taps are illustrative, like the Mobile page's prototype.
//
//  Tier selection is owned here: the stage, the ladder and the tap flow all
//  read the same active tier, so picking Gold anywhere moves all three.
//
//  Design-exact chrome (shared with the landing, FAQ, Team and Mobile pages).
//  English-only for now, like FAQ and Team.
// ============================================================================

import { useState, type CSSProperties } from "react";
import { landingFontVars } from "@/components/marketing/landing/fonts";
import { DevBanner, LandingNav, LandingFooter, Eyebrow, PrimaryButton, DISPLAY, BODY } from "@/components/marketing/landing/chrome";
import { CheckinCardStage, TierDetail, TierLadder, TierRewards, TapFlow, TIERS, REWARD_KINDS } from "@/components/marketing/landing/CheckinCard";

const ACCENT = "#8b7cf0";
const NAVY = "#1a1535";

const sectionStyle: CSSProperties = { position: "relative", overflow: "hidden", padding: "116px 48px", borderRadius: "48px 48px 0 0", marginTop: -48 };
const h2Style: CSSProperties = { fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(28px, 3.4vw, 44px)", lineHeight: 1.1, letterSpacing: "-0.015em", color: NAVY, margin: 0 };
const leadStyle: CSSProperties = { fontSize: 17, lineHeight: 1.7, color: "rgba(26,21,53,0.6)", margin: "18px 0 0" };

/** What the card removes from the door. */
const DOOR = [
  {
    t: "No clipboard, no queue",
    d: "The register fills itself as families arrive. Nobody stands at a desk reading names off a list while a hallway of dancers waits behind them.",
    stat: "1 tap",
    statLabel: "instead of a sign-in sheet",
  },
  {
    t: "Arrival and departure, both logged",
    d: "A tap on the way in and a tap on the way out. Pickup time is recorded, not remembered — and it auto-checks-out fifteen minutes after class if someone forgets.",
    stat: "In & out",
    statLabel: "timestamped without anyone typing",
  },
  {
    t: "Parents know before they ask",
    d: "The moment the card reads, the notice goes to whoever is on pickup. No “are you there yet” texts from the car park.",
    stat: "0 s",
    statLabel: "between the tap and the notification",
  },
  {
    t: "It is worth keeping",
    d: "The card changes material as the years add up — bronze on the day they enrol, diamond at ten. Loyalty stops being a spreadsheet and becomes something a family carries.",
    stat: "5 tiers",
    statLabel: "earned, never bought",
  },
] as const;

/** Where the card fits alongside the rest of Olune. */
const COMPARE = [
  { moment: "Family arrives for class", card: "Tap — logged, parents notified", without: "Teacher marks a paper roll" },
  { moment: "Pickup at the door", card: "Tap out, time recorded", without: "Nobody is sure when they left" },
  { moment: "End-of-term attendance report", card: "Already complete", without: "Retyped from the rolls" },
  { moment: "Ten years with the studio", card: "A diamond card, issued by the director", without: "A thank-you in the newsletter" },
] as const;

export function CardPageClient() {
  const [i, setI] = useState(0);
  const active = TIERS[i];

  return (
    <div id="olune-landing-root" className={landingFontVars} style={{ fontFamily: BODY, background: "#f7f6fb", color: NAVY, overflowX: "hidden", width: "100%", position: "relative" }}>
      <DevBanner />
      <LandingNav />

      {/* HERO */}
      <section className="dcl-section" style={{ position: "relative", background: "linear-gradient(180deg, #efeafb 0%, #f7f6fb 60%)", padding: "170px 48px 80px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ maxWidth: 800, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Eyebrow center>Membership · NFC check-in</Eyebrow></div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(40px, 6vw, 82px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: NAVY, margin: "14px 0 0" }}>
            The check-in card, <span style={{ fontStyle: "italic", color: ACCENT }}>earned.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.65, color: "rgba(26,21,53,0.6)", maxWidth: 620, margin: "24px auto 0" }}>
            One tap at the door. Arrival and departure logged, parents notified, attendance done — no clipboard, no queue. And the card changes material as the years with the studio add up.
          </p>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "rgba(26,21,53,0.45)", maxWidth: 560, margin: "18px auto 0" }}>
            A working preview of the design. Drag the card to spin it, flip it, and switch tiers — the members and taps are illustrative.
          </p>
        </div>
      </section>

      {/* THE CARD */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#f7f6fb", padding: "96px 48px", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div className="dcl-cc-split" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(320px,0.85fr)", gap: 28, alignItems: "stretch" }}>
            <CheckinCardStage tier={active} index={i} onSelect={setI} />
            <TierDetail tier={active} />
          </div>
        </div>
      </section>

      {/* THE LADDER */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#efeafb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 40 }}>
            <div style={{ maxWidth: 620 }}>
              <Eyebrow>Five materials</Eyebrow>
              <h2 style={{ ...h2Style, marginTop: 14 }}>The ladder.</h2>
            </div>
            <span style={{ fontSize: 15, color: "rgba(26,21,53,0.6)", maxWidth: 380 }}>
              Years counted from a member&rsquo;s first enrolled term. Cards reissue automatically. What a tier is worth is set by the studio, not by Olune.
            </span>
          </div>
          <TierLadder index={i} onSelect={setI} />
        </div>
      </section>

      {/* WHAT A TIER IS WORTH */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#f7f6fb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div className="dcl-cc-rewards" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(340px,0.82fr)", gap: 40, alignItems: "stretch" }}>
            <div>
              <Eyebrow>Your rewards, your rules, your cost</Eyebrow>
              <h2 style={{ ...h2Style, marginTop: 14 }}>Olune counts the years. You decide what they&rsquo;re worth.</h2>
              <p style={leadStyle}>
                Bronze on day one is the same material in every studio &mdash; what it unlocks is not. Olune sets no rewards and funds none: you hang a discount, a credit, a comped class or a booking window off any tier, in whatever combination suits your fees, and change it whenever you like.
              </p>

              <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12 }} className="dcl-grid-reward-kinds">
                {REWARD_KINDS.map((k) => (
                  <div key={k.key} style={{ background: "#ffffff", border: "1px solid rgba(26,21,53,0.08)", borderRadius: 18, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: ACCENT }}>{k.name}</span>
                    <span style={{ fontSize: 14.5, lineHeight: 1.5, color: "rgba(26,21,53,0.6)" }}>{k.what}</span>
                  </div>
                ))}
              </div>

              <p style={{ margin: "26px 0 0", fontSize: 14, lineHeight: 1.7, color: "rgba(26,21,53,0.45)" }}>
                Set once per tier and it applies to every family who reaches it &mdash; no vouchers to hand out, no list of who is owed what. Pick a tier above for ideas to start from. The ladder is Olune&rsquo;s; every reward on it is your studio&rsquo;s to set, price and honour.
              </p>
            </div>

            <TierRewards tier={active} />
          </div>
        </div>
      </section>

      {/* THE TAP */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#efeafb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 1180, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 20, flexWrap: "wrap", marginBottom: 48 }}>
            <div style={{ maxWidth: 620 }}>
              <Eyebrow>At the door</Eyebrow>
              <h2 style={{ ...h2Style, marginTop: 14 }}>The tap.</h2>
            </div>
            <span style={{ fontSize: 15, color: "rgba(26,21,53,0.6)", maxWidth: 380 }}>
              Three seconds at the door — phone out, phone away.
            </span>
          </div>
          <TapFlow tier={active} />
        </div>
      </section>

      {/* WHY */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#f7f6fb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ maxWidth: 660 }}>
            <Eyebrow>Why a card at all</Eyebrow>
            <h2 style={{ ...h2Style, marginTop: 14 }}>The doorway is where studios lose time.</h2>
            <p style={leadStyle}>
              Five minutes of every class goes on the roll, and the roll is wrong by the end of term. The card moves that work to the moment a family walks in — and turns the years they have stayed into something they can hold.
            </p>
          </div>

          <div className="dcl-grid-bento" style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
            {DOOR.map((b) => (
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

      {/* WITH AND WITHOUT */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#efeafb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ maxWidth: 620 }}>
            <Eyebrow>Same evening, two studios</Eyebrow>
            <h2 style={{ ...h2Style, marginTop: 14 }}>What the tap replaces.</h2>
            <p style={leadStyle}>
              The card doesn&rsquo;t add a system — it removes one. Attendance, pickup times and loyalty all come out of the same three-second gesture at the door.
            </p>
          </div>

          <div style={{ marginTop: 48, background: "#ffffff", border: "1px solid rgba(26,21,53,0.08)", borderRadius: 26, overflow: "hidden" }}>
            <div className="dcl-compare-row-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 16, padding: "18px 28px", borderBottom: "1px solid rgba(26,21,53,0.08)", fontSize: 12.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,21,53,0.45)" }}>
              <span>The moment</span><span>With the card</span><span>Without it</span>
            </div>
            {COMPARE.map((row) => (
              <div key={row.moment} className="dcl-compare-row dcl-compare-row-grid" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 16, padding: "20px 28px", borderBottom: "1px solid rgba(26,21,53,0.06)", fontSize: 15.5, color: "rgba(26,21,53,0.62)", transition: "background 0.3s ease, transform 0.3s ease" }}>
                <span style={{ fontWeight: 600, color: NAVY }}>{row.moment}</span>
                <span style={{ color: ACCENT, fontWeight: 600 }}>{row.card}</span>
                <span>{row.without}</span>
              </div>
            ))}
          </div>

          <p style={{ margin: "28px 0 0", fontSize: 14, lineHeight: 1.7, color: "rgba(26,21,53,0.45)" }}>
            The check-in card is in design — this page is the working guide it is being built against. It rides on the same membership records Olune already keeps, so the ladder starts counting from the first term you enrol, not from the day it ships.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#f7f6fb", padding: "116px 48px 140px", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 640, margin: "0 auto", textAlign: "center", position: "relative", zIndex: 2 }}>
          <h2 style={h2Style}>Start counting the years now.</h2>
          <p style={{ fontSize: 16, lineHeight: 1.65, color: "rgba(26,21,53,0.56)", maxWidth: 520, margin: "16px auto 0" }}>
            Everything is free to use until general release in December — set your studio up now and the ladder starts from the terms you already have on file.
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
