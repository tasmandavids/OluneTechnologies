"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "@/lib/i18n/server";

export async function markNotificationRead(id: string) {
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error(t("notSignedIn"));

  await supabase
    .from("parent_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("parent_id", user.id);

  revalidatePath("/portal/parent/notifications");
}

export async function markAllNotificationsRead() {
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error(t("notSignedIn"));

  await supabase
    .from("parent_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("parent_id", user.id)
    .is("read_at", null);

  revalidatePath("/portal/parent/notifications");
}
