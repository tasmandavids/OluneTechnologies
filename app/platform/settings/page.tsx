import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformSettingsForm } from "@/components/platform/PlatformSettingsForm";
import type { PlatformSettings } from "@/lib/platform/types";
import { requirePlatformPage } from "@/lib/platform/page-guard";

export default async function PlatformSettingsPage() {
  if (!(await requirePlatformPage())) return null;
  const admin = createAdminClient();
  const { data } = await admin.from("platform_settings").select("settings").eq("id", 1).single();

  const settings = (data?.settings as PlatformSettings) ?? {};

  return <PlatformSettingsForm settings={settings} />;
}
