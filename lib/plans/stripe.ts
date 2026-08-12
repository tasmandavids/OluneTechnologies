// ============================================================================
//  Stripe for Olune's own subscription.
//
//  Runs on Olune's PLATFORM account — the same account and the same secret key
//  as everything else, but in the opposite direction. lib/stripe/customer.ts
//  creates a Customer for a *parent* being charged by a studio; this creates a
//  Customer for a *studio* being charged by Olune. Both live on the platform
//  account, so keeping them in separate tables and separate helpers is what
//  stops one being charged as the other.
//
//  Everything here takes a service-role client: studio_subscriptions is
//  read-only to `authenticated` by design (0119), because a studio admin who
//  could write their own row could set status = 'active' and walk through the
//  paywall.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { CURRENCY } from "@/lib/currency";
import type { BillingInterval, PlanKey } from "./catalog";

/**
 * The Stripe Price id for a plan and interval, from platform_plan_prices.
 *
 * Null means an operator has not filled this environment in yet. Callers must
 * surface that as a configuration problem rather than falling back to another
 * plan's price — charging someone the wrong amount is worse than an error.
 */
export async function resolvePriceId(
  admin: SupabaseClient,
  planKey: PlanKey,
  interval: BillingInterval,
): Promise<string | null> {
  const { data } = await admin
    .from("platform_plan_prices")
    .select("stripe_price_id")
    .eq("plan_key", planKey)
    .eq("billing_interval", interval)
    .eq("active", true)
    .maybeSingle();

  return (data?.stripe_price_id as string | null) ?? null;
}

/**
 * The studio's Customer on Olune's account, creating it on first use.
 *
 * Recorded on studio_subscriptions rather than studios so the entire billing
 * relationship lives in one row and cascades with it.
 */
export async function getOrCreateStudioBillingCustomer(
  admin: SupabaseClient,
  studioId: string,
): Promise<string> {
  const { data: existing } = await admin
    .from("studio_subscriptions")
    .select("stripe_customer_id")
    .eq("studio_id", studioId)
    .maybeSingle();

  const customerId = existing?.stripe_customer_id as string | null | undefined;
  if (customerId) return customerId;

  const { data: studio } = await admin
    .from("studios")
    .select("name, slug")
    .eq("id", studioId)
    .single();

  // The owner's email, so Stripe receipts and dunning mail reach a person
  // rather than a void. Oldest admin wins — that's the account creator.
  const { data: owner } = await admin
    .from("profiles")
    .select("email, full_name")
    .eq("studio_id", studioId)
    .eq("role", "admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const customer = await stripe.customers.create({
    name: (studio?.name as string | null) ?? undefined,
    email: (owner?.email as string | null) ?? undefined,
    metadata: {
      olune_billing: "studio_plan",
      studio_id: studioId,
      studio_slug: (studio?.slug as string | null) ?? "",
    },
  });

  await admin
    .from("studio_subscriptions")
    .update({ stripe_customer_id: customer.id })
    .eq("studio_id", studioId);

  return customer.id;
}

/**
 * The marker that tells the shared webhook this event is Olune's own billing
 * and not a studio charging a parent. Set on the Checkout Session AND on the
 * Subscription it creates, because the two arrive as separate events.
 */
export const OLUNE_BILLING_METADATA = "studio_plan";

export function studioPlanMetadata(studioId: string, planKey: PlanKey): Stripe.MetadataParam {
  return {
    olune_billing: OLUNE_BILLING_METADATA,
    studio_id: studioId,
    plan_key: planKey,
  };
}

export async function createPlanCheckoutSession(params: {
  admin: SupabaseClient;
  studioId: string;
  planKey: PlanKey;
  interval: BillingInterval;
  priceId: string;
  origin: string;
}): Promise<Stripe.Checkout.Session> {
  const customer = await getOrCreateStudioBillingCustomer(params.admin, params.studioId);
  const metadata = studioPlanMetadata(params.studioId, params.planKey);

  return stripe.checkout.sessions.create({
    mode: "subscription",
    customer,
    currency: CURRENCY,
    line_items: [{ price: params.priceId, quantity: 1 }],
    metadata,
    subscription_data: { metadata },
    // Landing back inside the portal rather than on a bare confirmation page:
    // by the time they return the webhook has usually already flipped the row,
    // so the plan page shows the real state.
    success_url: `${params.origin}/portal/admin/plan?checkout=success`,
    cancel_url: `${params.origin}/plan/locked?checkout=cancelled`,
    allow_promotion_codes: true,
    billing_address_collection: "auto",
  });
}

export async function createPlanBillingPortalSession(params: {
  customerId: string;
  origin: string;
}): Promise<Stripe.BillingPortal.Session> {
  return stripe.billingPortal.sessions.create({
    customer: params.customerId,
    return_url: `${params.origin}/portal/admin/plan`,
  });
}

/** Stripe subscription status → our narrower `studio_subscriptions.status`. */
export function planStatusFromStripe(
  stripeStatus: Stripe.Subscription.Status,
): "active" | "past_due" | "canceled" | "trialing" {
  switch (stripeStatus) {
    case "active":
      return "active";
    case "trialing":
      return "trialing";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
    case "paused":
      // Never collected a first payment, or explicitly paused. Neither is a
      // paying customer, and neither should look like one.
      return "past_due";
    default:
      return "past_due";
  }
}
