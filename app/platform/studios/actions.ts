"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePlatformOperator } from "@/lib/platform/auth";
import { logPlatformAudit } from "@/lib/platform/audit";
import { entitlementsTag } from "@/lib/portal/entitlements";
import { getPack } from "@/lib/verticals/registry";
import type { ModuleKey } from "@/lib/verticals/types";

export type ActionResult = { ok: true } | { ok: false; error: string };

const StatusSchema = z.object({
  studioId: z.string().uuid(),
  status: z.enum(["trial", "active", "suspended"]),
});

export async function updateStudioStatus(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = StatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("studios")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.studioId);

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "studio.status_update",
    targetType: "studio",
    targetId: parsed.data.studioId,
    metadata: { status: parsed.data.status },
  });

  revalidatePath("/platform/studios");
  revalidatePath("/platform");
  return { ok: true };
}

// ─── Vertical ────────────────────────────────────────────────────────────────
//  Operator-only after setup completes. Switching vertical changes which
//  modules a studio has, and modules own data — a club that switched away from
//  dance would still have costume and production rows, now unreachable. So the
//  action refuses to silently orphan data: it counts what the target pack would
//  hide and requires an explicit acknowledgement.

const VerticalSchema = z.object({
  studioId: z.string().uuid(),
  vertical: z.string().min(1).max(40),
  /** Set true only after the operator has seen the orphan warning. */
  acknowledgeDataLoss: z.boolean().optional().default(false),
});

/** Tables that become unreachable when a module is switched off. */
const MODULE_DATA: { module: ModuleKey; table: string; label: string }[] = [
  { module: "production", table: "events", label: "events / productions" },
  { module: "costumes", table: "student_costumes", label: "costume records" },
];

export type VerticalChangeBlocked = {
  ok: false;
  error: string;
  needsAcknowledgement: true;
  orphans: { label: string; count: number }[];
};

export async function updateStudioVertical(
  input: unknown,
): Promise<ActionResult | VerticalChangeBlocked> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = VerticalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { studioId, vertical, acknowledgeDataLoss } = parsed.data;

  const admin = createAdminClient();

  // The registry is the source of truth for what may be selected — a vertical
  // that is hidden, or not in the table at all, is not a valid target.
  const { data: target } = await admin
    .from("verticals")
    .select("key, status")
    .eq("key", vertical)
    .maybeSingle();
  if (!target) return { ok: false, error: `Unknown vertical: ${vertical}` };
  if (target.status === "hidden") return { ok: false, error: `${vertical} is not available.` };

  const { data: studio } = await admin
    .from("studios")
    .select("vertical")
    .eq("id", studioId)
    .maybeSingle();
  if (!studio) return { ok: false, error: "Studio not found." };
  if (studio.vertical === vertical) return { ok: true };

  // What would the new pack hide that currently holds rows?
  const nextModules = new Set(getPack(vertical).modules);
  const losing = MODULE_DATA.filter((m) => !nextModules.has(m.module));

  if (losing.length > 0) {
    const counts = await Promise.all(
      losing.map(async ({ table, label }) => {
        const { count } = await admin
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("studio_id", studioId);
        return { label, count: count ?? 0 };
      }),
    );
    const orphans = counts.filter((c) => c.count > 0);

    if (orphans.length > 0 && !acknowledgeDataLoss) {
      return {
        ok: false,
        needsAcknowledgement: true,
        orphans,
        error:
          `Switching to ${vertical} hides ` +
          orphans.map((o) => `${o.count} ${o.label}`).join(" and ") +
          `. The rows are kept, but the studio loses access until it switches back.`,
      };
    }
  }

  const { error } = await admin.from("studios").update({ vertical }).eq("id", studioId);
  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "studio.vertical_update",
    targetType: "studio",
    targetId: studioId,
    metadata: { from: studio.vertical, to: vertical, acknowledgedDataLoss: acknowledgeDataLoss },
  });

  // Entitlements are cached for 5 minutes; without this the studio keeps its
  // old nav and module access until expiry.
  revalidateTag(entitlementsTag(studioId));
  revalidatePath("/platform/studios");
  return { ok: true };
}

const DeleteSchema = z.object({
  studioId: z.string().uuid(),
});

