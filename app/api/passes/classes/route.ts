// ============================================================================
//  GET /api/passes/classes — this admin's studio classes, for the redemption
//  class-occurrence picker (PassScanner → ClassOccurrencePicker).
// ============================================================================

import { NextResponse } from "next/server";
import { getAdminStudio } from "@/lib/portal/access";

export async function GET() {
  // Same access path as every admin action: the active workspace, an active
  // membership and the plan lock — not the legacy profiles.role/studio_id,
  // which ignored all three.
  const { error: accessError, supabase, studioId, userId } = await getAdminStudio();
  if (accessError || !studioId || !userId) {
    return NextResponse.json(
      { error: accessError ?? "Not authorized." },
      { status: userId ? 403 : 401 },
    );
  }

  const { data, error } = await supabase
    .from("classes")
    .select("id, name, discipline, level")
    .eq("studio_id", studioId)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ classes: data ?? [] });
}
