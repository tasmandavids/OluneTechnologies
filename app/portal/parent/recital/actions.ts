"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { assertModule } from "@/lib/portal/require-module";
import { getTranslations } from "@/lib/i18n/server";
import { reportHandledError } from "@/lib/observability/report";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function updateCostumeSize(
  costumeId: string,
  sizeLabel: string,
  sizeNotes: string
): Promise<ActionResult> {
  const t = await getTranslations("errors.actions");

  // assertModule still throws, deliberately: a studio whose pack omits
  // costumes should never have reached this screen, so that is a boundary
  // case, not something to render inline next to a size field. Everything
  // below it is recoverable and comes back as a result the parent can read —
  // thrown messages are sanitised out of a production server action, so the
  // previous `throw new Error(...)` could never have been shown to anyone.
  await assertModule("costumes");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: t("notSignedIn") };

  const { error } = await supabase
    .from("student_costumes")
    .update({
      size_label: sizeLabel || null,
      size_notes: sizeNotes || null,
      status: "size_confirmed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", costumeId);

  if (error) {
    await reportHandledError(error, {
      route: "parent.recital.updateCostumeSize",
      extra: { costumeId },
    });
    return { ok: false, error: t("couldNotSaveCostumeSize") };
  }

  revalidatePath("/portal/parent/recital");
  return { ok: true };
}
