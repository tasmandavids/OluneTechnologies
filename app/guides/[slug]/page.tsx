// ============================================================================
//  app/guides/[slug] — one answer page per real search question.
//
//  Statically generated from lib/content/guides.ts: generateStaticParams means
//  every guide is prerendered HTML, which is what both crawlers and assistants
//  read. dynamicParams=false so an unknown slug 404s rather than rendering an
//  empty shell Google would index.
// ============================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GUIDES, guideBySlug } from "@/lib/content/guides";
import { JsonLd } from "@/components/seo/JsonLd";
import { articleJsonLd, breadcrumbJsonLd, faqPageJsonLd, rootUrl } from "@/lib/seo";
import {
  ContentBody,
  ContentCta,
  ContentFaq,
  ContentHero,
  ContentShell,
  RelatedLinks,
} from "@/components/marketing/content/ContentArticle";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) return {};

  const url = rootUrl(`/guides/${guide.slug}`);
  return {
    // Plain string, so the root layout's "%s · Olune" template supplies the
    // brand suffix — matching /faq, /team and the rest of the marketing pages.
    title: guide.metaTitle,
    description: guide.description,
    alternates: { canonical: url },
    openGraph: { title: guide.metaTitle, description: guide.description, url, type: "article" },
  };
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const guide = guideBySlug(slug);
  if (!guide) notFound();

  const url = rootUrl(`/guides/${guide.slug}`);
  const trail = [
    { name: "Guides", path: "/guides" },
    { name: guide.title, path: `/guides/${guide.slug}` },
  ];

  const related = (guide.related ?? [])
    .map((s) => guideBySlug(s))
    .filter((g): g is NonNullable<typeof g> => Boolean(g))
    .map((g) => ({ title: g.title, description: g.description, href: `/guides/${g.slug}` }));

  return (
    <ContentShell>
      <JsonLd
        data={articleJsonLd({
          url,
          headline: guide.title,
          description: guide.description,
          dateModified: guide.updated,
        })}
      />
      {guide.faq?.length ? <JsonLd data={faqPageJsonLd(guide.faq)} /> : null}
      <JsonLd data={breadcrumbJsonLd(trail)} />

      <ContentHero
        eyebrow={guide.eyebrow}
        title={guide.title}
        intro={guide.intro}
        trail={trail}
        updated={guide.updated}
      />
      <ContentBody sections={guide.sections} />
      {guide.faq?.length ? <ContentFaq items={guide.faq} /> : null}
      <RelatedLinks links={related} />
      <ContentCta />
    </ContentShell>
  );
}
