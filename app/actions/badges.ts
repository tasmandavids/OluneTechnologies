"use server";

// ============================================================================
//  Badge server actions — shared by teacher, admin and office roles.
//
//  Awarding is MANUAL in v1. RLS (0088_badges.sql) is the real gate: teachers
//  may award/revoke only for students they teach; admins for anyone in their
//  studio. We stamp studio_id + awarded_by so both policies are satisfiable.
//  Studio-catalogue mutations (hide / custom badges) are admin-only.
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type BadgeResult = { ok: true } | { ok: false; error: string };

async function getActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in.", supabase, user: null, studioId: null, role: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile?.studio_id)
    return { error: "No studio found.", supabase, user, studioId: null, role: null };

  return {
    error: null,
    supabase,
    user,
    studioId: profile.studio_id as string,
    role: profile.role as string,
  };
}

function revalidateProgressFor(recipientId: string) {
  revalidatePath(`/portal/admin/students/${recipientId}`);
  revalidatePath(`/portal/teacher/students/${recipientId}`);
  revalidatePath(`/portal/parent/children/${recipientId}`);
  revalidatePath("/portal/student/progress");
  revalidatePath("/portal/parent");
}

// ─── award / revoke ─────────────────────────────────────────────────────────

const AwardSchema = z.object({
  recipientId: z.string().uuid(),
  badgeId: z.string().uuid(),
  note: z.string().trim().max(500).optional().or(z.literal("")),
});

export async function awardBadge(input: unknown): Promise<BadgeResult> {
  const parsed = AwardSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { error, supabase, user, studioId, role } = await getActor();
  if (error || !user || !studioId) return { ok: false, error: error ?? "Unknown error." };
  if (role !== "admin" && role !== "teacher") return { ok: false, error: "Not permitted." };

  const { error: insErr } = await supabase.from("profile_badges").insert({
    studio_id: studioId,
    recipient_id: parsed.data.recipientId,
    badge_id: parsed.data.badgeId,
    awarded_by: user.id,
    note: parsed.data.note || null,
  });

  // Unique-violation = already awarded; treat as success (idempotent).
  if (insErr && insErr.code !== "23505") return { ok: false, error: insErr.message };

  revalidateProgressFor(parsed.data.recipientId);
  return { ok: true };
}

const RevokeSchema = z.object({
  recipientId: z.string().uuid(),
  badgeId: z.string().uuid(),
});

export async function revokeBadge(input: unknown): Promise<BadgeResult> {
  const parsed = RevokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { error, supabase, user, role } = await getActor();
  if (error || !user) return { ok: false, error: error ?? "Unknown error." };
  if (role !== "admin" && role !== "teacher") return { ok: false, error: "Not permitted." };

  const { error: delErr } = await supabase
    .from("profile_badges")
    .delete()
    .eq("recipient_id", parsed.data.recipientId)
    .eq("badge_id", parsed.data.badgeId);

  if (delErr) return { ok: false, error: delErr.message };

  revalidateProgressFor(parsed.data.recipientId);
  return { ok: true };
}

// ─── studio catalogue: hide a global badge ────────────────────────────────

const HideSchema = z.object({
  badgeId: z.string().uuid(),
  hidden: z.boolean(),
});

export async function setStudioBadgeHidden(input: unknown): Promise<BadgeResult> {
  const parsed = HideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { error, supabase, studioId, role } = await getActor();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error." };
  if (role !== "admin") return { ok: false, error: "Admins only." };

  if (parsed.data.hidden) {
    const { error: upErr } = await supabase
      .from("studio_badge_visibility")
      .upsert(
        { studio_id: studioId, badge_id: parsed.data.badgeId, hidden: true },
        { onConflict: "studio_id,badge_id" },
      );
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { error: delErr } = await supabase
      .from("studio_badge_visibility")
      .delete()
      .eq("studio_id", studioId)
      .eq("badge_id", parsed.data.badgeId);
    if (delErr) return { ok: false, error: delErr.message };
  }

  revalidatePath("/portal/admin/badges");
  return { ok: true };
}

// ─── studio catalogue: custom badge CRUD ──────────────────────────────────

const CustomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  icon: z.string().trim().max(16).optional().or(z.literal("")),
  category: z
    .enum([
      "founder", "beginner", "commitment", "technique", "level",
      "performance", "character", "mentor", "community", "secret", "family",
    ])
    .default("character"),
  tier: z.enum(["bronze", "silver", "gold", "diamond"]).default("bronze"),
  xp: z.number().int().min(0).max(100000).default(100),
  recipientType: z.enum(["student", "parent"]).default("student"),
  isSecret: z.boolean().default(false),
});

function slugify(name: string): string {
  return (
    "custom_" +
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60)
  );
}

export async function createStudioBadge(input: unknown): Promise<BadgeResult> {
  const parsed = CustomSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const { error, supabase, studioId, role } = await getActor();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error." };
  if (role !== "admin") return { ok: false, error: "Admins only." };

  const d = parsed.data;
  const { error: insErr } = await supabase.from("badge_definitions").insert({
    studio_id: studioId,
    key: `${slugify(d.name)}_${Date.now().toString(36)}`,
    category: d.category,
    name: d.name,
    description: d.description || null,
    icon: d.icon || "🏅",
    tier: d.tier,
    xp: d.xp,
    recipient_type: d.recipientType,
    is_secret: d.isSecret,
    sort: 500,
  });
  if (insErr) return { ok: false, error: insErr.message };

  revalidatePath("/portal/admin/badges");
  return { ok: true };
}

export async function deleteStudioBadge(badgeId: string): Promise<BadgeResult> {
  if (!z.string().uuid().safeParse(badgeId).success) return { ok: false, error: "Invalid badge." };

  const { error, supabase, studioId, role } = await getActor();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown error." };
  if (role !== "admin") return { ok: false, error: "Admins only." };

  // RLS ensures only this studio's custom rows are deletable.
  const { error: delErr } = await supabase
    .from("badge_definitions")
    .delete()
    .eq("id", badgeId)
    .eq("studio_id", studioId);
  if (delErr) return { ok: false, error: delErr.message };

  revalidatePath("/portal/admin/badges");
  return { ok: true };
}
