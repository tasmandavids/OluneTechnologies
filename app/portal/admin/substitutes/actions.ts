"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePortalSession } from "@/lib/portal/session";
import { notifySubstituteRequested } from "@/lib/notify/substitutes";

const RequestSchema = z.object({
  class_id: z.string().uuid().optional().nullable(),
  class_name: z.string().min(1).max(120),
  discipline: z.string().max(60).optional().nullable(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().max(500).optional().nullable(),
});

export async function createSubstituteRequest(data: z.infer<typeof RequestSchema>) {
  const { supabase, studioId, userId } = await requirePortalSession();
  const parsed = RequestSchema.parse(data);
  const { data: created, error } = await supabase
    .from("substitute_requests")
    .insert({
      studio_id: studioId,
      posted_by: userId,
      ...parsed,
      class_id: parsed.class_id || null,
      discipline: parsed.discipline || null,
      notes: parsed.notes || null,
    })
    .select("id")
    .single();
  if (error) return { error: error.message };

  // Tell the teachers. Awaited rather than fired-and-forgotten so the rows are
  // written before this serverless invocation can be frozen, but it never
  // throws — a saved request that didn't send still shows on the board.
  await notifySubstituteRequested(supabase, {
    id: created.id as string,
    studioId,
    className: parsed.class_name,
    date: parsed.date,
    startTime: parsed.start_time,
    postedBy: userId,
  });

  return { ok: true };
}

export async function cancelSubstituteRequest(id: string) {
  const { supabase } = await requirePortalSession();
  const { error } = await supabase
    .from("substitute_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function reopenSubstituteRequest(id: string) {
  const { supabase } = await requirePortalSession();
  const { error } = await supabase
    .from("substitute_requests")
    .update({ status: "open", filled_by: null, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: error.message };
  return { ok: true };
}
