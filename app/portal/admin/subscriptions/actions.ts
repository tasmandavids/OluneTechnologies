"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { CURRENCY } from "@/lib/currency";
import { stripe } from "@/lib/stripe";
import {
  chargeAmountCents,
  intervalLabel,
  monthlyAmountCents,
  stripeRecurring,
  type BillingInterval,
  type SubscriptionLineInput,
} from "@/lib/subscriptions/pricing";
import type Stripe from "stripe";
import { getTranslations } from "@/lib/i18n/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function getAdminStudio() {
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: t("notSignedIn"), supabase, studioId: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") return { error: t("adminOnly"), supabase, studioId: null };
  if (!profile.studio_id) return { error: t("noStudioFound"), supabase, studioId: null };

  return { error: null, supabase, studioId: profile.studio_id as string };
}

function periodEndFromSubscription(sub: Stripe.Subscription): string | null {
  const s = sub as Stripe.Subscription & { current_period_end?: number | null };
  const epoch =
    s.current_period_end ??
    (sub.items?.data?.[0] as { current_period_end?: number } | undefined)?.current_period_end ??
    null;
  return epoch ? new Date(epoch * 1000).toISOString() : null;
}

async function ensureStripeCustomer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payerId: string,
  studioId: string,
) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("stripe_customer_id, full_name, email")
    .eq("id", payerId)
    .single();

  let customerId = profile?.stripe_customer_id as string | null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile?.email ?? undefined,
      name: (profile?.full_name as string | null) ?? undefined,
      metadata: { supabase_user_id: payerId, studio_id: studioId },
    });
    customerId = customer.id;
    await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", payerId);
  }
  return customerId;
}

const LineSchema = z.object({
  itemType: z.enum(["class", "product", "discount", "adjustment"]),
  referenceId: z.string().uuid().optional(),
  description: z.string().min(1).max(200),
  quantity: z.number().int().positive().max(99),
  unitMonthlyCents: z.number().int(),
});

const CreateSubscriptionSchema = z.object({
  payerId: z.string().uuid(),
  studentId: z.string().uuid().optional(),
  billingInterval: z.enum(["week", "fortnight", "month"]),
  planLabel: z.string().max(120).optional(),
  lines: z.array(LineSchema).min(1),
  sendToParent: z.boolean().default(true),
});

export type CreateAdminSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>;

export async function createAdminSubscription(
  input: CreateAdminSubscriptionInput,
): Promise<
  | { ok: true; subscriptionId: string; monthlyCents: number; chargeCents: number }
  | { ok: false; error: string }
