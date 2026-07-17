// ============================================================================
//  /portal/admin/site — retired. Studio (v2) is now the only site editor;
//  the old block-based SiteManager/WebsiteSetupWizard flow this route used to
//  render is no longer linked from anywhere. Kept as a redirect (rather than
//  deleted outright) because it's still bookmarked/linked from a few places
//  (AdminRail nav, SeoPanel, not-found page) that are safe to leave pointing
//  here.
// ============================================================================

import { redirect } from "next/navigation";

export default function SitePagesPage() {
  redirect("/portal/admin/site/studio");
}
