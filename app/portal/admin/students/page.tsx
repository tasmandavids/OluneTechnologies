// ============================================================================
//  /portal/admin/students — retired. The student roster now lives on the
//  unified People directory (/portal/admin/people, "Students" tab), which
//  carries the search, filters, add-student and bulk actions this screen had.
//  Individual profiles are unchanged at /portal/admin/students/[id].
// ============================================================================

import { redirect } from "next/navigation";

export default function StudentsPage() {
  redirect("/portal/admin/people?tab=students");
}
