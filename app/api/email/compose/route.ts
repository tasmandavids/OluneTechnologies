import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminEmailContext } from "@/lib/email/admin-context";
import { sendEmailReply, syncEmailAccount } from "@/lib/email/sync";
import type { EmailAccountRow } from "@/lib/email/types";

export const runtime = "nodejs";

const BodySchema = z.object({
  accountId: z.string().uuid(),
  to: z.array(z.string().email()).min(1).max(50),
  subject: z.string().min(1).max(500),
  bodyText: z.string().min(1).max(20000),
});

export async function POST(req: NextRequest) {
  const ctx = await getAdminEmailContext();
  if (ctx.error) {
    return NextResponse.json({ error: ctx.error }, { status: 401 });
  }

  const parsed = BodySchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const { data: account } = await ctx.supabase
    .from("email_accounts")
    .select("*")
    .eq("id", parsed.data.accountId)
    .eq("studio_id", ctx.studioId)
    .single();

  if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });

  const result = await sendEmailReply(account as EmailAccountRow, ctx.supabase, {
    to: parsed.data.to,
    subject: parsed.data.subject,
    bodyText: parsed.data.bodyText,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  await syncEmailAccount(ctx.supabase, account as EmailAccountRow);

  return NextResponse.json({ ok: true, providerMessageId: result.providerMessageId });
}
