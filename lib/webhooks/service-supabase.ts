import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Webhooks run anonymously — require service-role in production. */
export async function getServiceSupabase() {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) return createAdminClient();
  if (process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for Stripe webhooks in production");
  }
  return createClient();
}

export type ServiceSupabase = Awaited<ReturnType<typeof getServiceSupabase>>;
