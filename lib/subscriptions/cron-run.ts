import type { SupabaseClient } from "@supabase/supabase-js";
import { generateSubscriptionMonthlyInvoice } from "./generate-monthly-invoice";
import { generateSubscriptionTermInvoice, type StudioTerm } from "./generate-term-invoice";

async function activeAdminSubscriptionIds(supabase: SupabaseClient, studioId: string): Promise<string[]> {
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("studio_id", studioId)
    .eq("admin_created", true)
    .in("status", ["active", "trialing", "past_due"]);

  return (subs ?? []).map((s) => s.id as string);
}

export async function runSubscriptionInvoicesForStudio(
  supabase: SupabaseClient,
  studioId: string,
  billingMonth: string,
): Promise<{ generated: number; skipped: number; errors: string[] }> {
  const subIds = await activeAdminSubscriptionIds(supabase, studioId);

  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const subId of subIds) {
    const res = await generateSubscriptionMonthlyInvoice(supabase, subId, billingMonth);
    if (res.ok) generated += 1;
    else if (res.skipped) skipped += 1;
    else errors.push(`${subId}: ${res.error}`);
  }

  return { generated, skipped, errors };
}

export async function runTermInvoicesForStudio(
  supabase: SupabaseClient,
  studioId: string,
  term: StudioTerm,
): Promise<{ generated: number; skipped: number; errors: string[] }> {
  const subIds = await activeAdminSubscriptionIds(supabase, studioId);

  let generated = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const subId of subIds) {
    const res = await generateSubscriptionTermInvoice(supabase, subId, term);
    if (res.ok) generated += 1;
    else if (res.skipped) skipped += 1;
    else errors.push(`${subId}: ${res.error}`);
  }

  return { generated, skipped, errors };
}
