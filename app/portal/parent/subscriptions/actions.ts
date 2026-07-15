"use server";

// ============================================================================
//  Parent auto-pay subscription server actions (Phase 3.2)
//  Creates a recurring monthly Stripe Subscription for an enrolled class and
//  mirrors it into public.subscriptions. The customer.subscription.* webhooks
//  keep the row's status / period in sync after creation.
// ============================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { siblingDiscountInfo } from "@/lib/discounts";
import { monthlyFromTermFeeCents } from "@/lib/term-payments";
import { getOrCreateClassStripePrice } from "@/lib/stripe/class-price";
import { getOrCreateStripeCustomer } from "@/lib/stripe/customer";
import { resolveTransferData } from "@/lib/stripe/connect";
import type Stripe from "stripe";

const uuidField = z.string().uuid();

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function getParentContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", supabase, userId: null, studioId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "parent") {
    return { error: "Parent access required.", supabase, userId: null, studioId: null };
  }

  return { error: null, supabase, userId: user.id, studioId: profile.studio_id as string };
}

// Robustly pull a PaymentElement client secret from a freshly-created
// default_incomplete subscription's latest invoice — tolerant of the
// confirmation_secret (2025+) and legacy payment_intent invoice shapes.
function clientSecretFromSubscription(sub: Stripe.Subscription): string | null {
  const invoice = sub.latest_invoice;
  if (!invoice || typeof invoice === "string") return null;

  const inv = invoice as Stripe.Invoice & {
    confirmation_secret?: { client_secret?: string | null } | null;
    payment_intent?: string | Stripe.PaymentIntent | null;
  };

  if (inv.confirmation_secret?.client_secret) return inv.confirmation_secret.client_secret;
  if (inv.payment_intent && typeof inv.payment_intent !== "string") {
    return inv.payment_intent.client_secret ?? null;
  }
  return null;
}