> {
  const t = await getTranslations("errors.actions");
  const parsed = CreateSubscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: t("invalidSubscriptionDetails") };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { payerId, studentId, billingInterval, planLabel, lines, sendToParent } = parsed.data;
  const monthlyCents = monthlyAmountCents(lines as SubscriptionLineInput[]);
  if (monthlyCents <= 0) {
    return { ok: false, error: t("monthlyTotalInvalid") };
  }

  const chargeCents = chargeAmountCents(monthlyCents, billingInterval as BillingInterval);
  if (chargeCents <= 0) return { ok: false, error: t("chargeAmountInvalid") };

  const { data: payer } = await supabase
    .from("profiles")
    .select("id, full_name")
    .eq("id", payerId)
    .eq("studio_id", studioId)
    .single();
  if (!payer) return { ok: false, error: t("parentNotFound") };

  if (studentId) {
    const { data: link } = await supabase
      .from("guardianships")
      .select("guardian_id")
      .eq("guardian_id", payerId)
      .eq("student_id", studentId)
      .maybeSingle();
    if (!link) return { ok: false, error: t("studentNotLinkedToParent") };
  }

  const label =
    planLabel?.trim() ||
    `${payer.full_name ?? "Family"} — ${intervalLabel(billingInterval as BillingInterval)} plan`;

  let customerId: string;
  try {
    customerId = await ensureStripeCustomer(supabase, payerId, studioId);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe customer error" };
  }

  let stripeSub: Stripe.Subscription;
  try {
    const product = await stripe.products.create({
      name: label,
      metadata: { studio_id: studioId, admin_created: "true" },
    });

    const recurring = stripeRecurring(billingInterval as BillingInterval);
    const price = await stripe.prices.create({
      product: product.id,
      currency: CURRENCY,
      unit_amount: chargeCents,
      recurring,
      metadata: { studio_id: studioId, billing_interval: billingInterval },
    });

    stripeSub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.confirmation_secret"],
      metadata: {
        studio_id: studioId,
        payer_id: payerId,
        student_id: studentId ?? "",
        admin_created: "true",
        monthly_amount_cents: String(monthlyCents),
      },
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Stripe subscription error" };
  }

  const discountTotal = lines
    .filter((l) => l.itemType === "discount" || l.unitMonthlyCents < 0)
    .reduce((s, l) => s + Math.abs(l.quantity * l.unitMonthlyCents), 0);

  const { data: subRow, error: subErr } = await supabase
    .from("subscriptions")
    .insert({
      studio_id: studioId,
      payer_id: payerId,
      student_id: studentId ?? null,
      class_id: null,
      stripe_subscription_id: stripeSub.id,
      stripe_customer_id: customerId,
      plan_label: label,
      amount_cents: chargeCents,
      monthly_amount_cents: monthlyCents,
      discount_cents: discountTotal,
      billing_interval: billingInterval,
      admin_created: true,
      currency: CURRENCY,
      interval: billingInterval,
      status: stripeSub.status,
      current_period_end: periodEndFromSubscription(stripeSub),
      cancel_at_period_end: stripeSub.cancel_at_period_end ?? false,
    })
    .select("id")
    .single();

  if (subErr || !subRow) {
    return { ok: false, error: subErr?.message ?? t("couldNotSaveSubscription") };
  }

  const subscriptionId = subRow.id as string;
  await supabase.from("subscription_line_items").insert(
    lines.map((line, idx) => ({
      subscription_id: subscriptionId,
      item_type: line.itemType,
      reference_id: line.referenceId ?? null,
      description: line.description,
      quantity: line.quantity,
      unit_monthly_cents: line.unitMonthlyCents,
      line_total_cents: line.quantity * line.unitMonthlyCents,
      sort_order: idx,
    })),
  );

  if (sendToParent) {
    const amount = (monthlyCents / 100).toFixed(2);
    await supabase.from("notifications").insert({
      studio_id: studioId,
      user_id: payerId,
      type: "subscription_sent",
      title: "New subscription plan from your studio",
      body: `${label} — $${amount}/month (${intervalLabel(billingInterval as BillingInterval)} payments). Set up auto-pay in Olune.`,
      link: "/portal/parent",
      payload: {
        subscription_id: subscriptionId,
        stripe_subscription_id: stripeSub.id,
        monthly_amount_cents: monthlyCents,
      },
    });
  }

  revalidatePath("/portal/admin/subscriptions");
  revalidatePath("/portal/admin/billing");
  revalidatePath("/portal/parent");
  return { ok: true, subscriptionId, monthlyCents, chargeCents };
}

export async function adminCancelSubscription(
  stripeSubscriptionId: string,
  immediate = false,
): Promise<ActionResult> {
  const t = await getTranslations("errors.actions");
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? t("unknown") };

  const { data: row } = await supabase
    .from("subscriptions")
    .select("id, studio_id, stripe_subscription_id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .single();
  if (!row || row.studio_id !== studioId) {
    return { ok: false, error: t("subscriptionNotFound") };
  }

  try {
    if (immediate) {
      await stripe.subscriptions.cancel(stripeSubscriptionId);
    } else {
      await stripe.subscriptions.update(stripeSubscriptionId, { cancel_at_period_end: true });
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Stripe error" };
  }

  await supabase
    .from("subscriptions")
    .update(
      immediate
        ? { status: "canceled", cancel_at_period_end: false }
        : { cancel_at_period_end: true },
    )
    .eq("stripe_subscription_id", stripeSubscriptionId);

  revalidatePath("/portal/admin/subscriptions");
  revalidatePath("/portal/admin/billing");
  revalidatePath("/portal/parent");
  return { ok: true };
}
