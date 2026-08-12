// ============================================================================
//  The paywall gate.
//
//  `planAccessState` is a pure function over a subscription row, the studio's
//  operator status, and the current time. Same shape and same reason as
//  setupBlocksPortal (lib/setup/server.ts): the decision that locks a paying
//  customer out of their own admin should be exhaustively unit-testable
//  without a database.
//
//  ── It fails open, always
//  A missing row, an unreadable row, or a query error returns `ok`. Every
//  branch that could lock someone out requires positive evidence that they
//  should be locked out. The alternative — a Supabase blip taking every
//  studio's admin offline behind a "your trial has ended" screen — is a far
//  worse failure than a lapsed studio getting a few more hours of access.
//
//  ── Who this actually stops
//  Admin and office only. Teachers, parents and students keep working, and the
//  studio's public site, /join and /enrol stay up. An unpaid Olune bill is
//  between Olune and the studio owner; taking a parent's enrolment offline
//  mid-form makes Olune the villain in someone else's relationship.
// ============================================================================

import type { PlanKey, BillingInterval } from "./catalog";

/** The `studio_subscriptions` row shape the gate needs (0119). */
export type StudioSubscription = {
  studioId: string;
  planKey: PlanKey;
  billingInterval: BillingInterval;
  status: "trialing" | "active" | "past_due" | "canceled" | "comped";
  trialEndsAt: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  comped: boolean;
};

export type PlanAccessState =
  /** Paying, comped, or unresolvable — nothing to show, nothing to block. */
  | "ok"
  /** Trial running with more than TRIAL_WARNING_DAYS left. Banner only. */
  | "trialing"
  /** Trial nearly out. Louder banner, same access. */
  | "trial_ending"
  /** Admin and office are locked out until they subscribe. */
  | "locked";

export type PlanAccess = {
  state: PlanAccessState;
  /** Whole days until the trial ends. Null outside a trial. Floors at 0. */
  daysLeft: number | null;
  /** Why access was denied. Null unless `state === "locked"`. */
  reason: "trial_expired" | "payment_failed" | "canceled" | "suspended" | null;
  plan: PlanKey | null;
};

/** How close to the end of a trial the banner starts shouting. */
export const TRIAL_WARNING_DAYS = 3;

const DAY_MS = 86_400_000;

function daysBetween(from: Date, toIso: string): number | null {
  const to = Date.parse(toIso);
  if (Number.isNaN(to)) return null;
  return Math.max(0, Math.ceil((to - from.getTime()) / DAY_MS));
}

const OPEN: PlanAccess = { state: "ok", daysLeft: null, reason: null, plan: null };

/**
 * Resolve what a studio's admin is allowed to reach right now.
 *
 * @param sub          The studio_subscriptions row, or null if there isn't one
 *                     (or the read failed — the caller does not distinguish,
 *                     because both mean "no evidence to lock on").
 * @param studioStatus `studios.status` — the operator's manual suspend switch,
 *                     which predates plans and still wins over them.
 * @param now          Injected so the whole matrix is testable.
 */
export function planAccessState(
  sub: StudioSubscription | null,
  studioStatus: string | null,
  now: Date,
): PlanAccess {
  // The operator switch outranks billing. A studio suspended for abuse stays
  // suspended whether or not its card works.
  if (studioStatus === "suspended") {
    return { state: "locked", daysLeft: null, reason: "suspended", plan: sub?.planKey ?? null };
  }

  // No row, or an unreadable one. See the header: this is the fail-open path,
  // and it is also what every studio looked like before 0119 ran.
  if (!sub) return OPEN;

  const plan = sub.planKey;

  switch (sub.status) {
    case "comped":
    case "active":
      return { state: "ok", daysLeft: null, reason: null, plan };

    case "past_due":
      // Dunning and grace periods are a separate workstream. Until they exist,
      // a failed payment locks immediately rather than lingering as an
      // indefinite free account — the studio can fix the card through the
      // Stripe billing portal from the locked screen itself.
      return { state: "locked", daysLeft: null, reason: "payment_failed", plan };

    case "canceled":
      return { state: "locked", daysLeft: null, reason: "canceled", plan };

    case "trialing": {
      // The 0119 check constraint makes this unreachable from the database,
      // but the type allows it and a trial with no end date is a free account
      // by accident — treat it as open rather than guessing an expiry.
      if (!sub.trialEndsAt) return { state: "trialing", daysLeft: null, reason: null, plan };

      const endsAt = Date.parse(sub.trialEndsAt);
      if (Number.isNaN(endsAt)) return { state: "trialing", daysLeft: null, reason: null, plan };

      if (endsAt <= now.getTime()) {
        return { state: "locked", daysLeft: 0, reason: "trial_expired", plan };
      }

      const daysLeft = daysBetween(now, sub.trialEndsAt);
      return {
        state: daysLeft !== null && daysLeft <= TRIAL_WARNING_DAYS ? "trial_ending" : "trialing",
        daysLeft,
        reason: null,
        plan,
      };
    }

    default:
      // An unrecognised status is a schema change we haven't shipped code for.
      // Don't lock on it.
      return OPEN;
  }
}

export function isLocked(access: PlanAccess): boolean {
  return access.state === "locked";
}

/** Whether the portal should render a trial banner above the page. */
export function needsTrialBanner(access: PlanAccess): boolean {
  return access.state === "trialing" || access.state === "trial_ending";
}
