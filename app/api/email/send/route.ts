import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminEmailContext } from "@/lib/email/admin-context";
import { sendEmailReply } from "@/lib/email/sync";
import type { EmailAccountRow } from "@/lib/email/types";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({
  accountId: z.string().uuid(),
  threadId: z.string().uuid(),
  bodyText: z.string().min(1).max(20000),
});

export async function POST(req: NextRequest) {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) {
    return NextResponse.json({ error: ctx.error }, { status: 401 });
  }

  // Outbound mail goes out over the studio's own sending domain, so runaway
  // volume costs deliverability reputation and not merely compute.
  if (!(await checkRateLimit(rateLimitKey("email-send", ctx.userId), { limit: 30, windowMs: 60_000 }))) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: thread } = await ctx.supabase
    .from("email_threads")
    .select("id, subject, provider_thread_id, account_id, participant_addresses")
    .eq("id", parsed.data.threadId)
    .eq("studio_id", ctx.studioId)
    .single();

  if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });

  const { data: account } = await ctx.supabase
    .from("email_accounts")
    .select("*")
    .eq("id", parsed.data.accountId)
    .eq("studio_id", ctx.studioId)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const { data: lastMsg } = await ctx.supabase
    .from("email_messages")
    .select("from_address, provider_message_id")
    .eq("thread_id", parsed.data.threadId)
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const replyTo = (thread.participant_addresses ?? []).filter(
    (a: string) => a !== account.email_address.toLowerCase(),
  );
  const to = lastMsg?.from_address ? [lastMsg.from_address] : replyTo.slice(0, 1);
  if (!to.length) {
    return NextResponse.json({ error: "No recipient found for this thread" }, { status: 400 });
  }

  const subject = thread.subject?.startsWith("Re:") ? thread.subject : `Re: ${thread.subject ?? "(no subject)"}`;

  const result = await sendEmailReply(account as EmailAccountRow, ctx.supabase, {
    to,
    subject,
    bodyText: parsed.data.bodyText,
    threadId: parsed.data.threadId,
    providerThreadId: thread.provider_thread_id,
    inReplyTo: lastMsg?.provider_message_id,
    references: lastMsg?.provider_message_id,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const { syncEmailAccount } = await import("@/lib/email/sync");
  await syncEmailAccount(ctx.supabase, account as EmailAccountRow);

  return NextResponse.json({ ok: true, providerMessageId: result.providerMessageId });
}
