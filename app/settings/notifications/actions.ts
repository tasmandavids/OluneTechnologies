"use server";

import { createClient } from "@/lib/supabase/server";
import { channelsForType, type NotificationType } from "@/lib/notify/messages";

export type PrefRow = {
  notification_type: string;
  email_enabled: boolean;
  sms_enabled: boolean;
  push_enabled: boolean;
};

const CHANNEL_COLUMN = {
  email: "email_enabled",
  sms: "sms_enabled",
  push: "push_enabled",
} as const;

export async function saveNotificationPreference(
  type: string,
  channel: "email" | "sms" | "push",
  enabled: boolean,
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorized" };

  const { error } = await supabase.from("notification_preferences").upsert(
    {
      user_id: user.id,
      notification_type: type,
      [CHANNEL_COLUMN[channel]]: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,notification_type", ignoreDuplicates: false },
  );
  if (error) return { error: error.message };
  return { ok: true };
}

export async function getNotificationPreferences(): Promise<PrefRow[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("notification_preferences")
    .select("notification_type, email_enabled, sms_enabled, push_enabled")
    .eq("user_id", user.id);
  return (data ?? []) as PrefRow[];
}
