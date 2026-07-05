"use client";

// ============================================================================
//  components/marketing/landing/FaqPageClient.tsx — Olune platform FAQ.
//  Design-exact (Claude Design Studio faq.html export). Content English-only
//  for now; the rest of the marketing site is translated, this page isn't yet.
//
//  Split out of app/faq/page.tsx so that file can stay a Server Component and
//  export generateMetadata + FAQPage JSON-LD — client components can't.
// ============================================================================

import { useState, type CSSProperties } from "react";
import { landingFontVars } from "@/components/marketing/landing/fonts";
import { DevBanner, LandingNav, LandingFooter, Eyebrow, PrimaryButton, DISPLAY, BODY } from "@/components/marketing/landing/chrome";

const ACCENT = "#8b7cf0";
const NAVY = "#1a1535";

type FaqItem = { q: string; a: string };
type FaqCategory = { label: string; items: FaqItem[] };

export const CATEGORIES: FaqCategory[] = [
  {
    label: "What Olune does",
    items: [
      { q: "What is Olune?", a: "Olune is one home for running a creative studio or freelance business: projects and tasks, quotes, invoices, expenses and cash flow, plus live client websites — all behind one login. Instead of stitching four tools together, everything lives in one calm place and stays in sync automatically." },
      { q: "Who is Olune for?", a: "Freelancers, small studios and agencies who juggle client work, money and websites. If you run projects, send invoices and look after client sites, Olune was built for your week." },
      { q: "What does Olune replace?", a: "Typically a project-management tool, an accounting or invoicing app, a website builder, and the spreadsheets holding it all together. One subscription, one login, no copy-pasting data between apps." },
      { q: "Do my clients need an Olune account?", a: "No. Quotes and invoices arrive as simple links your clients can view, accept and pay. Their websites are just live websites — no logins or portals for them to learn." },
    ],
  },
  {
    label: "Pricing & plans",
    items: [
      { q: "How much does Olune cost?", a: "Plans start at $19/month for Solo, $49/month for Studio, and $99/month for Scale. For comparison, a separate PM tool, accounting app and website builder usually run $80–150/month combined." },
      { q: "Is there a free trial?", a: "Better — Olune is completely free to use as much as you like until general release in early August. After that, every plan starts with 14 days free and no card is needed to sign up." },
      { q: "Can I change plans or cancel?", a: "Anytime. Upgrade, downgrade or cancel from your settings in a couple of clicks — no lock-in contracts, no cancellation fees." },
      { q: "Are there setup fees or hidden costs?", a: "No. The plan price is the whole price. Hosting for your client sites is included, and updates ship free to every plan." },
    ],
  },
  {
    label: "Websites & connections",
    items: [
      { q: "How does live site building work?", a: "You build and edit client sites right inside Olune, and every change publishes the moment you make it — no staging environments, no deploys, no waiting on a developer for a copy change. Edit on a call and the client sees it refresh in real time." },
      { q: "Can I connect my own domain?", a: "Yes. Point your domain (or your client's) at Olune and the site goes live on it, SSL certificate included. Every site also gets an olune.co.nz address so you can share work before the domain is ready." },
      { q: "Is hosting included?", a: "Yes — fast, managed hosting is included on every plan for every site you build. Nothing extra to configure or pay for." },
      { q: "How do payments and accounting connect?", a: "Invoices can be paid online by card or bank transfer, and payments are matched off automatically so your cash flow view is always current. Come tax time, export everything as CSV for your accountant." },
      { q: "Can I get my data out?", a: "Always. Your projects, invoices, contacts and site content are yours — export them anytime, no questions asked." },
    ],
  },
];

function AccordionItem({ item, defaultOpen }: { item: FaqItem; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid rgba(26,21,53,0.09)" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "26px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left", fontFamily: BODY }}
      >
        <span style={{ fontSize: 18, fontWeight: 600, color: NAVY }}>{item.q}</span>
        <span aria-hidden style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: "50%", background: "rgba(26,21,53,0.06)", color: NAVY, fontSize: 20, transition: "transform 0.3s ease, background 0.3s ease", transform: open ? "rotate(45deg)" : "none" }}>+</span>
      </button>
      <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows 0.35s cubic-bezier(.16,1,.3,1)" }}>
        <div style={{ overflow: "hidden" }}>
          <p style={{ margin: 0, padding: "0 4px 26px", maxWidth: 720, fontSize: 15.5, lineHeight: 1.72, color: "rgba(26,21,53,0.62)" }}>{item.a}</p>
        </div>
      </div>
    </div>
  );
}

const sectionStyle: CSSProperties = { position: "relative", overflow: "hidden", padding: "116px 48px", borderRadius: "48px 48px 0 0", marginTop: -48 };

export function FaqPageClient() {
  let idx = 0;
  return (
    <div id="olune-landing-root" className={landingFontVars} style={{ fontFamily: BODY, background: "#f7f6fb", color: NAVY, overflowX: "hidden", width: "100%", position: "relative" }}>
      <DevBanner />
      <LandingNav />

      {/* HERO */}
      <section className="dcl-section" style={{ position: "relative", background: "linear-gradient(180deg, #efeafb 0%, #f7f6fb 60%)", padding: "170px 48px 90px", textAlign: "center", overflow: "hidden" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", position: "relative", zIndex: 2 }}>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}><Eyebrow center>FAQ</Eyebrow></div>
          <h1 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(40px, 6vw, 84px)", lineHeight: 1.05, letterSpacing: "-0.02em", color: NAVY, margin: "14px 0 0" }}>
            Questions, <span style={{ fontStyle: "italic", color: ACCENT }}>answered.</span>
          </h1>
          <p style={{ fontSize: 18, lineHeight: 1.6, color: "rgba(26,21,53,0.6)", maxWidth: 560, margin: "24px auto 0" }}>
            What Olune does, what it costs, and how everything connects. Can&rsquo;t find your answer? Email{" "}
            <a href="mailto:hello@olune.co.nz" style={{ fontWeight: 600, color: NAVY, borderBottom: `1px solid ${ACCENT}80` }}>hello@olune.co.nz</a>.
          </p>
        </div>
      </section>

      {/* ACCORDIONS */}
      <section className="dcl-section" style={{ ...sectionStyle, background: "#f7f6fb", boxShadow: "0 -34px 70px -38px rgba(26,21,53,0.16)" }}>
        <div style={{ maxWidth: 820, margin: "0 auto", position: "relative", zIndex: 2, display: "flex", flexDirection: "column", gap: 56 }}>
          {CATEGORIES.map((cat) => (
            <div key={cat.label}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontSize: 13, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,21,53,0.46)", marginBottom: 4 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACCENT, display: "inline-block" }} />
                {cat.label.toUpperCase()}
              </div>
              <div>
                {cat.items.map((item) => {
                  const open = idx === 0;
                  idx += 1;
                  return <AccordionItem key={item.q} item={item} defaultOpen={open} />;
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ maxWidth: 640, margin: "96px auto 0", textAlign: "center", position: "relative", zIndex: 2 }}>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(28px, 3.4vw, 42px)", lineHeight: 1.1, letterSpacing: "-0.015em", color: NAVY, margin: 0 }}>Still curious? Just try it.</h2>
          <p style={{ fontSize: 16, lineHeight: 1.6, color: "rgba(26,21,53,0.56)", maxWidth: 480, margin: "16px auto 0" }}>Everything is free to use until general release in early August — the fastest way to see if Olune fits your studio.</p>
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
