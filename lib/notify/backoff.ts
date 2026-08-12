// ============================================================================
//  lib/notify/backoff.ts
//
//  Retry schedule for outbound notification delivery.
//
//  Before the cadence change these numbers didn't exist: deliver-notifications
//  ran daily and retried "next pass", so three attempts happened to span three
//  days. At a 5-minute cadence that same code would spend every retry inside a
//  quarter of an hour and give up on a provider blip. The schedule below is the
//  explicit version of what the daily cron was accidentally providing — enough
//  wall-clock coverage to outlast a real Resend/Twilio incident — without
//  making a genuinely undeliverable row sit in the queue forever.
//
//  Kept as a pure function in its own module so the schedule is unit-testable
//  without standing up a cron, a database, or a provider.
// ============================================================================

/**
 * Minutes to wait before attempt N+1, indexed by the number of attempts already
 * made. Cumulative coverage ≈ 4h20m, which comfortably outlasts the median
 * provider incident while still surfacing a genuinely dead row the same day.
 */
const RETRY_DELAYS_MINUTES = [5, 20, 60, 180] as const;

/**
 * Attempts after which a row is abandoned (marked delivered, last error kept).
 * Deriving this from the schedule rather than declaring it separately means the
 * two can't drift — adding a delay extends the retry budget by construction.
 */
export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;

/**
 * When the next delivery attempt becomes eligible, given how many have already
 * been made.
 *
 * Returns `null` when the budget is exhausted — the caller marks the row
 * delivered rather than scheduling a retry it will never make.
 *
 * @param attempts Attempts made *including* the one that just failed (1-based).
 * @param now      Injectable for tests.
 */
export function nextAttemptAt(attempts: number, now: Date = new Date()): Date | null {
  // attempts is 1-based, the table is 0-based: after the 1st failure we want
  // the 1st delay.
  const delayMinutes = RETRY_DELAYS_MINUTES[attempts - 1];
  if (delayMinutes === undefined) return null;
  return new Date(now.getTime() + delayMinutes * 60_000);
}

/** True when `attempts` has exhausted the retry budget. */
export function retriesExhausted(attempts: number): boolean {
  return nextAttemptAt(attempts) === null;
}
