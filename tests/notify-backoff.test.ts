import { describe, it, expect } from "vitest";
import {
  MAX_DELIVERY_ATTEMPTS,
  nextAttemptAt,
  retriesExhausted,
} from "@/lib/notify/backoff";

const NOW = new Date("2026-08-07T09:00:00Z");

function minutesAfterNow(d: Date): number {
  return (d.getTime() - NOW.getTime()) / 60_000;
}

describe("nextAttemptAt", () => {
  it("spaces retries out instead of returning immediately", () => {
    // The regression this whole module exists to prevent: at a 5-minute cron
    // cadence, "retry next pass" would spend the entire budget inside a
    // 15-minute provider blip.
    expect(minutesAfterNow(nextAttemptAt(1, NOW)!)).toBe(5);
    expect(minutesAfterNow(nextAttemptAt(2, NOW)!)).toBe(20);
    expect(minutesAfterNow(nextAttemptAt(3, NOW)!)).toBe(60);
    expect(minutesAfterNow(nextAttemptAt(4, NOW)!)).toBe(180);
  });

  it("covers more than four hours of provider downtime in total", () => {
    // A 20-minute Resend outage must not exhaust the budget. Guards the
    // specific failure mode that made the cadence change unsafe.
    let total = 0;
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      total += minutesAfterNow(nextAttemptAt(attempt, NOW)!);
    }
    expect(total).toBeGreaterThan(240);
  });

  it("returns null once the budget is exhausted, so a dead row is not queued forever", () => {
    expect(nextAttemptAt(MAX_DELIVERY_ATTEMPTS, NOW)).toBeNull();
    expect(nextAttemptAt(99, NOW)).toBeNull();
  });

  it("keeps MAX_DELIVERY_ATTEMPTS in step with the schedule", () => {
    // Derived, not declared — adding a delay must extend the budget rather
    // than silently leaving an unreachable retry at the end of the schedule.
    expect(nextAttemptAt(MAX_DELIVERY_ATTEMPTS - 1, NOW)).not.toBeNull();
    expect(nextAttemptAt(MAX_DELIVERY_ATTEMPTS, NOW)).toBeNull();
  });

  it("always schedules strictly into the future", () => {
    for (let attempt = 1; attempt < MAX_DELIVERY_ATTEMPTS; attempt += 1) {
      expect(nextAttemptAt(attempt, NOW)!.getTime()).toBeGreaterThan(NOW.getTime());
    }
  });
});

describe("retriesExhausted", () => {
  it("is false while retries remain and true afterwards", () => {
    expect(retriesExhausted(1)).toBe(false);
    expect(retriesExhausted(MAX_DELIVERY_ATTEMPTS - 1)).toBe(false);
    expect(retriesExhausted(MAX_DELIVERY_ATTEMPTS)).toBe(true);
  });
});
