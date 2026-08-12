// ============================================================================
//  app/guides/page.tsx — index of the answer pages.
//
//  Exists to give the individual guides a hub Google can crawl from, and to
//  rank for the broader category query in its own right.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/lib/content/guides";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd, rootUrl } from "@/lib/seo";
import { ContentCta, ContentHero, ContentShell } from "@/components/marketing/content/ContentArticle";
import { DISPLAY, FAINT, HAIRLINE, MUTED, NAVY, PAGE_BG } from "@/components/marketing/content/tokens";

const TRAIL = [{ name: "Guides", path: "/guides" }];

export const metadata: Metadata = {
  title: { absolute: "Guides for Running a Dance or Fitness Studio — Olune" },
  description:
    "Practical guides for New Zealand dance and fitness studios: taking enrolments online, invoicing term fees, running registers without paper, payment plans and switching software.",
  alternates: { canonical: rootUrl("/guides") },
};

export default function GuidesIndexPage() {
  return (
    <ContentShell>
      <JsonLd data={itemListJsonLd(GUIDES.map((g) => ({ name: g.title, path: `/guides/${g.slug}` })))} />
      <JsonLd data={breadcrumbJsonLd(TRAIL)} />

      <ContentHero
        eyebrow="Guides"
        title="Running the studio, written down"
        intro="Practical answers to the parts of studio admin that eat the most time — enrolments, term fees, registers and the awkward business of changing systems. Written for New Zealand studios."
        trail={TRAIL}
      />

      <section style={{ background: PAGE_BG, padding: "24px 24px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 16 }}>
          {GUIDES.map((guide) => (
            <Link
              key={guide.slug}
              href={`/guides/${guide.slug}`}
              style={{ display: "block", padding: "26px 26px", background: "#ffffff", border: HAIRLINE, borderRadius: 16, textDecoration: "none" }}
            >
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: FAINT, marginBottom: 10 }}>
                {guide.eyebrow}
              </div>
              <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, lineHeight: 1.25, color: NAVY, margin: "0 0 10px" }}>
                {guide.title}
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: MUTED, margin: 0 }}>{guide.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <ContentCta />
    </ContentShell>
  );
}
