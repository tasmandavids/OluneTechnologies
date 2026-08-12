"use client";

// ============================================================================
//  components/marketing/landing/TeamPageClient.tsx — Team story.
//  Design-exact (Claude Design Studio team.html export). English-only for now.
//
//  Split out of app/team/page.tsx so that file can stay a Server Component and
//  export generateMetadata + Organization JSON-LD — client components can't.
// ============================================================================

import { landingFontVars } from "@/components/marketing/landing/fonts";
import { DevBanner, LandingNav, LandingFooter, Eyebrow, PrimaryButton, DISPLAY, BODY } from "@/components/marketing/landing/chrome";

const ACCENT = "#8b7cf0";
const NAVY = "#1a1535";

const PRINCIPLES = [
  { t: "Studio-run", d: "Built by people who've actually run a studio term." },
  { t: "Calm by design", d: "Every screen made to open, not dread." },
  { t: "All in one", d: "Projects, money and sites, together." },
] as const;

export function TeamPageClient() {
  return (
    <div id="olune-landing-root" className={landingFontVars} style={{ fontFamily: BODY, background: "#f7f6fb", color: NAVY, overflowX: "hidden", width: "100%", position: "relative" }}>
      <DevBanner />
      <LandingNav />

      {/* HERO */}
      <section className="dcl-section" style={{ position: "relative", background: "linear-gradient(180deg, #efeafb 0%, #f7f6fb 60%)", padding: "170px 48px 70px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Eyebrow center>Meet the team</Eyebrow></div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(38px, 5.6vw, 72px)", lineHeight: 1.08, letterSpacing: "-0.02em", color: NAVY, margin: "14px 0 0" }}>
            The team behind <span style={{ fontStyle: "italic", color: ACCENT }}>Olune.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(26,21,53,0.6)", maxWidth: 540, margin: "24px auto 0" }}>
            Olune isn&rsquo;t built by a boardroom. It&rsquo;s built hands-on, every day, by a small team who lived the problem it solves.
          </p>
        </div>
      </section>

      {/* BODY */}
      <section className="dcl-section" style={{ position: "relative", overflow: "hidden", background: "#f7f6fb", padding: "116px 48px", borderRadius: "48px 48px 0 0", marginTop: -48, boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div className="dcl-grid-about" style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "0.8fr 1.2fr", gap: 64, alignItems: "start", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 128, height: 128, borderRadius: "50%", background: "radial-gradient(circle at 35% 30%, #6b66c9, #1a1535)", boxShadow: `0 30px 60px -24px ${ACCENT}99`, animation: "bobY 7s ease-in-out infinite" }}>
              <span style={{ position: "relative", width: 52, height: 52, flexShrink: 0 }}>
                <span style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: ACCENT }} />
                <span style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: "#ffffff" }} />
              </span>
            </span>
            <p style={{ marginTop: 24, fontFamily: DISPLAY, fontSize: 24, color: NAVY }}>Olune</p>
            <p style={{ marginTop: 4, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: ACCENT }}>Founding team</p>
            <p style={{ marginTop: 4, fontSize: 14, color: "rgba(26,21,53,0.56)" }}>New Zealand</p>
          </div>

          <div>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(28px, 3.2vw, 40px)", lineHeight: 1.1, letterSpacing: "-0.015em", color: NAVY, margin: "0 0 24px" }}>Why Olune exists</h2>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: "rgba(26,21,53,0.64)", margin: "0 0 20px" }}>Olune started with frustration. Running a studio meant living inside a patchwork — a class manager over here, an accounting app over there, a website builder somewhere else, and spreadsheets quietly holding the whole thing together.</p>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: "rgba(26,21,53,0.64)", margin: "0 0 20px" }}>The breaking point is familiar to anyone who&rsquo;s run a term: evenings lost to chasing fees, registers that never made it back to the office, and a website still showing last year&rsquo;s timetable because changing it meant waiting on someone else. Four subscriptions, none of them talking to each other — and the teaching getting buried under the admin.</p>
            <p style={{ fontSize: 17, lineHeight: 1.75, color: "rgba(26,21,53,0.64)", margin: "0 0 36px" }}>So we stopped duct-taping and started building. Olune is the result: one calm home for the classes, the families, the money and your studio website — built in New Zealand and shaped daily by the studios using it.</p>

            <div style={{ display: "flex", alignItems: "center", gap: 22, marginBottom: 40, padding: "28px 30px", background: "#ffffff", borderRadius: 16, boxShadow: "0 30px 70px -46px rgba(26,21,53,0.45)", border: "1px solid rgba(26,21,53,0.05)" }}>
              <span style={{ position: "relative", width: 44, height: 44, flexShrink: 0, filter: "drop-shadow(0 6px 16px rgba(139,124,240,0.5))" }}>
                <span style={{ position: "absolute", top: "16%", left: "17%", width: "76%", height: "76%", borderRadius: "50%", background: ACCENT }} />
                <span style={{ position: "absolute", top: "6%", left: "6%", width: "76%", height: "76%", borderRadius: "50%", background: NAVY }} />
              </span>
              <p style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: "clamp(20px, 2.2vw, 26px)", color: NAVY, margin: 0, lineHeight: 1.25 }}>&ldquo;We built Olune because the admin was eating the work we actually loved.&rdquo;</p>
            </div>

            <div className="dcl-grid-stats3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 28, paddingTop: 40, borderTop: "1px solid rgba(26,21,53,0.14)" }}>
              {PRINCIPLES.map((p) => (
                <div key={p.t}>
                  <div style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 20, color: ACCENT, marginBottom: 8 }}>{p.t}</div>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: "rgba(26,21,53,0.56)", margin: 0 }}>{p.d}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ maxWidth: 640, margin: "96px auto 0", textAlign: "center", position: "relative", zIndex: 2 }}>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(28px, 3.4vw, 42px)", lineHeight: 1.1, letterSpacing: "-0.015em", color: NAVY, margin: 0 }}>Follow the build.</h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(26,21,53,0.56)", maxWidth: 480, margin: "16px auto 0" }}>Olune ships in the open — try it free before general release in December and help shape where it goes next.</p>
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
