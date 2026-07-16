"use client";

// ============================================================================
//  components/marketing/landing/DataDeletionPageClient.tsx — Data Deletion
//  Instructions. Same chrome + prose treatment as the Privacy Policy page.
//
//  Split out of app/data-deletion/page.tsx so that file can stay a Server
//  Component and export generateMetadata — client components can't.
// ============================================================================

import { landingFontVars } from "@/components/marketing/landing/fonts";
import { DevBanner, LandingNav, LandingFooter, Eyebrow, DISPLAY, BODY } from "@/components/marketing/landing/chrome";
import { LegalSectionBlock } from "@/components/marketing/landing/legal-prose";
import {
  DATA_DELETION_SECTIONS,
  DATA_DELETION_LAST_UPDATED,
  DATA_DELETION_CONTACT_EMAIL,
  DATA_DELETION_ADDRESS,
} from "@/components/marketing/landing/data-deletion-data";

const NAVY = "#1a1535";

export function DataDeletionPageClient() {
  return (
    <div id="olune-landing-root" className={landingFontVars} style={{ fontFamily: BODY, background: "#f7f6fb", color: NAVY, overflowX: "hidden", width: "100%", position: "relative" }}>
      <DevBanner />
      <LandingNav />

      {/* HERO */}
      <section className="dcl-section" style={{ position: "relative", background: "linear-gradient(180deg, #efeafb 0%, #f7f6fb 60%)", padding: "170px 48px 70px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Eyebrow center>Legal</Eyebrow></div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(34px, 5vw, 60px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: NAVY, margin: "14px 0 0" }}>
            Data Deletion <span style={{ fontStyle: "italic", color: "#8b7cf0" }}>Instructions.</span>
          </h1>
          <p style={{ fontSize: 15, color: "rgba(26,21,53,0.5)", margin: "20px 0 0" }}>Last updated: {DATA_DELETION_LAST_UPDATED}</p>
        </div>
      </section>

      {/* BODY */}
      <section className="dcl-section" style={{ position: "relative", overflow: "hidden", background: "#f7f6fb", padding: "96px 48px 116px", borderRadius: "48px 48px 0 0", marginTop: -48, boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", position: "relative", zIndex: 2 }}>
          {DATA_DELETION_SECTIONS.map((section, i) => (
            <LegalSectionBlock key={i} section={section} />
          ))}

          <div style={{ marginTop: 56, paddingTop: 40, borderTop: "1px solid rgba(26,21,53,0.12)" }}>
            <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(22px, 2.4vw, 30px)", letterSpacing: "-0.01em", color: NAVY, margin: "0 0 16px" }}>
              Contact Us
            </h2>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "rgba(26,21,53,0.66)", margin: "0 0 18px" }}>
              To request deletion of your data, or if you have questions about this process, contact us at:
            </p>
            <p style={{ fontSize: 16, lineHeight: 1.75, color: "rgba(26,21,53,0.66)", margin: 0 }}>
              Olune Limited
              <br />
              Email: <a href={`mailto:${DATA_DELETION_CONTACT_EMAIL}`} style={{ fontWeight: 600, color: NAVY, borderBottom: "1px solid #8b7cf080" }}>{DATA_DELETION_CONTACT_EMAIL}</a>
              <br />
              Address: {DATA_DELETION_ADDRESS}
            </p>
          </div>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
