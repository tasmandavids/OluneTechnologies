// ============================================================================
//  lib/checkin/tap.ts
//
//  The single tap-resolution path shared by /api/checkin/tap (reader-
//  credential authenticated) and /api/checkin/tap-debug (admin-session
//  authenticated) — both call performTap with a service-role client so the
//  write behaves identically regardless of how the caller authenticated.
//
//  No conditional-UPDATE race guard is needed here (unlike class_passes'
//  redeem flow): every tap just appends a row, so there's no state a double
//  call could corrupt. A flaky reader retrying within the same second just
//  produces two identical rows — harmless for a safety register.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { studioLocalYmd } from "@/lib/date/studio-date";
import { isTapDirection, nextDirection, type TapDirection } from "@/lib/checkin/direction";

export type TapFailureReason =
  | "unknown_card"
  | "wrong_studio"
  | "card_pending"
  | "card_frozen"
  | "card_lost"
  | "card_revoked"
  | "insert_failed";

export type TapResult =
  | { ok: true; studentId: string; direction: TapDirection; tappedAt: string }
  | { ok: false; reason: TapFailureReason };

const STATUS_REASON: Record<string, TapFailureReason> = {
  pending: "card_pending",
  frozen: "card_frozen",
  lost: "card_lost",
  revoked: "card_revoked",
};

/** HTTP status + user-facing message per failure reason — shared by both tap routes. */
export const TAP_FAILURE_STATUS: Record<TapFailureReason, number> = {
  unknown_card: 404,
  wrong_studio: 404,
  card_pending: 409,
  card_frozen: 403,
  card_lost: 403,
  card_revoked: 403,
  insert_failed: 500,
};

export const TAP_FAILURE_MESSAGE: Record<TapFailureReason, string> = {
  unknown_card: "Unknown card.",
  wrong_studio: "This card isn't registered to this studio.",
  card_pending: "This card hasn't finished being issued yet.",
  card_frozen: "This card is frozen.",
  card_lost: "This card has been reported lost.",
  card_revoked: "This card has been revoked.",
  insert_failed: "Could not record the tap. Try again.",
};

export async function performTap(
  admin: SupabaseClient,
  params: { studioId: string; cardToken: string; direction?: string | null; readerKey?: string | null },
): Promise<TapResult> {
  const { data: card } = await admin
    .from("nfc_cards")
    .select("id, studio_id, student_id, status")
    .eq("token", params.cardToken)
    .maybeSingle();

  if (!card) return { ok: false, reason: "unknown_card" };
  if (card.studio_id !== params.studioId) return { ok: false, reason: "wrong_studio" };
  if (card.status !== "active") {
    return { ok: false, reason: STATUS_REASON[card.status] ?? "card_revoked" };
  }

  const { data: studio } = await admin
    .from("studios")
    .select("timezone")
    .eq("id", card.studio_id)
    .maybeSingle();
  const timezone = studio?.timezone ?? null;

  let direction: TapDirection;
  if (isTapDirection(params.direction)) {
    direction = params.direction;
  } else {
    const { data: lastTap } = await admin
      .from("building_taps")
      .select("direction, tapped_at")
      .eq("student_id", card.student_id)
      .order("tapped_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tappedToday =
      !!lastTap && studioLocalYmd(timezone, new Date(lastTap.tapped_at)) === studioLocalYmd(timezone);
    direction = nextDirection(tappedToday ? (lastTap!.direction as TapDirection) : null);
  }

  const { data: inserted, error } = await admin
    .from("building_taps")
    .insert({
      studio_id: card.studio_id,
      card_id: card.id,
      student_id: card.student_id,
      direction,
      reader_key: params.readerKey ?? null,
    })
    .select("tapped_at")
    .single();

  if (error || !inserted) return { ok: false, reason: "insert_failed" };

  return { ok: true, studentId: card.student_id, direction, tappedAt: inserted.tapped_at };
}
