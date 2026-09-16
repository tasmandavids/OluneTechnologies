// ============================================================================
//  app/pricing/page.tsx — the real pricing route.
//
//  Previously pricing existed only as a "#pricing" anchor on the landing page,
//  which meant it could never rank for pricing queries and could never be
//  linked to directly.
//
//  Prices come from lib/plans/catalog.ts — the same module the Stripe
//  subscription flow charges from — rather than from marketing copy. A pricing
//  page that disagrees with the checkout is the one inconsistency no amount of
//  SEO is worth, and it's also the page Google actively checks Offer markup
//  against.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { PLAN_ORDER, PLANS, DEFAULT_PLAN } from "@/lib/plans/catalog";
import { formatMoney } from "@/lib/currency";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, faqPageJsonLd, pricingJsonLd, rootUrl } from "@/lib/seo";
import { ContentCta, ContentFaq, ContentHero, ContentShell } from "@/components/marketing/content/ContentArticle";
import { ACCENT, DISPLAY, FAINT, HAIRLINE, MUTED, NAVY, PAGE_BG } from "@/components/marketing/content/tokens";

/**
 * Whole dollars, marked as New Zealand dollars — plan prices are round, and
 * cents read as clutter here.
 *
 * There is no separate Unicode glyph for the NZ dollar; en-NZ/NZD formats as a
 * bare "$", which reads as USD to anyone scanning a SaaS pricing page. The
 * "NZ$" prefix is the NZ convention for disambiguating it, and it has to be on
 * the number itself rather than in a caption beside it, because these strings
 * also get inlined into the FAQ answers below.
 */
