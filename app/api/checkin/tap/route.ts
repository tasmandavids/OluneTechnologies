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
import { checkRateLimit, clientIpKey } from "@/lib/rate-limit";

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
  if (!reader) {
    // Only *failed* auth is throttled. The reader credential is a shared
    // secret sitting on a kiosk, so this endpoint is the one place it can be
    // guessed at; a working kiosk never lands here, so a busy door is never
    // slowed down by it.
    if (!(await checkRateLimit(clientIpKey("checkin-tap-auth", req.headers), { limit: 10, windowMs: 60_000 }))) {
      return new NextResponse(null, { status: 429 });
    }
    return new NextResponse(null, { status: 401 });
  }

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

  // `cardKind`/`clock` let a reader show "Clocked in 9:02am" for a staff card.
  // `clock` is advisory: a staff tap whose timesheet write failed is still a
  // successful tap, because the safety register is what the hardware is for.
  return NextResponse.json({
    ok: true,
    direction: result.direction,
    tappedAt: result.tappedAt,
    cardKind: result.cardKind,
    clock: result.clock,
  });
}
