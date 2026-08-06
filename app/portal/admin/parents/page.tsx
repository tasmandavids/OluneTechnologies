// ============================================================================
//  /portal/admin/parents — retired. The family roster now lives on the unified
//  People directory (/portal/admin/people, "Families" tab), which carries the
//  search, filters, add-family, invite-all and mass-email actions this screen
//  had. Individual profiles are unchanged at /portal/admin/parents/[id].
// ============================================================================

import { redirect } from "next/navigation";

export default function ParentsPage() {
  redirect("/portal/admin/people?tab=families");
}
