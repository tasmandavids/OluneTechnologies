"use server";

import { revalidatePath } from "next/cache";
import { getAdminXeroContext } from "@/lib/xero/admin-context";
import { revokeXeroConnection, xeroRedirectUri } from "@/lib/xero/client";
import { resolveAppOriginFromHeaders } from "@/lib/xero/app-origin";
import { xeroSettingsSchema } from "@/lib/xero/schemas";
import { listXeroSalesAccounts, type XeroAccountOption } from "@/lib/xero/chart-of-accounts";

export async function disconnectXero(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminXeroContext();
  if (ctx.error) return { ok: false, error: ctx.error };

  try {
    const origin = await resolveAppOriginFromHeaders();
    await revokeXeroConnection(ctx.supabase, ctx.studioId, xeroRedirectUri(origin));
    revalidatePath("/portal/admin/accounting");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Disconnect failed" };
  }
}

export async function refreshAccountingData(): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminXeroContext();
  if (ctx.error) return { ok: false, error: ctx.error };

  revalidatePath("/portal/admin/accounting");
  return { ok: true };
}

export async function getXeroSalesAccountOptions(): Promise<
  { ok: true; data: XeroAccountOption[] | null } | { ok: false; error: string }
> {
  const ctx = await getAdminXeroContext();
  if (ctx.error) return { ok: false, error: ctx.error };

  try {
    const origin = await resolveAppOriginFromHeaders();
    const accounts = await listXeroSalesAccounts(ctx.supabase, ctx.studioId, xeroRedirectUri(origin));
    return { ok: true, data: accounts };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not load Xero accounts" };
  }
}

export async function updateXeroSettings(
  settings: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const ctx = await getAdminXeroContext();
  if (ctx.error) return { ok: false, error: ctx.error };

  const parsed = xeroSettingsSchema.safeParse(settings);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid settings" };
  }

  const { error } = await ctx.supabase
    .from("xero_connections")
    .update({
      settings: parsed.data,
      updated_at: new Date().toISOString(),
    })
    .eq("studio_id", ctx.studioId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/portal/admin/accounting");
  return { ok: true };
}
