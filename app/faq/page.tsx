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
    "How Olune handles enrolments, class registers, term fees and your studio website — plus what it costs. Answers for dance and fitness studios.",
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
