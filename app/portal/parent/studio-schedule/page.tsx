// ============================================================================
//  /portal/parent/studio-schedule — merged into /portal/parent/schedule as
//  the "Whole studio" view (1.6.1 IA). Route kept as a redirect so old links
//  keep working.
// ============================================================================

import { redirect } from "next/navigation";

export default function ParentStudioSchedulePage() {
  redirect("/portal/parent/schedule?view=studio");
}
