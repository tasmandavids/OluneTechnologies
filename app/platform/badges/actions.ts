"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { logPlatformAudit } from "@/lib/platform/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

const UpdateSchema = z.object({
  badgeId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  icon: z.string().trim().max(16).optional(),
  xp: z.number().int().min(0).max(100000).optional(),
  tier: z.enum(["bronze", "silver", "gold", "diamond"]).optional(),
  isActive: z.boolean().optional(),
});

/** Edit a GLOBAL badge (studio_id is null). Platform operators only. */
export async function updateGlobalBadge(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { badgeId, name, description, icon, xp, tier, isActive } = parsed.data;
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (description !== undefined) patch.description = description;
  if (icon !== undefined) patch.icon = icon;
  if (xp !== undefined) patch.xp = xp;
  if (tier !== undefined) patch.tier = tier;
  if (isActive !== undefined) patch.is_active = isActive;
  if (Object.keys(patch).length === 0) return { ok: true };

  const admin = createAdminClient();
  const { error } = await admin
    .from("badge_definitions")
    .update(patch)
    .eq("id", badgeId)
    .is("studio_id", null); // guard: global rows only

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "badge.update",
    targetType: "badge_definition",
    targetId: badgeId,
    metadata: patch,
  });

  revalidatePath("/platform/badges");
  return { ok: true };
}
