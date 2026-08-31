import { NextRequest, NextResponse } from "next/server";
import { getAdminEmailContext } from "@/lib/email/admin-context";
import { syncEmailAccount } from "@/lib/email/sync";
import { isUuid } from "@/lib/validation/uuid";
import type { EmailAccountRow } from "@/lib/email/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = await getAdminEmailContext();
  if (ctx.error !== null) {
    return NextResponse.json({ error: ctx.error }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { accountId?: string };
  if (body.accountId && !isUuid(body.accountId)) {
    return NextResponse.json({ error: "Invalid account id" }, { status: 400 });
  }
  let query = ctx.supabase.from("email_accounts").select("*").eq("studio_id", ctx.studioId);
  if (body.accountId) query = query.eq("id", body.accountId);

  const { data: accounts, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!accounts?.length) return NextResponse.json({ synced: 0 });

  let synced = 0;
  const errors: string[] = [];
  for (const account of accounts) {
    const result = await syncEmailAccount(ctx.supabase, account as EmailAccountRow);
    synced += result.synced;
    if (result.error) errors.push(result.error);
  }

  if (errors.length && synced === 0) {
    return NextResponse.json({ error: errors[0], synced: 0 }, { status: 422 });
  }

  return NextResponse.json({ synced, errors: errors.length ? errors : undefined });
}
