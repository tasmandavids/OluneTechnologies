// ============================================================================
//  Stripe v2 (thin) event processor — studio Connect account status.
//
//  Why this exists separately from process-stripe-event.ts:
//
//  Studio accounts are Accounts v2 (see lib/stripe/connect.ts). Their status
//  changes are announced as `v2.core.account[configuration.merchant]
//  .capability_status_updated` and friends, and a CLASSIC webhook endpoint
//  cannot subscribe to those — the API rejects the event names outright. They
//  are delivered to an Event Destination instead, whose payload is a *thin*
//  notification: an id, a type, and a `related_object` pointer. There is no
//  `data.object`. Nothing in the v1 processor's shape applies, which is why
//  this is its own function rather than another `case` over there.
//
//  The gap it closes: before this, a studio's status refreshed only on return
//  from onboarding and via the manual button on /portal/admin/payments. If
//  Stripe restricted an already-onboarded studio later — expired director ID,
//  a review, a capability revoked — Olune went on believing that studio was
//  chargeable. Charges then fail at the till, in front of a parent, while the
//  admin dashboard still shows green.
//
//  Thin payloads mean every handler here re-reads the account from Stripe
//  rather than trusting the notification. That is the intended v2 flow: the
//  notification says "something changed on acct_X", `syncStripeAccountStatus`
//  goes and finds out what.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import { syncStripeAccountStatus } from "@/lib/stripe/connect";
import { reportHandledMessage } from "@/lib/observability/report";

/**
 * Account events this integration acts on.
 *
 * `configuration.merchant` is the only configuration Olune creates
 * (STUDIO_ACCOUNT_CONFIGURATIONS) — the customer and recipient variants of
 * these events can never fire for our accounts, so subscribing to them would
 * only add noise. `[requirements].updated` is included because that is how a
 * document expiry announces itself *before* the capability flips: it is the
 * early warning, and capability_status_updated is the damage.
 */
export const V2_ACCOUNT_EVENT_TYPES = [
  "v2.core.account.updated",
  "v2.core.account.closed",
  "v2.core.account[configuration.merchant].updated",
  "v2.core.account[configuration.merchant].capability_status_updated",
  "v2.core.account[requirements].updated",
] as const;

/**
 * What the Event Destination subscribes to — the account events plus the ping
 * Stripe sends on demand. The ping is what makes the destination testable
 * without waiting for a real studio to have a bad day; keep it subscribed.
 */
export const V2_DESTINATION_EVENT_TYPES = [
  ...V2_ACCOUNT_EVENT_TYPES,
  "v2.core.event_destination.ping",
] as const;

/**
 * The subset of an EventNotification this processor reads.
 *
 * Deliberately structural rather than Stripe's `V2.Core.EventNotification`
 * union: that union is closed over the event types the installed SDK knew
 * about at generation time, and an unrecognised type arrives as
 * `UnknownEventNotification`. Narrowing on `type` as a plain string lets a new
 * event name reach the `default` branch and be ignored politely instead of
 * failing to compile the day Stripe adds one.
 */
export type StripeV2Notification = {
  id: string;
  type: string;
  related_object?: { id: string; type: string; url?: string } | null;
};

export type V2EventOutcome = {
  handled: boolean;
  /** Connect account the event concerned, when it named one. */
  accountId?: string;
  /** Short description for the route's log line. */
  detail: string;
};

/** True when the notification points at a v2 Account. */
function accountIdOf(notification: StripeV2Notification): string | null {
  const related = notification.related_object;
  if (!related?.id) return null;
  // Every account event's related_object is the account itself. Guard on the
  // id shape too so a future event type carrying some other object cannot be
  // fed to syncStripeAccountStatus by accident.
  if (!related.id.startsWith("acct_")) return null;
  return related.id;
}

/**
 * Mark a closed account unchargeable without asking Stripe about it.
 *
 * `v2.core.account.closed` is the one case where re-reading is the wrong move:
 * the account is gone, the retrieve may 404, and the answer is already known.
 * Writing the columns directly keeps a closed studio from lingering as
 * chargeable because a sync threw.
 */
async function markClosed(
  supabase: SupabaseClient,
  stripeAccountId: string,
): Promise<boolean> {
  const now = new Date().toISOString();
  const { data } = await supabase
    .from("stripe_connect_accounts")
    .update({
      charges_enabled: false,
      payouts_enabled: false,
      disabled_reason: "closed",
      last_synced_at: now,
      updated_at: now,
    })
    .eq("stripe_account_id", stripeAccountId)
    .select("id")
    .maybeSingle();
  return Boolean(data);
}

/**
 * Handle one v2 event notification.
 *
 * Returns rather than throws for events we do not act on, so the route can
 * answer 200 and stop Stripe retrying something that will never be handled.
 * Genuine failures (Stripe unreachable, database down) still throw — those
 * SHOULD be retried.
 */
export async function processStripeV2Event(
  notification: StripeV2Notification,
  supabase: SupabaseClient,
): Promise<V2EventOutcome> {
  const { type } = notification;

  if (type === "v2.core.event_destination.ping") {
    return { handled: true, detail: "ping" };
  }

  if (!(V2_ACCOUNT_EVENT_TYPES as readonly string[]).includes(type)) {
    return { handled: false, detail: `unhandled type ${type}` };
  }

  const accountId = accountIdOf(notification);
  if (!accountId) {
    return { handled: false, detail: "no account in related_object" };
  }

  if (type === "v2.core.account.closed") {
    const tracked = await markClosed(supabase, accountId);
    return {
      handled: true,
      accountId,
      detail: tracked ? "account closed → unchargeable" : "not tracked, ignored",
    };
  }

  // What Olune believed a moment ago, so a studio losing the ability to charge
  // can be reported rather than only written down. The read is cheap and the
  // transition is the entire point of this endpoint existing.
  const { data: before } = await supabase
    .from("stripe_connect_accounts")
    .select("studio_id, charges_enabled")
    .eq("stripe_account_id", accountId)
    .maybeSingle();

  if (!before) {
    // An account Olune does not track — a leftover from a deleted studio, or
    // another integration on the same platform account.
    return { handled: false, accountId, detail: "not tracked, ignored" };
  }

  const updated = await syncStripeAccountStatus(supabase, accountId);
  if (!updated) {
    return { handled: false, accountId, detail: "sync returned no row" };
  }

  const wasChargeable = before.charges_enabled === true;
  if (wasChargeable && !updated.charges_enabled) {
    // Loud on purpose. This is a studio that could take money a minute ago and
    // cannot now; every checkout it serves from here on will fail, and nobody
    // finds out from a console.log in a serverless function.
    await reportHandledMessage(
      `Stripe restricted a studio's Connect account — payments are now failing`,
      {
        route: "webhook.stripe-v2",
        tags: { reason: "charges-disabled" },
        extra: {
          stripeAccountId: accountId,
          studioId: before.studio_id,
          disabledReason: updated.disabled_reason,
          eventType: type,
        },
      },
    );
  }

  return {
    handled: true,
    accountId,
    detail:
      `charges_enabled ${wasChargeable} → ${updated.charges_enabled}` +
      (updated.disabled_reason ? ` (${updated.disabled_reason})` : ""),
  };
}
