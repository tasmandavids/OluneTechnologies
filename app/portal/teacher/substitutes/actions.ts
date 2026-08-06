"use server";

import { createClient } from "@/lib/supabase/server";
import { notifySubstituteFilled } from "@/lib/notify/substitutes";

async function getUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, userId: user.id };
}

export async function claimSubstituteRequest(requestId: string) {
  const { supabase, userId } = await getUser();

  // Conditional update on status='open' is the race guard: when two teachers
  // tap Claim at once, exactly one matches. `.select()` is what makes that
  // guard observable — without it a losing claim returns no error and no rows,
  // and both teachers walk away believing they have the class.
  const { data: claimed, error } = await supabase
    .from("substitute_requests")
    .update({ status: "filled", filled_by: userId, updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .eq("status", "open")
    .select("id, studio_id, class_name, date, start_time, posted_by")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!claimed) return { error: "Someone else has already picked up this class." };

  const { data: me } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  await notifySubstituteFilled(
    supabase,
    {
      id: claimed.id as string,
      studioId: claimed.studio_id as string,
      className: claimed.class_name as string,
      date: claimed.date as string,
      startTime: claimed.start_time as string,
      postedBy: claimed.posted_by as string,
    },
    (me?.full_name as string | null) ?? null,
  );

  return { ok: true };
}