function dollars(cents: number): string {
  return `NZ${formatMoney(cents, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const PLAN_COPY: Record<string, { tag: string; desc: string; highlights: string[] }> = {
  solo: {
    tag: "for the one-person studio",
    desc: "You teach, you invoice, you go home. Classes, rolls, attendance and fees, without the parts you'd never open.",
    highlights: ["Classes and timetables", "Attendance and class rolls", "Invoicing and term fees", "Messaging families"],
  },
  studio: {
    tag: "for a team",
    desc: "Everything in Solo, plus what starts mattering once more than one person is involved — and once you're marketing to people who haven't enrolled yet.",
    highlights: ["Everything in Solo", "Staff, availability and substitutes", "Leads and enrolment forms", "Your studio website and shop", "Class passes"],
  },
  scale: {
    tag: "for busy studios",
    desc: "Every module Olune has, including production, costumes, competitions and progress tracking.",
    highlights: ["Everything in Studio", "Private lessons", "Badges and progress", "Production and costumes", "Competitions and venues"],
  },
};

const INCLUDED = [
  "Unlimited students, on every plan",
  "Online enrolment page for your studio",
  "Attendance on mobile, working offline",
  "Family and student records",
  "GST handled at studio level",
  "Payment plans and instalments",
  "Card payments and a Xero connection",
  "Free updates on every plan",
];

const TRAIL = [{ name: "Pricing", path: "/pricing" }];

export const metadata: Metadata = {
  title: { absolute: "Olune Pricing — Studio Software with Unlimited Students" },
  description:
    "Olune pricing for New Zealand dance and fitness studios: flat plans in NZD with unlimited students on every tier, GST included, no setup fees. Free until general release.",
  alternates: { canonical: rootUrl("/pricing") },
  openGraph: {
    title: "Olune Pricing — Unlimited students on every plan",
    description:
      "Flat plans in New Zealand dollars. We don't charge you for growing — every tier is unlimited students.",
    url: rootUrl("/pricing"),
  },
};

export default function PricingPage() {
  const plans = PLAN_ORDER.map((key) => {
    const plan = PLANS[key];
    return {
      key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      monthly: dollars(plan.monthlyCents),
      monthlyValue: (plan.monthlyCents / 100).toFixed(2),
      annual: dollars(plan.annualCents),
      featured: key === DEFAULT_PLAN,
      ...PLAN_COPY[key],
    };
  });

  const pricingFaq = [
    {
      q: "How much does Olune cost?",
      a: `Plans are ${plans.map((p) => `${p.monthly}/month for ${p.name}`).join(", ")}, in New Zealand dollars and GST-inclusive. Olune is free to use as much as you like through 31 December 2026 (New Zealand time).`,
    },
    {
      q: "Does the price go up as I enrol more students?",
      a: "No. Every plan has unlimited students. Plans differ by which parts of Olune they unlock, never by how many students you have, so a strong enrolment term doesn't move you into a more expensive bracket.",
    },
    {
      q: "Is the price in New Zealand dollars?",
      a: "Yes, and GST-inclusive. Olune is built for New Zealand studios, so there's no exchange rate sitting between the price you were quoted and the amount that leaves your account.",
    },
    {
      q: "Is there a discount for paying annually?",
      a: `Yes — annual billing works out to two months free. ${plans.map((p) => `${p.name} is ${p.annual}/year`).join(", ")}.`,
    },
    {
      q: "Is there a free trial?",
      a: "Olune is completely free to use through 31 December 2026 (New Zealand time), which is long enough to run a full term through it. After that, every plan starts with 14 days free and no card is needed to sign up.",
    },
    {
      q: "Are there setup fees?",
      a: "No. The plan price is the whole price — no onboarding fee, no charge to import your students, and no separate cost for your studio website on the plans that include it.",
    },
    {
      q: "Can I change plans or cancel?",
      a: "Anytime, from your settings. There are no lock-in contracts and no cancellation fees.",
    },
  ];

  return (
    <ContentShell>
      <JsonLd
        data={pricingJsonLd(plans.map((p) => ({ name: p.name, price: p.monthlyValue, desc: p.desc })))}
      />
      <JsonLd data={faqPageJsonLd(pricingFaq)} />
      <JsonLd data={breadcrumbJsonLd(TRAIL)} />

      <ContentHero
        eyebrow="Pricing"
        title="We don't charge you for growing"
        intro="Every plan has unlimited students. Plans differ by what they unlock, never by how many dancers you enrol — so a good year costs you nothing extra. Priced in New Zealand dollars, GST included."
        trail={TRAIL}
      />

      {/* PLANS */}
      <section style={{ background: PAGE_BG, padding: "24px 24px 0" }}>
        <div style={{ maxWidth: 1060, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(288px, 1fr))", gap: 20 }}>
          {plans.map((plan) => (
            <div
              key={plan.key}
              style={{
                background: "#ffffff",
                border: plan.featured ? `1.5px solid ${ACCENT}` : HAIRLINE,
                borderRadius: 20,
                padding: "32px 28px",
                display: "flex",
                flexDirection: "column",
                boxShadow: plan.featured ? "0 26px 56px -34px rgba(139,124,240,0.9)" : "0 18px 40px -34px rgba(26,21,53,0.5)",
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 28, color: NAVY, margin: 0 }}>{plan.name}</h2>
                {plan.featured ? (
                  <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: ACCENT }}>
                    Most popular
                  </span>
                ) : null}
              </div>
              <div style={{ fontSize: 13.5, color: FAINT, marginBottom: 20 }}>{plan.tag}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginBottom: 4 }}>
                <span style={{ fontFamily: DISPLAY, fontSize: 46, color: NAVY, lineHeight: 1 }}>{plan.monthly}</span>
                <span style={{ fontSize: 15, color: FAINT }}>/mo</span>
                <span style={{ fontSize: 13, color: FAINT, marginLeft: 4 }}>incl. GST</span>
              </div>
              <div style={{ fontSize: 13.5, color: FAINT, marginBottom: 18 }}>or {plan.annual}/year — two months free</div>
              <p style={{ fontSize: 15.5, lineHeight: 1.65, color: MUTED, margin: "0 0 20px" }}>{plan.desc}</p>
              <ul style={{ margin: "0 0 26px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
                {plan.highlights.map((h) => (
                  <li key={h} style={{ display: "flex", gap: 10, fontSize: 15, lineHeight: 1.5, color: MUTED }}>
                    <span aria-hidden style={{ color: ACCENT, fontWeight: 700, flexShrink: 0 }}>✓</span>
                    {h}
                  </li>
                ))}
              </ul>
              <Link
                href="/onboarding"
                style={{
                  display: "block",
                  textAlign: "center",
                  padding: "13px 20px",
                  borderRadius: 999,
                  fontSize: 15,
                  fontWeight: 600,
                  textDecoration: "none",
                  background: plan.featured ? NAVY : "transparent",
                  color: plan.featured ? "#ffffff" : NAVY,
                  border: plan.featured ? "1px solid transparent" : HAIRLINE,
                }}
              >
                Start free
              </Link>
            </div>
          ))}
        </div>
        <p style={{ maxWidth: 1060, margin: "18px auto 0", fontSize: 13.5, color: FAINT, textAlign: "center" }}>
          Free to use through 31 December 2026 (New Zealand time). After that, 14 days free on every plan — no card needed.
        </p>
      </section>

      {/* EVERY PLAN INCLUDES */}
      <section style={{ background: PAGE_BG, padding: "72px 24px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto" }}>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: "clamp(24px, 3vw, 34px)", color: NAVY, margin: "0 0 24px" }}>
            Every plan includes
          </h2>
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {INCLUDED.map((item) => (
              <li key={item} style={{ display: "flex", gap: 12, alignItems: "flex-start", fontSize: 16, lineHeight: 1.55, color: MUTED }}>
                <span aria-hidden style={{ color: ACCENT, fontWeight: 700, flexShrink: 0 }}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* HONEST MATH */}
      <section style={{ background: PAGE_BG, padding: "64px 24px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", background: "#ffffff", border: HAIRLINE, borderRadius: 18, padding: "32px 30px" }}>
          <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 28, color: NAVY, margin: "0 0 14px" }}>
            The honest math
          </h2>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: MUTED, margin: "0 0 16px" }}>
            Most studio software prices on how many students you have, so the bill grows every time you have a good
            term. A roll that goes from 100 to 260 students can move you through two or three pricing brackets without
            you gaining a single feature.
          </p>
          <p style={{ fontSize: 16.5, lineHeight: 1.7, color: MUTED, margin: 0 }}>
            Olune charges for capability instead. Enrol as many dancers as you can fit — the price only changes if you
            decide you want more of Olune.
          </p>
        </div>
      </section>

      <ContentFaq items={pricingFaq} />
      <ContentCta note="Free to use through 31 December 2026 (New Zealand time) — long enough to run a full term through it before you decide." />
    </ContentShell>
  );
}
