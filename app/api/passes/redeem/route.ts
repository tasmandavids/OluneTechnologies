// ============================================================================
//  POST /api/passes/redeem — admin redeems a scanned class pass against a
//  chosen class occurrence (class_id + date). Admin-only (front desk).
//
//  The status flip is a single atomic conditional UPDATE (WHERE status =
//  'paid'), which is what makes double-redemption fail cleanly: a second
//  attempt (or a race between two concurrent scans) matches zero rows.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { getAdminStudio } from "@/lib/portal/access";
import { z } from "zod";
import { rollbackRedeemedClassPassClaim } from "@/lib/passes/redemption";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const RedeemSchema = z.object({
  passId: z.string().uuid(),
  qrToken: z.string().uuid(),
  classId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function POST(req: NextRequest) {
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

  if (!(await checkRateLimit(rateLimitKey("pass-redeem", userId), { limit: 30, windowMs: 60_000 }))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const json = await req.json().catch(() => null);
  const parsed = RedeemSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { passId, qrToken, classId, date } = parsed.data;

  const { data: cls } = await supabase
    .from("classes")
    .select("id, studio_id, name")
    .eq("id", classId)
    .single();

  if (!cls || cls.studio_id !== studioId) {
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
      redeemed_by: userId,
    })
    .eq("id", passId)
    .eq("qr_token", qrToken)
    .eq("status", "paid")
    .eq("studio_id", studioId)
    .select("id, student_id, studio_id")
    .maybeSingle();

  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });

  if (!claimed) {
    const { data: existing } = await supabase
      .from("class_passes")
      .select("status")
      .eq("id", passId)
      .eq("studio_id", studioId)
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
      noted_by: userId,
    },
    { onConflict: "class_id,student_id,date" },
  );

  if (attErr) {
    console.error(`[passes/redeem] pass ${passId} redeemed but attendance upsert failed:`, attErr.message);
    const rollbackErr = await rollbackRedeemedClassPassClaim(supabase, {
      passId,
      studioId: claimed.studio_id,
      classId,
      date,
      redeemedBy: userId,
    });
    if (rollbackErr) {
      console.error(`[passes/redeem] failed to roll back pass ${passId} after attendance error:`, rollbackErr);
      return NextResponse.json(
        { error: "Attendance could not be recorded, and the pass rollback failed. Please contact support." },
        { status: 500 },
      );
    }
    return NextResponse.json(
      { error: "Attendance could not be recorded, so the pass was not redeemed. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, className: cls.name });
}
