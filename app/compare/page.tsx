// ============================================================================
//  app/compare/page.tsx — index of the comparison pages.
// ============================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { COMPARISONS } from "@/lib/content/compare";
import { JsonLd } from "@/components/seo/JsonLd";
import { breadcrumbJsonLd, itemListJsonLd, rootUrl } from "@/lib/seo";
import { ContentCta, ContentHero, ContentShell } from "@/components/marketing/content/ContentArticle";
import { DISPLAY, HAIRLINE, MUTED, NAVY, PAGE_BG } from "@/components/marketing/content/tokens";

const TRAIL = [{ name: "Compare", path: "/compare" }];

export const metadata: Metadata = {
  title: { absolute: "Compare Olune with Other Studio Software" },
  description:
    "How Olune compares with Jackrabbit Dance, Class Manager and running your studio on spreadsheets — pricing models, NZD and GST, and what's included.",
  alternates: { canonical: rootUrl("/compare") },
};

export default function CompareIndexPage() {
  return (
    <ContentShell>
      <JsonLd data={itemListJsonLd(COMPARISONS.map((c) => ({ name: c.title, path: `/compare/${c.slug}` })))} />
      <JsonLd data={breadcrumbJsonLd(TRAIL)} />

      <ContentHero
        eyebrow="Compare"
        title="How Olune compares"
        intro="Straight comparisons, including where the other option is the better one. If you're choosing studio software as a New Zealand studio, the currency and the tax handling usually matter more than the feature count."
        trail={TRAIL}
      />

      <section style={{ background: PAGE_BG, padding: "24px 24px 0" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", display: "grid", gap: 16 }}>
          {COMPARISONS.map((c) => (
            <Link
              key={c.slug}
              href={`/compare/${c.slug}`}
              style={{ display: "block", padding: "26px 26px", background: "#ffffff", border: HAIRLINE, borderRadius: 16, textDecoration: "none" }}
            >
              <h2 style={{ fontFamily: DISPLAY, fontWeight: 500, fontSize: 25, lineHeight: 1.25, color: NAVY, margin: "0 0 10px" }}>
                {c.title}
              </h2>
              <p style={{ fontSize: 16, lineHeight: 1.6, color: MUTED, margin: 0 }}>{c.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <ContentCta />
    </ContentShell>
  );
}
