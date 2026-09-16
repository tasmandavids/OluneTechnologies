"use server";
import { getTranslations } from "@/lib/i18n/server";
import { requirePortalSession } from "@/lib/portal/session";

export async function loadPeopleOptions(kind: "student" | "parent") {
  const t = await getTranslations("errors.generic");
  const { supabase, studioId, role } = await requirePortalSession();
  if ((role !== "admin" && role !== "office") || (kind !== "student" && kind !== "parent")) throw new Error(t("title"));
  const { data, error } = await supabase.rpc("portal_people_options", { p_studio_id: studioId, p_role: kind });
  if (error) throw new Error(t("body"));
  return data as { id: string; name: string | null; email: string | null }[];
}
