"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { logPlatformAudit } from "@/lib/platform/audit";

export type ActionResult = { ok: true } | { ok: false; error: string };

const StatusSchema = z.object({
  studioId: z.string().uuid(),
  status: z.enum(["trial", "active", "suspended"]),
});

export async function updateStudioStatus(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("studios")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.studioId);

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "studio.status_update",
    targetType: "studio",
    targetId: parsed.data.studioId,
    metadata: { status: parsed.data.status },
  });

  revalidatePath("/platform/studios");
  revalidatePath("/platform");
  return { ok: true };
}

const DeleteSchema = z.object({
  studioId: z.string().uuid(),
});

export async function deleteStudio(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = createAdminClient();
  const { data: studio } = await admin
    .from("studios")
    .select("name")
    .eq("id", parsed.data.studioId)
    .single();

  const { error } = await admin.from("studios").delete().eq("id", parsed.data.studioId);

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "studio.delete",
    targetType: "studio",
    targetId: parsed.data.studioId,
    metadata: { name: studio?.name ?? null },
  });

  revalidatePath("/platform/studios");
  revalidatePath("/platform");
  return { ok: true };
}
