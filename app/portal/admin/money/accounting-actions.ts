"use server";

// ============================================================================
//  Money → Accounting: switching between Xero and Olune Books.
//
//  Choosing is mostly done by the setup paths themselves — finishing the Xero
//  OAuth round-trip records 'xero', finishing Books setup records 'olune'.
//  These actions cover the rest: taking the current choice down so the other
//  can go up, and bringing paused Books back.
//
//  Taking Xero down = disconnect (app/portal/admin/accounting/actions.ts),
//  which revokes the token and clears the choice. Taking Books down = pause:
//  the ledger is kept intact, because journals are immutable and filed returns
//  are history, but nothing posts to it until it's resumed.
//
//  Errors we anticipate come back as keys under admin.money.accounting.errors;
//  anything else (a database or Xero message) comes back as text.
// ============================================================================

import { revalidatePath } from "next/cache";
import { getAdminStudio } from "@/lib/portal/access";
import { logAuditEvent } from "@/lib/audit/log";
import { syncStudioLedger } from "@/lib/ledger/server/sync";
import { disconnectXero } from "@/app/portal/admin/accounting/actions";

type Result = { ok: true } | { ok: false; error: string };

function revalidateMoney() {
  revalidatePath("/portal/admin/money");
  revalidatePath("/portal/admin/books", "layout");
  revalidatePath("/portal/admin/settings/connections");
}

/** Stop using Xero. The studio is left with no accounting until it chooses again. */
export async function stopUsingXero(): Promise<Result> {
  const res = await disconnectXero();
  if (!res.ok) return res;
  const ctx = await getAdminStudio();
  if (ctx.studioId) {
    await logAuditEvent({
      studioId: ctx.studioId,
      actorId: ctx.userId,
      action: "accounting.xero_stopped",
      targetType: "studio",
      targetId: ctx.studioId,
    });
  }
  revalidateMoney();
  return { ok: true };
}

/** Pause Olune Books. Its records stay; nothing posts to them. */
export async function pauseBooks(): Promise<Result> {
  const { error, supabase, studioId, userId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Admin access required" };

  const { error: dbErr } = await supabase
    .from("studios")
    .update({ accounting_provider: null })
    .eq("id", studioId)
    .eq("accounting_provider", "olune");
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAuditEvent({ studioId, actorId: userId, action: "books.paused", targetType: "studio", targetId: studioId });
  revalidateMoney();
  return { ok: true };
}

/** Resume paused Olune Books and catch them up. */
export async function resumeBooks(): Promise<Result> {
  const { error, supabase, studioId, userId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Admin access required" };

  const [{ data: settings }, { data: xero }] = await Promise.all([
    supabase.from("ledger_settings").select("studio_id").eq("studio_id", studioId).maybeSingle(),
    supabase.from("xero_connections").select("studio_id").eq("studio_id", studioId).maybeSingle(),
  ]);
  if (!settings) return { ok: false, error: "booksNotSetUp" };
  if (xero) return { ok: false, error: "xeroStillConnected" };

  const { error: dbErr } = await supabase
    .from("studios")
    .update({ accounting_provider: "olune" })
    .eq("id", studioId);
  if (dbErr) return { ok: false, error: dbErr.message };

  await logAuditEvent({ studioId, actorId: userId, action: "books.resumed", targetType: "studio", targetId: studioId });
  await syncStudioLedger(supabase, studioId, { userId, force: true });
  revalidateMoney();
  return { ok: true };
}