function periodEndFromSubscription(sub: Stripe.Subscription): string | null {
  const s = sub as Stripe.Subscription & { current_period_end?: number | null };
  const epoch =
    s.current_period_end ??
    (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end ??
    null;
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}


// Return a reusable forever percent-off coupon id for the given whole-number
// percentage, creating it on first use. Stable id so we don't accumulate
// duplicate coupons across families/charges.
async function getOrCreatePercentCoupon(stripe: Stripe, pct: number): Promise<string> {
  const id = `olune-sibling-${pct}pct`;
  try {
    await stripe.coupons.retrieve(id);
    return id;
  } catch {
    const coupon = await stripe.coupons.create({
      id,
      percent_off: pct,
      duration: "forever",
      name: `Sibling discount ${pct}%`,
    });
    return coupon.id;
  }
}

export async function createEnrollmentSubscription(
  studentId: string,
  classId: string,
  className: string,
  priceCents: number,
): Promise<ActionResult<{ clientSecret: string; subscriptionId: string }>> {
  const { error, supabase, userId, studioId } = await getParentContext();
  if (error || !userId || !studioId) return { ok: false, error: error ?? "Unknown" };
  if (!uuidField.safeParse(studentId).success || !uuidField.safeParse(classId).success) {
    return { ok: false, error: "Invalid student or class." };
  }
  if (priceCents <= 0) return { ok: false, error: "Class has no recurring fee." };

  // Verify guardian relationship.
  const { data: guardianship } = await supabase
    .from("guardianships")
    .select("guardian_id")
    .eq("guardian_id", userId)
    .eq("student_id", studentId)
    .single();
  if (!guardianship) return { ok: false, error: "You are not a guardian of this student." };

  // A programme (e.g. "Intermediate") can run on multiple days as separate
  // class rows, but the family only pays once per programme — mirrors the
  // enrollment invoicing rule in lib/enrollment-billing.ts. Block a second
  // live subscription for the same programme, however it was reached.
  const { data: existingSubs } = await supabase
    .from("subscriptions")
    .select("class_id, status, classes(name)")
    .eq("student_id", studentId)
    .in("status", ["active", "trialing", "past_due", "incomplete"]);
  const target = className.trim().toLowerCase().replace(/\s+/g, " ");
  const alreadySubscribed = (existingSubs ?? []).some((s) => {
    if (s.class_id === classId) return false;
    const clsName = (s.classes as { name: string } | { name: string }[] | null);
    const name = Array.isArray(clsName) ? clsName[0]?.name : clsName?.name;
    return name && name.trim().toLowerCase().replace(/\s+/g, " ") === target;
  });
  if (alreadySubscribed) {
    return { ok: false, error: "This dancer already has auto-pay set up for this programme." };
  }

  // Resolve / create the Stripe customer.
  const { stripe } = await import("@/lib/stripe");
  const customerId = await getOrCreateStripeCustomer(supabase, userId, studioId);

  // Class fees are quoted as a full-term total; auto-pay spreads it over the
  // same 3 monthly installments as the manual plan, so the recurring charge is
  // the per-installment amount — not the whole term fee.
  const monthlyCents = monthlyFromTermFeeCents(priceCents);

  // Sibling / family discount (Phase 3.3) — applied to recurring auto-pay too.
  // Reusable per-class Prices are immutable, so the family discount is applied
  // via a Stripe coupon rather than by changing the Price.
  const discount = await siblingDiscountInfo(supabase, studioId, userId, studentId, monthlyCents);

  // Create the recurring subscription against a REUSABLE Stripe Price for this
  // class (one Product + Price per class, cached on the classes row) instead of
  // minting a throwaway Product on every subscription.
  let sub: Stripe.Subscription;
  try {
    const priceId = await getOrCreateClassStripePrice(
      classId,
      studioId,
      className,
      monthlyCents,
    );

    const couponId = discount.applies
      ? await getOrCreatePercentCoupon(stripe, discount.pct)
      : null;

    sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: {
        studio_id: studioId,
        supabase_user_id: userId,
        student_id: studentId,
        class_id: classId,
      },
      transfer_data: await resolveTransferData(supabase, studioId),
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stripe error" };
  }

  const clientSecret = clientSecretFromSubscription(sub);
  if (!clientSecret) {
    return { ok: false, error: "Stripe did not return a client secret for the first invoice." };
  }

  // Mirror into our subscriptions table (status synced later by webhook).
  await supabase.from("subscriptions").insert({
    studio_id:              studioId,
    payer_id:               userId,
    student_id:             studentId,
    class_id:               classId,
    stripe_subscription_id: sub.id,
    stripe_customer_id:     customerId,
    plan_label:             discount.applies
                              ? `${className} — monthly (${discount.pct}% sibling discount)`
                              : `${className} — monthly`,
    amount_cents:           discount.discountedCents,
    currency: CURRENCY,
    interval:               "month",
    status:                 sub.status,
    current_period_end:     periodEndFromSubscription(sub),
    cancel_at_period_end:   sub.cancel_at_period_end ?? false,
  });

  revalidatePath("/portal/parent");
  return { ok: true, data: { clientSecret, subscriptionId: sub.id } };
}

// Cancel auto-pay at period end (parent-initiated).
export async function cancelSubscription(subscriptionId: string): Promise<ActionResult> {
  const { error, supabase, userId } = await getParentContext();
  if (error || !userId) return { ok: false, error: error ?? "Unknown" };

  // Ensure the caller owns this subscription.
  const { data: row } = await supabase
    .from("subscriptions")
    .select("id, stripe_subscription_id, payer_id")
    .eq("stripe_subscription_id", subscriptionId)
    .single();
  if (!row || row.payer_id !== userId) {
    return { ok: false, error: "Subscription not found." };
  }

  const { stripe } = await import("@/lib/stripe");
  try {
    await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stripe error" };
  }

  await supabase
    .from("subscriptions")
    .update({ cancel_at_period_end: true })
    .eq("stripe_subscription_id", subscriptionId);

  revalidatePath("/portal/parent");
  return { ok: true, data: null };
}
