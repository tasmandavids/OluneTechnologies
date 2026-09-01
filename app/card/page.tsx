// ============================================================================
//  app/card/page.tsx — Server Component wrapper. The check-in card page is a
//  client component (it hosts a live draggable 3D card), which can't export
//  metadata itself, so this file owns metadata + Product structured data.
// ============================================================================

import type { Metadata } from "next";
import { headers } from "next/headers";
import { CardPageClient } from "@/components/marketing/landing/CardPageClient";
import { JsonLd } from "@/components/seo/JsonLd";
import { originForHost, rootUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "The Olune check-in card",
  description:
    "One tap at the door: arrival and departure logged, parents notified, attendance done. The NFC membership card changes material — bronze to diamond — as a family's years with the studio add up.",
  alternates: { canonical: rootUrl("/card") },
};

export default async function CardPage() {
  const origin = originForHost((await headers()).get("host"));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Olune check-in card",
          category: "Dance studio membership card",
          url: `${origin}/card`,
          description:
            "An NFC membership card for dance studios. Families tap in and out at the door — attendance and pickup are logged automatically and parents are notified. Five earned tiers, from bronze on the day a family enrols to diamond at ten years.",
          brand: { "@type": "Organization", name: "Olune", url: origin },
        }}
      />
      <CardPageClient />
    </>
  );
}
