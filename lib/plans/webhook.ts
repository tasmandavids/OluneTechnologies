// ============================================================================
//  Olune's own billing, on the shared Stripe webhook.
//
//  ── The collision this file exists to prevent
//  /api/webhooks/stripe already handles `customer.subscription.*`,
//  `invoice.paid` and `invoice.payment_failed` — for PARENT subscriptions, a
//  studio charging a family on auto-pay. Olune charging a studio produces
//  events of exactly those types, on exactly that endpoint.
//
//  Today's handler happens to survive them: it looks the subscription up in
//  `subscriptions` by stripe id, finds nothing, and skips
//  (process-stripe-event.ts). But `invoice.paid` gets there by way of a branch
//  that MIRRORS the invoice into a studio's `invoices` and `payments` tables —
//  so the day that lookup changes shape, Olune's $59 subscription charge lands
//  in some studio's revenue reporting and syncs to their Xero ledger. Relying
//  on a near miss for that is not a plan.
//
//  So `isStudioPlanEvent` runs FIRST, and anything it claims never reaches the
//  parent-billing code at all.
//
//  ── How an event is identified
//  Metadata first (we set `olune_billing: "studio_plan"` on the Checkout
//  Session, the Subscription and therefore its Invoices), then a database
//  lookup by subscription or customer id. The database check is the one that
//  matters: metadata placement shifts between Stripe API versions, but a
//  `studio_subscriptions` row carrying that stripe id is unambiguous.
// ============================================================================

import { revalidateTag } from "next/cache";
import type Stripe from "stripe";
import type { ServiceSupabase } from "@/lib/webhooks/service-supabase";
import { entitlementsTag } from "@/lib/portal/entitlements";
import { subscriptionPeriodEndIso } from "@/lib/webhooks/stripe-events";
import { isPlanKey, type PlanKey } from "./catalog";
import { OLUNE_BILLING_METADATA, planStatusFromStripe } from "./stripe";

/** Event types that could belong to either side of the platform account. */
export const SHARED_EVENT_TYPES: readonly string[] = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed",
] as const;

type WithMetadata = { metadata?: Stripe.Metadata | null };

function metadataSaysOlune(obj: unknown): boolean {
  const meta = (obj as WithMetadata | null)?.metadata;
  return meta?.olune_billing === OLUNE_BILLING_METADATA;
}

