import type { SupabaseClient } from "@supabase/supabase-js";
import { stripe } from "@/lib/stripe";
import { loadStudioStripeAccount, isChargeable } from "./connect";

/**
 * Resolve (creating if needed) the Stripe Customer id to charge for a
 * profile at a given studio.
 *
 * Stripe Customers can't be shared across Stripe accounts. Studios still on
 * the shared platform account keep using the single, global
 * `profiles.stripe_customer_id` exactly as before Connect existed (legacy
 * path — unchanged behavior). Once a studio has a chargeable Connect
 * account, each (profile, studio) pair gets its own Customer, recorded in
 * `profile_stripe_customers`, since the same parent may be enrolled at
 * multiple studios (see studio_memberships).
 */
export async function getOrCreateStripeCustomer(
  supabase: SupabaseClient,
  profileId: string,
  studioId: string,
): Promise<string> {
  const account = await loadStudioStripeAccount(supabase, studioId);

  if (!isChargeable(account)) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, full_name, email")
      .eq("id", profileId)
      .single();

    const existing = profile?.stripe_customer_id as string | null;
    if (existing) return existing;

    const customer = await stripe.customers.create({
      email: (profile?.email as string | null) ?? undefined,
      name: (profile?.full_name as string | null) ?? undefined,
      metadata: { supabase_user_id: profileId, studio_id: studioId },
    });
    await supabase.from("profiles").update({ stripe_customer_id: customer.id }).eq("id", profileId);
    return customer.id;
  }

  const { data: link } = await supabase
    .from("profile_stripe_customers")
    .select("stripe_customer_id")
    .eq("profile_id", profileId)
    .eq("studio_id", studioId)
    .maybeSingle();

  if (link?.stripe_customer_id) return link.stripe_customer_id as string;

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", profileId)
    .single();

  const customer = await stripe.customers.create({
    email: (profile?.email as string | null) ?? undefined,
    name: (profile?.full_name as string | null) ?? undefined,
    metadata: { supabase_user_id: profileId, studio_id: studioId },
  });

  await supabase.from("profile_stripe_customers").insert({
    profile_id: profileId,
    studio_id: studioId,
    stripe_account_id: account!.stripe_account_id,
    stripe_customer_id: customer.id,
  });

  return customer.id;
}
