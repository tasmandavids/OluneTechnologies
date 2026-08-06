"use server";

// ============================================================================
//  Admin · "Today" dashboard layout — server action.
//  One dashboard_layouts row per studio (shared, not per-user). Follows the
//  same getStudioOpsStudio() + upsert convention as site/actions.ts.
// ============================================================================

import { revalidatePath } from "next/cache";
import { getStudioOpsStudio } from "@/lib/portal/access";
import type { WidgetLayoutItem } from "@/components/admin/dashboard/widget-registry";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: string };

function missingTableHint(msg: string): string {
  if (/relation .*dashboard_layouts.* does not exist/i.test(msg) || /could not find the table/i.test(msg)) {
    return "Dashboard layout storage not provisioned yet — run migration 0101_dashboard_layouts.sql (npm run db:push).";
  }
  return msg;
}

export async function saveDashboardLayout(layout: WidgetLayoutItem[]): Promise<ActionResult> {
  const { error, supabase, studioId } = await getStudioOpsStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error" };

  const { error: uErr } = await supabase.from("dashboard_layouts").upsert(
    {
      studio_id: studioId,
      layout,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "studio_id" },
  );
  if (uErr) return { ok: false, error: missingTableHint(uErr.message) };

  revalidatePath("/portal/admin");
  return { ok: true, data: null };
}
