// ============================================================================
//  FormsSurface — the server half of the signing screen.
//
//  Rendered by both /portal/forms (every role) and /portal/parent/forms (the
//  route already in the parent nav), so a family and a teacher see the same
//  screen with the same rules.
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadAssignedForms } from "@/lib/forms/data";
import { resolveEffectiveStudioId } from "@/lib/portal/access";
import { submitFormResponse } from "@/app/portal/forms/actions";
import { FormsInbox } from "./FormsInbox";
import type { Role } from "@/lib/types";

export async function FormsSurface() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, active_studio_id, role, full_name")
    .eq("id", user.id)
    .single();

  const studioId = profile ? resolveEffectiveStudioId(profile) : null;
  const signerName = (profile?.full_name as string | null) ?? null;

  if (!studioId) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="box rounded-2xl px-6 py-12 text-center text-sm text-muted">
          Your account isn&apos;t linked to a studio yet.
        </div>
      </div>
    );
  }

  const { forms, responses } = await loadAssignedForms(
    supabase,
    user.id,
    studioId,
    (profile?.role as Role) ?? "parent",
    signerName,
  );

  return (
    <FormsInbox
      forms={forms}
      responses={responses}
      signerName={signerName}
      onSubmit={submitFormResponse}
    />
  );
}
