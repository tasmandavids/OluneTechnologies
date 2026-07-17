// ============================================================================
//  POST /api/passes/redeem — admin redeems a scanned class pass against a
//  chosen class occurrence (class_id + date). Admin-only (front desk).
//
//  The status flip is a single atomic conditional UPDATE (WHERE status =
//  'paid'), which is what makes double-redemption fail cleanly: a second
//  attempt (or a race between two concurrent scans) matches zero rows.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

const RedeemSchema = z.object({
  passId: z.string().uuid(),
  qrToken: z.string().uuid(),
  classId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = RedeemSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { passId, qrToken, classId, date } = parsed.data;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, studio_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can redeem passes." }, { status: 403 });
  }
  if (!profile.studio_id) return NextResponse.json({ error: "No studio found." }, { status: 400 });

  const { data: cls } = await supabase
    .from("classes")
    .select("id, studio_id, name")
    .eq("id", classId)
    .single();

  if (!cls || cls.studio_id !== profile.studio_id) {
    return NextResponse.json({ error: "Class not found in your studio." }, { status: 404 });
  }

  // Atomic claim — the double-redeem guard.
  const { data: claimed, error: claimErr } = await supabase
    .from("class_passes")
    .update({
      status: "redeemed",
      redeemed_at: new Date().toISOString(),
      redeemed_class_id: classId,
      redeemed_date: date,
      redeemed_by: user.id,
    })
    .eq("id", passId)
    .eq("qr_token", qrToken)
    .eq("status", "paid")
    .eq("studio_id", profile.studio_id)
    .select("id, student_id, studio_id")
    .maybeSingle();

  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });

  if (!claimed) {
    const { data: existing } = await supabase
      .from("class_passes")
      .select("status")
      .eq("id", passId)
      .eq("studio_id", profile.studio_id)
      .maybeSingle();
    if (existing?.status === "redeemed") {
      return NextResponse.json({ error: "This pass has already been redeemed." }, { status: 409 });
    }
    return NextResponse.json({ error: "Pass not found, not paid, or QR code invalid." }, { status: 404 });
  }

  const { error: attErr } = await supabase.from("attendance").upsert(
    {
      studio_id: claimed.studio_id,
      class_id: classId,
      student_id: claimed.student_id,
      date,
      status: "present",
      noted_by: user.id,
    },
    { onConflict: "class_id,student_id,date" },
  );

  if (attErr) {
    console.error(`[passes/redeem] pass ${passId} redeemed but attendance upsert failed:`, attErr.message);
    return NextResponse.json({ ok: true, attendanceWarning: true, className: cls.name });
  }

  return NextResponse.json({ ok: true, className: cls.name });
}
