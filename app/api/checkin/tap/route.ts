// ============================================================================
//  POST /api/checkin/tap
//
//  The kiosk/reader endpoint — no user session, authenticated by the studio's
//  shared reader credential (x-olune-reader-key / x-olune-reader-secret,
//  verified in lib/checkin/reader-auth.ts). direction is optional; when
//  omitted the server auto-toggles based on the student's last tap today.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyReaderCredential } from "@/lib/checkin/reader-auth";
import { performTap, TAP_FAILURE_MESSAGE, TAP_FAILURE_STATUS } from "@/lib/checkin/tap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TapSchema = z.object({
  cardToken: z.string().uuid(),
  direction: z.enum(["in", "out"]).optional(),
});

export async function POST(req: NextRequest) {
  const reader = await verifyReaderCredential(
    req.headers.get("x-olune-reader-key"),
    req.headers.get("x-olune-reader-secret"),
  );
  if (!reader) return new NextResponse(null, { status: 401 });

  const json = await req.json().catch(() => null);
  const parsed = TapSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const admin = createAdminClient();
  const result = await performTap(admin, {
    studioId: reader.studioId,
    cardToken: parsed.data.cardToken,
    direction: parsed.data.direction,
    readerKey: reader.readerKey,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: TAP_FAILURE_MESSAGE[result.reason], reason: result.reason },
      { status: TAP_FAILURE_STATUS[result.reason] },
    );
  }

  return NextResponse.json({ ok: true, direction: result.direction, tappedAt: result.tappedAt });
}
