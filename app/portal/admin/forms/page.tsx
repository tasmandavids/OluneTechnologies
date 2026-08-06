// ============================================================================
//  /portal/admin/forms — Form creation.
//
//  Where a studio writes the things people have to read and sign: policies,
//  codes of conduct, handbooks, medical and consent forms. Each one gets an
//  audience (everyone / a role / a class / named individuals) and, when it
//  needs one, a signature block at the bottom.
//
//  The list also owns the "who's signed" view, so writing the policy and
//  chasing it are the same door.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { loadStudioForms } from "@/lib/forms/data";
import { FormsWorkbench } from "@/components/admin/forms/FormsWorkbench";

export const dynamic = "force-dynamic";

export default async function AdminFormsPage() {
  const { supabase, studioId, role } = await requirePortalSession();

  if (role !== "admin") {
    return (
      <div className="mx-auto max-w-6xl p-6">
        <div className="box rounded-2xl px-6 py-12 text-center text-sm text-muted">
          Only studio admins can create forms.
        </div>
      </div>
    );
  }

  const { forms, classes, people } = await loadStudioForms(supabase, studioId);

  return <FormsWorkbench forms={forms} classes={classes} people={people} />;
}
