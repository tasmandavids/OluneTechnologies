// ============================================================================
//  app/data-deletion/page.tsx — Server Component wrapper. Explicit
//  instructions for users on how to request deletion of their data from
//  Olune (required as a public "Data Deletion Instructions URL" by some
//  OAuth/platform integrations). Client UI can't export metadata itself, so
//  this file owns generateMetadata.
// ============================================================================

import type { Metadata } from "next";
import { DataDeletionPageClient } from "@/components/marketing/landing/DataDeletionPageClient";
import { rootUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Data Deletion Instructions",
  description: "How to request deletion of your personal information from Olune, for both studios/clubs and their students or members.",
  alternates: { canonical: rootUrl("/data-deletion") },
};

export default function DataDeletionPage() {
  return <DataDeletionPageClient />;
}
