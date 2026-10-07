import { createAdminClient } from "@/lib/supabase/admin";
import { getTranslations } from "@/lib/i18n/server";
import { OwnersDirectory } from "@/components/platform/OwnersDirectory";
import type { PlatformOwner } from "@/lib/platform/types";
import { requirePlatformPage } from "@/lib/platform/page-guard";

export default async function PlatformOwnersPage() {
  if (!(await requirePlatformPage())) return null;
  const admin = createAdminClient();
  const t = await getTranslations("platform.dashboard");

  const { data: admins } = await admin
    .from("profiles")
    .select("id, studio_id, full_name, email, phone, created_at, studios(id, name, slug, status)")
    .eq("role", "admin")
    .not("studio_id", "is", null)
    .order("created_at", { ascending: false });

  const studioIds = [...new Set((admins ?? []).map((a) => a.studio_id).filter(Boolean))] as string[];

  const { data: notesRows } = studioIds.length
    ? await admin.from("platform_owner_notes").select("studio_id, notes, tags").in("studio_id", studioIds)
    : { data: [] };

  const notesByStudio = new Map(
    (notesRows ?? []).map((n) => [n.studio_id, { notes: n.notes, tags: n.tags ?? [] }]),
  );

  const owners: PlatformOwner[] = (admins ?? []).map((a) => {
    const studio = a.studios as unknown as {
      id: string;
      name: string;
      slug: string;
      status: string;
    } | null;
    const note = studio ? notesByStudio.get(studio.id) : undefined;
    return {
      profileId: a.id,
      studioId: studio?.id ?? a.studio_id!,
      studioName: studio?.name ?? t("unknownStudio"),
      studioSlug: studio?.slug ?? "",
      studioStatus: studio?.status ?? "trial",
      fullName: a.full_name,
      email: a.email,
      phone: a.phone,
      createdAt: a.created_at,
      notes: note?.notes ?? null,
      tags: note?.tags ?? [],
    };
  });

  return <OwnersDirectory owners={owners} />;
}
