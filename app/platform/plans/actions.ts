"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { logPlatformAudit } from "@/lib/platform/audit";
import { PLAN_KEYS } from "@/lib/plans/catalog";

export type ActionResult = { ok: true } | { ok: false; error: string };

const PriceSchema = z.object({
  planKey: z.enum(PLAN_KEYS as unknown as [string, ...string[]]),
  interval: z.enum(["month", "year"]),
  // Stripe price ids are `price_` + an opaque id. Validating the prefix catches
  // the common paste error — a Product id (`prod_`) or a Payment Link — before
  // it becomes a 500 at checkout for a studio holding a credit card.
  stripePriceId: z
    .string()
    .trim()
    .regex(/^price_[A-Za-z0-9]+$/, "That doesn't look like a Stripe Price id (price_…)."),
  active: z.boolean().default(true),
});

export async function savePlanPrice(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = PriceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { planKey, interval, stripePriceId, active } = parsed.data;

  const admin = createAdminClient();
  const { error } = await admin.from("platform_plan_prices").upsert(
    {
      plan_key: planKey,
      billing_interval: interval,
      stripe_price_id: stripePriceId,
      active,
    },
    { onConflict: "plan_key,billing_interval" },
  );

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "plan_price.save",
    targetType: "plan_price",
    targetId: `${planKey}:${interval}`,
    // The Price id is not a secret — it is safe to hand to a browser at
    // checkout — and recording it is the point of the audit entry.
    metadata: { stripePriceId, active },
  });

  revalidatePath("/platform/plans");
  return { ok: true };
}
