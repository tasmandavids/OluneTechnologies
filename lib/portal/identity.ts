import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** Reuse verified identity only within this server render, never across users. */
export const getPortalIdentity = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null };
  const { data: profile, error } = await supabase.from("profiles")
    .select("role, full_name, studio_id, active_studio_id, account_kind, self_managed")
    .eq("id", user.id).single();
  if (error) throw new Error("Unable to load portal profile");
  return { supabase, user, profile };
});
