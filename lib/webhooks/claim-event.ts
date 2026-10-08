// ============================================================================
//  Idempotency claim for Stripe webhook deliveries (migration 0020 + audit B-16).
//
//  The claim row is written before the handler runs. A handler that is killed
//  mid-flight (a Vercel timeout during an inline Xero sync, an OOM) never
//  reaches the catch that releases it, so Stripe's retry used to be acked as a
//  duplicate and the payment lost. A claim that was never marked processed and
//  is older than CLAIM_TTL_MS can now be taken over by the retry.
// ============================================================================

import type { ServiceSupabase } from "@/lib/webhooks/service-supabase";

export const CLAIM_TTL_MS = 5 * 60_000;

export type ClaimResult =
  | { status: "claimed" }
  | { status: "duplicate" }
  | { status: "error"; code?: string; message: string };

export async function claimStripeEvent(
  supabase: ServiceSupabase,
  claim: { id: string; type: string; account: string | null },
  now = Date.now(),
): Promise<ClaimResult> {
  const { error } = await supabase.from("stripe_events").insert(claim);
  if (!error) return { status: "claimed" };
  if (error.code !== "23505") return { status: "error", code: error.code, message: error.message };

  // Already claimed. Only an unfinished claim that has gone stale is re-claimable;
  // the conditional update means exactly one concurrent retry wins it.
  const cutoff = new Date(now - CLAIM_TTL_MS).toISOString();
  const { data, error: takeoverError } = await supabase
    .from("stripe_events")
    .update({ received_at: new Date(now).toISOString() })
    .eq("id", claim.id)
    .is("processed_at", null)
    .lt("received_at", cutoff)
    .select("id");
  if (!takeoverError && data && data.length > 0) return { status: "claimed" };
  return { status: "duplicate" };
}

/** Mark the claim finished. Best effort: a failure only delays dedupe, never loses an event. */
export async function markStripeEventProcessed(supabase: ServiceSupabase, id: string): Promise<void> {
  await supabase
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", id);
}
