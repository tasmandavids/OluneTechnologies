"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getTranslations } from "@/lib/i18n/server";
import { reportHandledError } from "@/lib/observability/report";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function markNotificationRead(id: string): Promise<ActionResult> {
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("notSignedIn") };

  // The update's error was previously discarded entirely, so a failure here
  // looked identical to success: the row stayed unread and nothing said why.
  const { error } = await supabase
    .from("parent_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("parent_id", user.id);

  if (error) {
    await reportHandledError(error, { route: "parent.notifications.markRead" });
    return { ok: false, error: t("couldNotMarkRead") };
  }

  revalidatePath("/portal/parent/notifications");
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const t = await getTranslations("errors.actions");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("notSignedIn") };

  const { error } = await supabase
    .from("parent_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("parent_id", user.id)
    .is("read_at", null);

  if (error) {
    await reportHandledError(error, { route: "parent.notifications.markAllRead" });
    return { ok: false, error: t("couldNotMarkRead") };
  }

  revalidatePath("/portal/parent/notifications");
  return { ok: true };
}
