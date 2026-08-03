"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";

export type ActionResult = { ok: true } | { ok: false; error: string };

async function getAdminStudio() {
  const ctx = await getAdminStudioAccess();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
    userId: ctx.userId,
  };
}

const CreateSchema = z.object({
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export async function createOwnerSupportThread(input: unknown): Promise<ActionResult> {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId) return { ok: false, error: ctx.error ?? "Unauthorized" };

  const parsed = CreateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { data: thread, error: threadErr } = await ctx.supabase
    .from("platform_support_threads")
    .insert({
      studio_id: ctx.studioId,
      subject: parsed.data.subject,
      created_by: ctx.userId,
    })
    .select("id")
    .single();

  if (threadErr || !thread) return { ok: false, error: threadErr?.message ?? "Failed" };

  const { error: msgErr } = await ctx.supabase.from("platform_support_messages").insert({
    thread_id: thread.id,
    body: parsed.data.body,
    sender_profile_id: ctx.userId,
  });

  if (msgErr) return { ok: false, error: msgErr.message };

  revalidatePath("/portal/admin/support");
  return { ok: true };
}

const ReplySchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().min(1).max(5000),
});

export async function replyOwnerSupport(input: unknown): Promise<ActionResult> {
  const ctx = await getAdminStudio();
  if (ctx.error || !ctx.studioId) return { ok: false, error: ctx.error ?? "Unauthorized" };

  const parsed = ReplySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const { error } = await ctx.supabase.from("platform_support_messages").insert({
    thread_id: parsed.data.threadId,
    body: parsed.data.body,
    sender_profile_id: ctx.userId,
  });

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/support");
  return { ok: true };
}
