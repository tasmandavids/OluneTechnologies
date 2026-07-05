"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { logPlatformAudit } from "@/lib/platform/audit";
import type { PlatformAnnouncement } from "@/lib/platform/types";

export type ActionResult = { ok: true; announcement?: PlatformAnnouncement } | { ok: false; error: string };

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  severity: z.enum(["info", "warning", "critical"]).default("info"),
  target: z.enum(["all", "trial", "active", "suspended"]).default("all"),
});

export async function createAnnouncement(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_announcements")
    .insert({
      title: parsed.data.title,
      body: parsed.data.body,
      severity: parsed.data.severity,
      target: parsed.data.target,
      created_by: auth.userId,
    })
    .select("id, title, body, severity, target, published_at, expires_at, created_at")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Failed to create" };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "announcement.create",
    targetType: "announcement",
    targetId: data.id,
  });

  revalidatePath("/platform/announcements");
  return {
    ok: true,
    announcement: {
      id: data.id,
      title: data.title,
      body: data.body,
      severity: data.severity as PlatformAnnouncement["severity"],
      target: data.target as PlatformAnnouncement["target"],
      publishedAt: data.published_at,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
    },
  };
}

export async function publishAnnouncement(id: string): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_announcements")
    .update({ published_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "announcement.publish",
    targetType: "announcement",
    targetId: id,
  });

  revalidatePath("/platform/announcements");
  return { ok: true };
}

export async function stopAnnouncement(id: string): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin
    .from("platform_announcements")
    .update({ published_at: null, expires_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "announcement.stop",
    targetType: "announcement",
    targetId: id,
  });

  revalidatePath("/platform/announcements");
  return { ok: true };
}

export async function deleteAnnouncement(id: string): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const admin = createAdminClient();
  const { error } = await admin.from("platform_announcements").delete().eq("id", id);

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "announcement.delete",
    targetType: "announcement",
    targetId: id,
  });

  revalidatePath("/platform/announcements");
  return { ok: true };
}