function expandedId(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "id" in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** Subscription id and customer id off any of the shared event shapes. */
function stripeIdsFor(event: Stripe.Event): { subscriptionId: string | null; customerId: string | null } {
  const obj = event.data.object as unknown as Record<string, unknown>;

  if (event.type.startsWith("customer.subscription.")) {
    return { subscriptionId: expandedId(obj.id), customerId: expandedId(obj.customer) };
  }
  // Checkout Sessions and Invoices both carry `subscription` + `customer`.
  return { subscriptionId: expandedId(obj.subscription), customerId: expandedId(obj.customer) };
}

/**
 * Is this event Olune billing a studio, rather than a studio billing a parent?
 *
 * Returns the studio id when it is, null when it isn't. A null answer sends
 * the event on to the normal parent-billing path untouched.
 */
export async function studioForPlanEvent(
  event: Stripe.Event,
  supabase: ServiceSupabase,
): Promise<string | null> {
  const obj = event.data.object as unknown as Record<string, unknown>;

  // 1. Our own marker, wherever Stripe put it on this object.
  if (metadataSaysOlune(obj)) {
    const studioId = (obj as WithMetadata).metadata?.studio_id;
    if (typeof studioId === "string" && studioId) return studioId;
  }
  // Invoices carry the subscription's metadata under subscription_details on
  // recent API versions rather than on the invoice itself.
  const details = obj.subscription_details as WithMetadata | undefined;
  if (metadataSaysOlune(details)) {
    const studioId = details?.metadata?.studio_id;
    if (typeof studioId === "string" && studioId) return studioId;
  }

  // 2. The authoritative check: do we have a row holding this stripe id?
  const { subscriptionId, customerId } = stripeIdsFor(event);

  if (subscriptionId) {
    const { data } = await supabase
      .from("studio_subscriptions")
      .select("studio_id")
      .eq("stripe_subscription_id", subscriptionId)
      .maybeSingle();
    if (data?.studio_id) return data.studio_id as string;
  }

  if (customerId) {
    const { data } = await supabase
      .from("studio_subscriptions")
      .select("studio_id")
      .eq("stripe_customer_id", customerId)
      .maybeSingle();
    if (data?.studio_id) return data.studio_id as string;
  }

  return null;
}

type PlanUpdate = {
  status?: "trialing" | "active" | "past_due" | "canceled";
  plan_key?: PlanKey;
  billing_interval?: "month" | "year";
  stripe_subscription_id?: string;
  stripe_customer_id?: string;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean;
  trial_ends_at?: string | null;
};

async function applyUpdate(
  supabase: ServiceSupabase,
  studioId: string,
  update: PlanUpdate,
): Promise<void> {
  const { error } = await supabase
    .from("studio_subscriptions")
    .update(update)
    .eq("studio_id", studioId);

  if (error) {
    // Throwing returns a 5xx, which makes Stripe retry — the right outcome for
    // a write that failed. The idempotency ledger in the route makes the retry
    // safe to replay.
    throw new Error(`studio_subscriptions update failed for ${studioId}: ${error.message}`);
  }

  // Modules are gated on plan_key, and entitlements are cached for 5 minutes.
  // Without this a studio that just paid for `scale` keeps seeing the smaller
  // nav until the cache expires.
  revalidateTag(entitlementsTag(studioId));
}

function planKeyFrom(sub: Stripe.Subscription): PlanKey | undefined {
  const fromMetadata = sub.metadata?.plan_key;
  return isPlanKey(fromMetadata) ? fromMetadata : undefined;
}

function intervalFrom(sub: Stripe.Subscription): "month" | "year" | undefined {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === "month" || interval === "year" ? interval : undefined;
}

/**
 * Apply one Olune-billing event to the studio's subscription row.
 *
 * Every branch is a full restatement of the row's billing fields rather than a
 * delta, so out-of-order delivery converges on the truth instead of compounding.
 */
export async function handleStudioPlanEvent(
  event: Stripe.Event,
  studioId: string,
  supabase: ServiceSupabase,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const subscriptionId = expandedId(session.subscription);
      const customerId = expandedId(session.customer);

      // Record the ids now so the customer.subscription.* events that follow
      // can be matched by lookup even if their metadata is missing. Status is
      // deliberately left to those events — the session completing is not
      // proof the first payment cleared.
      await applyUpdate(supabase, studioId, {
        ...(subscriptionId ? { stripe_subscription_id: subscriptionId } : {}),
        ...(customerId ? { stripe_customer_id: customerId } : {}),
      });
      console.log(`[plans] checkout completed — studio ${studioId}`);
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const planKey = planKeyFrom(sub);
      const interval = intervalFrom(sub);

      await applyUpdate(supabase, studioId, {
        status: planStatusFromStripe(sub.status),
        stripe_subscription_id: sub.id,
        current_period_end: subscriptionPeriodEndIso(sub),
        cancel_at_period_end: !!sub.cancel_at_period_end,
        // Stripe's own trial, when a plan is sold with one. Our signup trial
        // has no Stripe subscription behind it, so this never overwrites it.
        trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
        ...(planKey ? { plan_key: planKey } : {}),
        ...(interval ? { billing_interval: interval } : {}),
      });
      console.log(`[plans] ${event.type} — studio ${studioId} → ${sub.status}`);
      break;
    }

    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await applyUpdate(supabase, studioId, {
        status: "canceled",
        cancel_at_period_end: false,
        current_period_end: subscriptionPeriodEndIso(sub),
      });
      console.log(`[plans] subscription deleted — studio ${studioId} locked`);
      break;
    }

    case "invoice.paid": {
      // The subscription events carry the authoritative status; this exists so
      // a renewal reinstates a studio immediately rather than waiting for the
      // matching customer.subscription.updated to arrive.
      await applyUpdate(supabase, studioId, { status: "active" });
      console.log(`[plans] invoice paid — studio ${studioId} active`);
      break;
    }

    case "invoice.payment_failed": {
      await applyUpdate(supabase, studioId, { status: "past_due" });
      console.log(`[plans] invoice payment failed — studio ${studioId} past_due`);
      break;
    }

    default:
      console.log(`[plans] ${event.type} claimed for studio ${studioId} but not handled`);
  }
}
