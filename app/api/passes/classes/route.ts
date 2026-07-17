// ============================================================================
//  GET /api/passes/classes — this admin's studio classes, for the redemption
//  class-occurrence picker (PassScanner → ClassOccurrencePicker).
// ============================================================================

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role, studio_id").eq("id", user.id).single();
  if (profile?.role !== "admin" || !profile.studio_id) {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("classes")
    .select("id, name, discipline, level")
    .eq("studio_id", profile.studio_id)
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ classes: data ?? [] });
}