export async function deleteStudio(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = DeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const admin = createAdminClient();
  const { data: studio } = await admin
    .from("studios")
    .select("name")
    .eq("id", parsed.data.studioId)
    .single();

  const { error } = await admin.from("studios").delete().eq("id", parsed.data.studioId);

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "studio.delete",
    targetType: "studio",
    targetId: parsed.data.studioId,
    metadata: { name: studio?.name ?? null },
  });

  revalidatePath("/platform/studios");
  revalidatePath("/platform");
  return { ok: true };
}

// ─── Olune subscription (0119) ───────────────────────────────────────────────
//  Two operator valves over the paywall. Both write studio_subscriptions, which
//  is service-role-only by design — a studio admin who could set their own
//  status would walk straight through the gate.
//
//  Deliberately NOT here: setting a studio to 'active' by hand. "Active" means
//  Stripe is collecting, and a row saying so without a subscription behind it
//  is a lie that survives until someone tries to reconcile revenue. Comping is
//  the honest way to give a studio free access, and it says so in the data.

const CompSchema = z.object({
  studioId: z.string().uuid(),
  comped: z.boolean(),
  reason: z.string().max(200).optional(),
});

export async function setStudioComped(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = CompSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { studioId, comped, reason } = parsed.data;

  const admin = createAdminClient();

  // Un-comping drops them back to a fresh 14-day trial rather than straight to
  // locked. Revoking a comp should start a conversation, not end a session in
  // progress.
  const update = comped
    ? {
        comped: true,
        comped_reason: reason ?? "Comped by an Olune operator.",
        status: "comped",
        trial_ends_at: null,
      }
    : {
        comped: false,
        comped_reason: null,
        status: "trialing",
        trial_ends_at: new Date(Date.now() + 14 * 86_400_000).toISOString(),
      };

  const { error } = await admin
    .from("studio_subscriptions")
    .update(update)
    .eq("studio_id", studioId);

  if (error) return { ok: false, error: error.message };

  // Comping sets plan_key indirectly via the studios mirror only when plan_key
  // itself changes, so grant the full pack explicitly — a comped studio on
  // `solo` would be a comp that still withholds features.
  if (comped) {
    await admin.from("studio_subscriptions").update({ plan_key: "scale" }).eq("studio_id", studioId);
  }

  await logPlatformAudit({
    operatorId: auth.userId,
    action: comped ? "studio.comp" : "studio.uncomp",
    targetType: "studio",
    targetId: studioId,
    metadata: { reason: reason ?? null },
  });

  revalidateTag(entitlementsTag(studioId));
  revalidatePath("/platform/studios");
  return { ok: true };
}

const ExtendTrialSchema = z.object({
  studioId: z.string().uuid(),
  days: z.number().int().min(1).max(90),
});

/**
 * Push a trial out by N days.
 *
 * Extends from whichever is later — now, or the existing end date — so
 * extending an already-expired trial gives the full N days rather than
 * silently landing in the past.
 */
export async function extendStudioTrial(input: unknown): Promise<ActionResult> {
  const auth = await requirePlatformOperator();
  if (!auth.ok) return auth;

  const parsed = ExtendTrialSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { studioId, days } = parsed.data;

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("studio_subscriptions")
    .select("status, trial_ends_at")
    .eq("studio_id", studioId)
    .maybeSingle();

  if (!current) return { ok: false, error: "No subscription row for this studio." };
  if (current.status === "active") {
    return { ok: false, error: "This studio is already paying — nothing to extend." };
  }

  const existing = current.trial_ends_at ? Date.parse(current.trial_ends_at as string) : NaN;
  const base = Number.isNaN(existing) ? Date.now() : Math.max(Date.now(), existing);
  const trialEndsAt = new Date(base + days * 86_400_000).toISOString();

  const { error } = await admin
    .from("studio_subscriptions")
    .update({ status: "trialing", trial_ends_at: trialEndsAt })
    .eq("studio_id", studioId);

  if (error) return { ok: false, error: error.message };

  await logPlatformAudit({
    operatorId: auth.userId,
    action: "studio.extend_trial",
    targetType: "studio",
    targetId: studioId,
    metadata: { days, trialEndsAt },
  });

  revalidatePath("/platform/studios");
  return { ok: true };
}
