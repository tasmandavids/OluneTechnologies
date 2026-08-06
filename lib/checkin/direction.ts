// ============================================================================
//  lib/checkin/direction.ts
//
//  PURE toggle logic — no IO, unit-testable in isolation (same rationale as
//  lib/notify/messages.ts). A reader can always send an explicit direction
//  (a two-button kiosk, or an end-of-day "mark everyone out" sweep); when it
//  doesn't, the tap alternates off the student's last tap *today* — a tap
//  left over from a previous day (forgot to tap out) doesn't flip today's
//  first tap to "out".
// ============================================================================

export type TapDirection = "in" | "out";

export function isTapDirection(value: unknown): value is TapDirection {
  return value === "in" || value === "out";
}

/**
 * @param lastDirectionToday The direction of the student's most recent tap
 *   *today* in studio-local time, or null if they haven't tapped today.
 */
export function nextDirection(lastDirectionToday: TapDirection | null): TapDirection {
  if (lastDirectionToday === null) return "in";
  return lastDirectionToday === "in" ? "out" : "in";
}
