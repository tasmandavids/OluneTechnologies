import { describe, it, expect } from "vitest";
import {
  planAccessState,
  isLocked,
  needsTrialBanner,
  TRIAL_WARNING_DAYS,
  type StudioSubscription,
} from "@/lib/plans/gate";

const NOW = new Date("2026-08-11T00:00:00Z");

function days(n: number): string {
  return new Date(NOW.getTime() + n * 86_400_000).toISOString();
}

function sub(over: Partial<StudioSubscription> = {}): StudioSubscription {
  return {
    studioId: "00000000-0000-0000-0000-000000000001",
    planKey: "studio",
    billingInterval: "month",
    status: "active",
    trialEndsAt: null,
    stripeCustomerId: "cus_test",
    stripeSubscriptionId: "sub_test",
    currentPeriodEnd: days(20),
    cancelAtPeriodEnd: false,
    comped: false,
    ...over,
  };
}

describe("planAccessState — paying and comped studios", () => {
  it("lets an active subscription through", () => {
    const access = planAccessState(sub(), "active", NOW);
    expect(access.state).toBe("ok");
    expect(isLocked(access)).toBe(false);
  });

  it("never locks a comped studio, however old", () => {
    const access = planAccessState(
      sub({ status: "comped", comped: true, trialEndsAt: days(-900) }),
      "trial",
      NOW,
    );
    expect(access.state).toBe("ok");
  });

  it("keeps a studio that cancelled at period end running until it ends", () => {
    // Stripe leaves the subscription `active` until the period actually ends,
    // and only then sends customer.subscription.deleted. Locking on the flag
    // would cut them off weeks early, having already been paid for the time.
    const access = planAccessState(sub({ cancelAtPeriodEnd: true }), "active", NOW);
    expect(access.state).toBe("ok");
  });
});

describe("planAccessState — trials", () => {
  it("reports days remaining well before expiry", () => {
    const access = planAccessState(
      sub({ status: "trialing", trialEndsAt: days(10), stripeSubscriptionId: null }),
      "trial",
      NOW,
    );
    expect(access.state).toBe("trialing");
    expect(access.daysLeft).toBe(10);
    expect(needsTrialBanner(access)).toBe(true);
  });

  it("escalates inside the warning window", () => {
    const access = planAccessState(
      sub({ status: "trialing", trialEndsAt: days(TRIAL_WARNING_DAYS) }),
      "trial",
      NOW,
    );
    expect(access.state).toBe("trial_ending");
    expect(needsTrialBanner(access)).toBe(true);
  });

  it("locks the moment the trial is past", () => {
    const access = planAccessState(
      sub({ status: "trialing", trialEndsAt: days(-1) }),
      "trial",
      NOW,
    );
    expect(access.state).toBe("locked");
    expect(access.reason).toBe("trial_expired");
    expect(access.daysLeft).toBe(0);
  });

  it("locks exactly at the boundary rather than a moment after", () => {
    const access = planAccessState(
      sub({ status: "trialing", trialEndsAt: NOW.toISOString() }),
      "trial",
      NOW,
    );
    expect(access.state).toBe("locked");
  });

  it("does not lock a trial whose end date is missing or unparseable", () => {
    // The 0119 check constraint makes both unreachable from the database, but a
    // trial with no valid expiry is not evidence that the trial has ended.
    for (const trialEndsAt of [null, "not-a-date"]) {
      const access = planAccessState(sub({ status: "trialing", trialEndsAt }), "trial", NOW);
      expect(access.state).toBe("trialing");
      expect(isLocked(access)).toBe(false);
    }
  });
});

describe("planAccessState — lapses", () => {
  it("locks on a failed payment", () => {
    const access = planAccessState(sub({ status: "past_due" }), "active", NOW);
    expect(access.reason).toBe("payment_failed");
    expect(isLocked(access)).toBe(true);
  });

  it("locks on cancellation", () => {
    const access = planAccessState(sub({ status: "canceled" }), "active", NOW);
    expect(access.reason).toBe("canceled");
  });

  it("lets an operator suspension outrank a healthy subscription", () => {
    const access = planAccessState(sub({ status: "active" }), "suspended", NOW);
    expect(access.reason).toBe("suspended");
    expect(isLocked(access)).toBe(true);
  });

  it("still reports suspension when there is no subscription row at all", () => {
    const access = planAccessState(null, "suspended", NOW);
    expect(access.reason).toBe("suspended");
  });
});

describe("planAccessState — fails open", () => {
  // The whole reason gate.ts is a pure function: these are the cases where
  // getting it wrong takes a paying studio's admin offline over a database
  // hiccup, and they must be verifiable without a database.
  it("does not lock when the subscription row is missing or unreadable", () => {
    const access = planAccessState(null, "active", NOW);
    expect(access.state).toBe("ok");
    expect(access.reason).toBeNull();
  });

  it("does not lock a studio whose operator status is unknown", () => {
    expect(planAccessState(null, null, NOW).state).toBe("ok");
    expect(planAccessState(sub(), "trial", NOW).state).toBe("ok");
  });

  it("does not lock on a status this deploy does not recognise", () => {
    const future = sub({ status: "paused" as StudioSubscription["status"] });
    expect(planAccessState(future, "active", NOW).state).toBe("ok");
  });
});
