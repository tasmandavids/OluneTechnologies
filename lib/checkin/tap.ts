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
import { applyStaffTapToClock, type ClockOutcome } from "@/lib/timeclock/nfc";

export type TapFailureReason =
  | "unknown_card"
  | "wrong_studio"
  | "card_pending"
  | "card_frozen"
  | "card_lost"
  | "card_revoked"
  | "insert_failed";

export type TapResult =
  | {
      ok: true;
      studentId: string;
      direction: TapDirection;
      tappedAt: string;
      /** 'staff' taps also move the timesheet — see `clock`. */
      cardKind: CardKind;
      /**
       * Timesheet outcome for a staff tap, null for a student tap.
       *
       * Present even when the clock write failed: the tap itself succeeded and
       * the person is on the safety register either way. A reader UI shows this
       * as secondary information, never as a tap failure.
       */
      clock: ClockOutcome | null;
    }
  | { ok: false; reason: TapFailureReason };

export type CardKind = "student" | "staff";

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
    .select("id, studio_id, student_id, status, card_kind")
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

  // The safety register is now written and the tap has succeeded. Everything
  // below is additive: a staff card also moves the timesheet, and a failure
  // there must not turn a successful tap into a failed one — see
  // lib/timeclock/nfc.ts.
  const cardKind: CardKind = card.card_kind === "staff" ? "staff" : "student";
  let clock: ClockOutcome | null = null;
  if (cardKind === "staff") {
    // Caught, not propagated. The tap row above is already committed — letting
    // a timesheet error escape would return a failure for a tap that WAS
    // recorded, and the door reader would tell someone standing in the building
    // that they aren't checked in.
    try {
      clock = await applyStaffTapToClock(admin, {
        studioId: card.studio_id,
        staffId: card.student_id,
        direction,
        timezone,
        at: new Date(inserted.tapped_at),
      });
    } catch {
      clock = "failed";
    }
  }

  return {
    ok: true,
    studentId: card.student_id,
    direction,
    tappedAt: inserted.tapped_at,
    cardKind,
    clock,
  };
}
