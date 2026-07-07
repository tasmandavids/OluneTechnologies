"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markParentEmailThreadRead(threadId: string): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  await supabase
    .from("parent_email_threads")
    .update({ is_read: true, updated_at: new Date().toISOString() })
    .eq("id", threadId)
    .eq("parent_id", user.id);

  revalidatePath("/portal/parent/chat");
  return { ok: true };
}
