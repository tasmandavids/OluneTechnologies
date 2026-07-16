// ============================================================================
//  app/privacy/page.tsx — Server Component wrapper. The Privacy Policy UI is
//  a client component (shared landing chrome), which can't export metadata
//  itself, so this file owns generateMetadata.
// ============================================================================

import type { Metadata } from "next";
import { PrivacyPageClient } from "@/components/marketing/landing/PrivacyPageClient";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Olune Limited collects, uses, discloses, and protects personal information across the Service.",
};

export default function PrivacyPage() {
  return <PrivacyPageClient />;
}
