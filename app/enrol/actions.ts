"use server";

import { z } from "zod";
import { createPublicClient } from "@/lib/supabase/public";
import { buildTrialLeadNotes, splitParentName } from "@/lib/enrol/trial-request";
import { getTranslations } from "@/lib/i18n/server";
import { checkRateLimit, clientIpKey } from "@/lib/rate-limit";
import { cookies, headers } from "next/headers";
import {
  ATTRIBUTION_COOKIE,
  attributionColumns,
  parseAttribution,
} from "@/lib/analytics/attribution";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function submitTrialRequest(input: unknown): Promise<ActionResult> {
  const t = await getTranslations("errors.actions");

  const TrialRequestSchema = z.object({
    studioId: z.string().uuid(),
    parentName: z.string().min(1, t("nameRequired")).max(120),
    email: z.string().email(t("invalidEmail")),
    childName: z.string().max(120).optional().or(z.literal("")),
    phone: z.string().max(30).optional().or(z.literal("")),
    classId: z.string().uuid().optional().or(z.literal("")),
    className: z.string().max(200).optional().or(z.literal("")),
    disciplineKey: z.string().max(40).optional().or(z.literal("")),
    disciplineLabel: z.string().max(80).optional().or(z.literal("")),
  });

  // The only write path in the app an anonymous caller can reach (RLS policy
  // leads_public_trial_insert, 0050). Everything else is keyed by user id;
  // there is no user here, so it is keyed by address. 5/hour is far above what
  // a family filling in a trial form does and far below what makes flooding a
  // studio's lead inbox worthwhile.
  if (!(await checkRateLimit(clientIpKey("enrol-trial", await headers()), {
    limit: 5,
    windowMs: 60 * 60_000,
  }))) {
    return { ok: false, error: t("tooManyRequests") };
  }

  const parsed = TrialRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? t("invalidInput") };
  }

  const d = parsed.data;
  const { firstName, lastName } = splitParentName(d.parentName);
  if (!firstName) return { ok: false, error: t("nameRequired") };

  const supabase = createPublicClient();
  const { data: studio } = await supabase
    .from("studios")
    .select("id")
    .eq("id", d.studioId)
    .neq("status", "suspended")
    .maybeSingle();

  if (!studio) return { ok: false, error: t("studioNotFound") };

  const notes = buildTrialLeadNotes({
    childName: d.childName,
    className: d.className,
    disciplineLabel: d.disciplineLabel,
    phone: d.phone,
  });

  // Where the family actually came from. The cookie is written on their first
  // page view (AttributionCapture) and is first-touch, so a parent who clicked
  // an ad on Tuesday and enquires on Thursday is still credited to that ad.
  // `source` stays "enrol-page" — that records which form, which is a separate
  // and still useful fact.
  const attribution = parseAttribution((await cookies()).get(ATTRIBUTION_COOKIE)?.value);

  const lead = {
    studio_id: d.studioId,
    first_name: firstName,
    last_name: lastName,
    email: d.email,
    phone: d.phone || null,
    source: "enrol-page",
    status: "trial",
    notes,
  };

  let { error: dbErr } = await supabase
    .from("leads")
    .insert({ ...lead, ...attributionColumns(attribution) });

  // Migration 0116 adds the attribution columns. If it hasn't been applied yet
  // the insert fails on an unknown column — and losing a real family's trial
  // request over a marketing nicety is not a trade worth making. Retry with
  // the lead alone.
  if (dbErr && /utm_|referrer|landing_path|column/i.test(dbErr.message)) {
    console.warn(
      `[enrol] lead attribution columns unavailable (run migration 0116): ${dbErr.message}`,
    );
    ({ error: dbErr } = await supabase.from("leads").insert(lead));
  }

  // Logged, not returned. The caller here is an anonymous visitor, and a raw
  // PostgREST message names tables, columns and constraints — free schema
  // reconnaissance in exchange for an error string no parent could act on.
  if (dbErr) {
    console.error(`[enrol] trial request insert failed: ${dbErr.message}`);
    return { ok: false, error: t("unknown") };
  }
  return { ok: true };
}
