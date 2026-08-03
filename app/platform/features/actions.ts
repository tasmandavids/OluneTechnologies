"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { logPlatformAudit } from "@/lib/platform/audit";
import { ENTITLEMENTS_ALL_TAG, entitlementsTag } from "@/lib/portal/entitlements";

export type ActionResult = { ok: true } | { ok: false; error: string };

const ToggleSchema = z.object({
  flagId: z.string().uuid(),
  enabled: z.boolean(),
});

export async function toggleFeatureFlag(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = ToggleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = createAdminClient();
  const { data: updated, error } = await admin
    .from("platform_feature_flags")
    .update({ enabled: parsed.data.enabled, updated_by: auth.userId, updated_at: new Date().toISOString() })
    .eq("id", parsed.data.flagId)
    .select("feature_key, studio_id")
    .maybeSingle();

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "feature.toggle",
    targetType: "feature_flag",
    targetId: parsed.data.flagId,
    metadata: { enabled: parsed.data.enabled, featureKey: updated?.feature_key ?? null },
  });

  // Flags feed the entitlements resolver, which caches for 5 minutes. Without
  // this the toggle appears to do nothing until the cache expires. A global row
  // (studio_id null) changes the answer for every tenant, so it busts the
  // all-studios tag rather than one that cannot be enumerated.
  if (updated?.studio_id) revalidateTag(entitlementsTag(updated.studio_id));
  else revalidateTag(ENTITLEMENTS_ALL_TAG);

  revalidatePath("/platform/features");
  return { ok: true };
}
