// ============================================================================
//  POST /api/checkin/tap-debug
//
//  Admin-session-authenticated twin of /api/checkin/tap, for verifying the
//  tap-resolution/direction/insert/notify path without physical NFC hardware
//  — Web NFC only runs on real Android Chrome, so there's no way to exercise
//  the real reader endpoint from a dev browser. Usable in any environment
//  (including staging/production), gated by a real admin/office session
//  rather than an environment check, so it also works for verifying a live
//  deploy. Shares performTap with the real endpoint so both code paths stay
//  identical past the authentication step.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStudioOpsStudio } from "@/lib/portal/access";
import { performTap, TAP_FAILURE_MESSAGE, TAP_FAILURE_STATUS } from "@/lib/checkin/tap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TapSchema = z.object({
  cardToken: z.string().uuid(),
  direction: z.enum(["in", "out"]).optional(),
});

export async function POST(req: NextRequest) {
  const { error, studioId } = await getStudioOpsStudio();
  if (error || !studioId) return NextResponse.json({ error: error ?? "Not authorized." }, { status: 403 });

  const json = await req.json().catch(() => null);
  const parsed = TapSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const admin = createAdminClient();
  const result = await performTap(admin, {
    studioId,
    cardToken: parsed.data.cardToken,
    direction: parsed.data.direction,
    readerKey: "debug",
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: TAP_FAILURE_MESSAGE[result.reason], reason: result.reason },
      { status: TAP_FAILURE_STATUS[result.reason] },
    );
  }

  return NextResponse.json({
    ok: true,
    direction: result.direction,
    tappedAt: result.tappedAt,
    cardKind: result.cardKind,
    clock: result.clock,
  });
}
