import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailContext } from "@/lib/email/admin-context";
import { identifyContactsByEmail } from "@/lib/email/identify-contact";
import { isUuid } from "@/lib/validation/uuid";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) {
    return NextResponse.json({ error: ctx.error }, { status: 401 });
  }

  const { threadId } = await params;
  if (!isUuid(threadId)) {
    return NextResponse.json({ error: "Invalid thread id" }, { status: 400 });
  }

  const { data: thread } = await ctx.supabase
    .from("email_threads")
    .select("*")
    .eq("id", threadId)
    .eq("studio_id", ctx.studioId)
    .single();

  if (!thread) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: messages } = await ctx.supabase
    .from("email_messages")
    .select("*")
    .eq("thread_id", threadId)
    .order("sent_at", { ascending: true });

  const emails = new Set<string>(thread.participant_addresses ?? []);
  for (const m of messages ?? []) {
    if (m.from_address) emails.add(m.from_address);
    for (const a of m.to_addresses ?? []) emails.add(a);
  }

  const contacts = await identifyContactsByEmail(ctx.supabase, ctx.studioId, [...emails]);

  return NextResponse.json({ thread, messages: messages ?? [], contacts });
}
