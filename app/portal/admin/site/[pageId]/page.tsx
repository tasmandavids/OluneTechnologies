// ============================================================================
//  /portal/admin/site/[pageId] — retired. The old per-page block editor now
//  redirects into Studio, which auto-converts this page's existing blocks
//  into a v2 document the first time it's opened (lib/builder/convertV1.ts).
// ============================================================================

import { redirect } from "next/navigation";

export default async function SitePageEditor({
  params,
}: {
  params: Promise<{ pageId: string }>;
}) {
  const { pageId } = await params;
  redirect(`/portal/admin/site/studio/${pageId}`);
}
