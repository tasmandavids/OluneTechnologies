// ============================================================================
//  POST /api/events/tickets/scan — admit a ticket holder at the door.
//
//  Tickets have carried a QR code since 0009 and had nothing to scan them
//  with. This is that endpoint.
//
//  Two rules govern everything here:
//
//   1. THE PAYLOAD IS NOT EVIDENCE. A QR code is a picture the holder is
//      carrying; they control what it says. Only `qr_token` is trusted, and
//      only because it is an unguessable secret we minted. Party size, status
//      and event are read from the row — never from the scan.
//
//   2. ADMITTING IS A SINGLE CONDITIONAL UPDATE. `WHERE checked_in_at IS NULL`
//      is what makes a second scan fail cleanly, including when two door staff
//      scan the same family in the same second. Read-then-write would admit
//      both. Same shape as /api/passes/redeem.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

const ScanSchema = z
  .object({
    eventId: z.string().uuid(),
    /** Preferred: the per-ticket secret minted at purchase. */
    qrToken: z.string().uuid().optional(),
    /**
     * Legacy fallback for tickets sold before 0112, whose printed QR predates
     * qr_token and carries a bare user_id. No weaker than what shipped — those
     * codes admitted nobody at all — and it retires as those events pass.
     */
    userId: z.string().uuid().optional(),
  })
  .refine((v) => Boolean(v.qrToken || v.userId), {
    message: "Scan is missing its ticket identifier.",
  });

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // A door queue is bursty but human-paced; this only catches a stuck scanner
  // re-submitting in a loop.
  if (!checkRateLimit(rateLimitKey("ticket-scan", user.id), { limit: 120, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many scans — slow down a moment." }, { status: 429 });
  }

  const parsed = ScanSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid scan." },
      { status: 400 },
    );
  }
  const { eventId, qrToken, userId } = parsed.data;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, studio_id")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return NextResponse.json({ error: "Only admins can scan tickets." }, { status: 403 });
  }
  if (!profile.studio_id) return NextResponse.json({ error: "No studio found." }, { status: 400 });

  // Confirm the event is ours before touching tickets. Without this an admin
  // could admit against another studio's event id.
  const { data: event } = await supabase
    .from("events")
    .select("id, name, studio_id")
    .eq("id", eventId)
    .maybeSingle();

  if (!event || event.studio_id !== profile.studio_id) {
    return NextResponse.json({ error: "Event not found in your studio." }, { status: 404 });
  }

  // Whichever identifier the QR carried narrows to exactly one ticket row.
  const idColumn = qrToken ? "qr_token" : "user_id";
  const idValue = qrToken ?? (userId as string);

  // ── The claim ──────────────────────────────────────────────────────────────
  // Only a paid, not-yet-admitted ticket matches. Anything else returns zero
  // rows and falls through to the diagnosis below.
  const { data: admitted, error: claimErr } = await supabase
    .from("event_tickets")
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: user.id })
    .eq("event_id", eventId)
    .eq(idColumn, idValue)
    .eq("status", "paid")
    .is("checked_in_at", null)
    .select("id, user_id, quantity, checked_in_at")
    .maybeSingle();

  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 });

  if (!admitted) {
    // Nothing was admitted. Say precisely why — "invalid ticket" at a door with
    // a queue behind it is the least useful sentence in the product.
    const { data: existing } = await supabase
      .from("event_tickets")
      .select("status, quantity, checked_in_at, checked_in_by, user_id")
      .eq("event_id", eventId)
      .eq(idColumn, idValue)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json(
        { error: "That code isn't a ticket for this event." },
        { status: 404 },
      );
    }

    if (existing.checked_in_at) {
      const holder = await holderName(supabase, existing.user_id);
      return NextResponse.json(
        {
          error: "Already scanned",
          alreadyCheckedIn: true,
          checkedInAt: existing.checked_in_at,
          holderName: holder,
          quantity: existing.quantity,
        },
        { status: 409 },
      );
    }

    const reason =
      existing.status === "reserved"
        ? "This ticket hasn't been paid for yet."
        : existing.status === "refunded"
          ? "This ticket was refunded."
          : existing.status === "cancelled"
            ? "This ticket was cancelled."
            : "This ticket can't be admitted.";
    return NextResponse.json({ error: reason }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    eventName: event.name,
    // Read from the row, never from the scanned payload — the whole point.
    quantity: admitted.quantity,
    holderName: await holderName(supabase, admitted.user_id),
    checkedInAt: admitted.checked_in_at,
  });
}

/** Best-effort display name for the door. A missing profile must not fail a scan. */
async function holderName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();
  return (data?.full_name as string | null) ?? null;
}
