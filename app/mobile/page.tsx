// ============================================================================
//  app/mobile/page.tsx — Server Component wrapper. The Olune Mobile page is a
//  client component (it hosts a live interactive prototype), which can't
//  export metadata itself, so this file owns metadata + SoftwareApplication
//  structured data.
// ============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { MobilePageClient } from "@/components/marketing/landing/MobilePageClient";
import { JsonLd } from "@/components/seo/JsonLd";
import { originForHost, rootUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Olune Mobile",
  description:
    "The studio in your pocket. One app for owners, teachers and parents — offline registers, agent-drafted admin and a scrubbable view of the whole day.",
  alternates: { canonical: rootUrl("/mobile") },
};

export default async function MobilePage() {
  const origin = originForHost((await headers()).get("host"));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "Olune Mobile",
          applicationCategory: "BusinessApplication",
          operatingSystem: "iOS, Android",
          url: `${origin}/mobile`,
          description:
            "The Olune dance-studio app for phones: offline attendance registers, agent-drafted admin approved in one tap, live fees, and a scrubbable timeline of every room.",
          publisher: { "@type": "Organization", name: "Olune", url: origin },
        }}
      />
      <MobilePageClient />
    </>
  );
}
