// ============================================================================
//  app/faq/page.tsx — Server Component wrapper. The FAQ UI is a client
//  component (accordion state), which can't export metadata itself, so this
//  file owns generateMetadata + the FAQPage rich-result structured data.
// ============================================================================

import type { Metadata } from "next";
import { FaqPageClient } from "@/components/marketing/landing/FaqPageClient";
import { CATEGORIES } from "@/components/marketing/landing/faq-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { faqPageJsonLd, rootUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "What Olune does, what it costs, and how projects, invoicing and live client websites connect — answered.",
  alternates: { canonical: rootUrl("/faq") },
};

export default function FaqPage() {
  const faqItems = CATEGORIES.flatMap((cat) => cat.items);

  return (
    <>
      <JsonLd data={faqPageJsonLd(faqItems)} />
      <FaqPageClient />
    </>
  );
}
