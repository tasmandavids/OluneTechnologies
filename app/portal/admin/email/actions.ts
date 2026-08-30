"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminEmailContext } from "@/lib/email/admin-context";
import { encryptCredentials } from "@/lib/email/crypto";
import { IMAP_PRESETS } from "@/lib/email/types";
import { syncEmailAccount } from "@/lib/email/sync";

export type ActionResult<T = void> = { ok: true; data?: T } | { ok: false; error: string };

const ImapConnectSchema = z.object({
  provider: z.enum(["icloud", "mailru"]),
  email: z.string().email(),
  password: z.string().min(1),
});

export async function connectImapAccount(input: unknown): Promise<ActionResult> {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) return { ok: false, error: ctx.error };

  const parsed = ImapConnectSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const preset = IMAP_PRESETS[parsed.data.provider];
  const credentials = encryptCredentials({
    kind: "imap",
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
    ...preset,
  });

  const { error } = await ctx.supabase.from("email_accounts").upsert(
    {
      studio_id: ctx.studioId,
      provider: parsed.data.provider,
      email_address: parsed.data.email.toLowerCase(),
      credentials_encrypted: credentials,
      connected_by: ctx.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "studio_id,email_address" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/messages");
  return { ok: true };
}

export async function disconnectEmailAccount(accountId: string): Promise<ActionResult> {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) return { ok: false, error: ctx.error };

  const { error } = await ctx.supabase
    .from("email_accounts")
    .delete()
    .eq("id", accountId)
    .eq("studio_id", ctx.studioId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/portal/admin/messages");
  return { ok: true };
}

export async function syncEmailAccountAction(accountId?: string): Promise<ActionResult<{ synced: number }>> {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) return { ok: false, error: ctx.error };

  let query = ctx.supabase.from("email_accounts").select("*").eq("studio_id", ctx.studioId);
  if (accountId) query = query.eq("id", accountId);

  const { data: accounts, error } = await query;
  if (error) return { ok: false, error: error.message };
  if (!accounts?.length) return { ok: true, data: { synced: 0 } };

  let synced = 0;
  const errors: string[] = [];
  for (const account of accounts) {
    const result = await syncEmailAccount(ctx.supabase, account);
    synced += result.synced;
    if (result.error) errors.push(result.error);
  }

  revalidatePath("/portal/admin/messages");
  if (errors.length && synced === 0) return { ok: false, error: errors[0] };
  return { ok: true, data: { synced } };
}

export async function summarizeThreadAction(threadId: string): Promise<ActionResult<{ summary: string }>> {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) return { ok: false, error: ctx.error };

  const { data: thread } = await ctx.supabase
    .from("email_threads")
    .select("id, subject, participant_addresses, summary_updated_at")
    .eq("id", threadId)
    .eq("studio_id", ctx.studioId)
    .single();

  if (!thread) return { ok: false, error: "Thread not found" };

  const { data: messages } = await ctx.supabase
    .from("email_messages")
    .select("from_name, from_address, body_text, body_html, sent_at, is_outbound")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true });

  const { summarizeConversation } = await import("@/lib/email/summarize");
  const summary = await summarizeConversation({
    subject: thread.subject,
    studioId: ctx.studioId,
    participants: thread.participant_addresses ?? [],
    messages: (messages ?? []).map((m) => ({
      fromName: m.from_name,
      fromAddress: m.from_address,
      bodyText: m.body_text,
      bodyHtml: m.body_html,
      sentAt: m.sent_at,
      isOutbound: m.is_outbound,
    })),
  });

  await ctx.supabase
    .from("email_threads")
    .update({
      summary,
      summary_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", threadId);

  revalidatePath("/portal/admin/messages");
  return { ok: true, data: { summary } };
}

export async function markThreadReadAction(threadId: string): Promise<ActionResult> {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) return { ok: false, error: ctx.error };

  await ctx.supabase
    .from("email_threads")
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("studio_id", ctx.studioId);

  revalidatePath("/portal/admin/messages");
  return { ok: true };
}
