// ============================================================================
//  app/compare/[slug] — one comparison page per alternative.
//
//  Renders the same editorial layout as /guides plus a side-by-side table, and
//  prints the date the competitor facts were last verified. That date is not
//  decoration: these pages assert things about other companies, and a claim
//  without a checked date is a claim nobody can audit.
// ============================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COMPARISONS, comparisonBySlug } from "@/lib/content/compare";
import { guideBySlug } from "@/lib/content/guides";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleJsonLd, breadcrumbJsonLd, faqPageJsonLd, rootUrl } from "@/lib/seo";
import {
  CompareTable,
  ContentBody,
  ContentCta,
  ContentFaq,
  ContentHero,
  ContentShell,
  RelatedLinks,
} from "@/components/marketing/content/ContentArticle";
import { FAINT, PAGE_BG } from "@/components/marketing/content/tokens";

export const dynamicParams = false;

export function generateStaticParams() {
  return COMPARISONS.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = comparisonBySlug(slug);
  if (!doc) return {};

  const url = rootUrl(`/compare/${doc.slug}`);
  return {
    title: doc.metaTitle,
    description: doc.description,
    alternates: { canonical: url },
    openGraph: { title: doc.metaTitle, description: doc.description, url, type: "article" },
  };
}

export default async function ComparePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = comparisonBySlug(slug);
  if (!doc) notFound();

  const url = rootUrl(`/compare/${doc.slug}`);
  const trail = [
    { name: "Compare", path: "/compare" },
    { name: doc.title, path: `/compare/${doc.slug}` },
  ];

  // Related entries may point at either collection.
  const related = (doc.related ?? [])
    .map((s) => {
      const cmp = comparisonBySlug(s);
      if (cmp) return { title: cmp.title, description: cmp.description, href: `/compare/${cmp.slug}` };
      const guide = guideBySlug(s);
      return guide ? { title: guide.title, description: guide.description, href: `/guides/${guide.slug}` } : null;
    })
    .filter((r): r is NonNullable<typeof r> => Boolean(r));

  return (
    <ContentShell>
      <JsonLd
        data={articleJsonLd({
          url,
          headline: doc.title,
          description: doc.description,
          dateModified: doc.updated,
        })}
      />
      {doc.faq?.length ? <JsonLd data={faqPageJsonLd(doc.faq)} /> : null}
      <JsonLd data={breadcrumbJsonLd(trail)} />

      <ContentHero
        eyebrow={doc.eyebrow}
        title={doc.title}
        intro={doc.intro}
        trail={trail}
        updated={doc.updated}
      />
      <CompareTable them={doc.them} rows={doc.table} />
      <ContentBody sections={doc.sections} />

      <section style={{ background: PAGE_BG, padding: "48px 24px 0" }}>
        <p style={{ maxWidth: 760, margin: "0 auto", fontSize: 13.5, lineHeight: 1.6, color: FAINT }}>
          Details about {doc.them} on this page were taken from publicly published information and last checked on{" "}
          <time dateTime={doc.checked}>{doc.checked}</time>. Pricing and features change — check their current
          published terms before deciding. Olune is not affiliated with any product named here.
        </p>
      </section>

      {doc.faq?.length ? <ContentFaq items={doc.faq} /> : null}
      <RelatedLinks links={related} />
      <ContentCta />
    </ContentShell>
  );
}
