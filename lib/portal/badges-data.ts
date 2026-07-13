// ============================================================================
//  Badge data access — catalogue, earned badges, and XP/level rollup.
//  Shared by the student, parent, teacher, admin and platform surfaces.
//  All queries run through the caller's RLS-scoped client, so a caller only
//  ever sees badges/awards they are permitted to read (see 0088_badges.sql).
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type BadgeTier = "bronze" | "silver" | "gold" | "diamond";
export type BadgeRecipientType = "student" | "parent";

export type BadgeDefinition = {
  id: string;
  key: string;
  category: string;
  name: string;
  description: string | null;
  icon: string | null;
  tier: BadgeTier;
  xp: number;
  isSecret: boolean;
  recipientType: BadgeRecipientType;
  studioId: string | null; // null = global; set = studio-custom
  sort: number;
};

export type EarnedBadge = {
  badgeId: string;
  awardedAt: string;
  note: string | null;
  awardedByName: string | null;
};

/** A catalogue entry decorated with the recipient's earned state. Secret,
 *  not-yet-earned badges are masked (no name/description leaked). */
export type ShowcaseBadge = {
  id: string;
  category: string;
  tier: BadgeTier;
  icon: string | null;
  name: string;
  description: string | null;
  xp: number;
  isSecret: boolean;
  earned: boolean;
  locked: boolean; // secret + not earned → render as "?"
  awardedAt: string | null;
  note: string | null;
};

export type XpSummary = {
  totalXp: number;
  badgeCount: number;
  level: number;
  levelName: string;
  levelIcon: string | null;
  nextLevelName: string | null;
  nextLevelIcon: string | null;
  xpIntoLevel: number; // XP earned within the current level band
  xpForLevel: number | null; // band width; null at the top level
  xpToNext: number | null; // remaining to next level; null at the top
};

export type XpLevel = {
  level: number;
  name: string;
  icon: string | null;
  minXp: number;
  maxXp: number | null;
};

export type StudentBadgeBundle = {
  showcase: ShowcaseBadge[];
  earnedCount: number;
  totalCount: number;
  xp: XpSummary;
};

// ─── catalogue ──────────────────────────────────────────────────────────────

/** Global + studio-custom badges, minus any the studio has hidden, sorted. */
export async function fetchBadgeCatalogue(
  supabase: SupabaseClient,
  studioId: string,
  recipientType?: BadgeRecipientType,
): Promise<BadgeDefinition[]> {
  const [defsRes, hiddenRes] = await Promise.all([
    supabase
      .from("badge_definitions")
      .select(
        "id, studio_id, key, category, name, description, icon, tier, xp, is_secret, recipient_type, sort",
      )
      .or(`studio_id.is.null,studio_id.eq.${studioId}`)
      .eq("is_active", true)
      .order("sort", { ascending: true }),
    supabase
      .from("studio_badge_visibility")
      .select("badge_id")
      .eq("studio_id", studioId)
      .eq("hidden", true),
  ]);

  const hidden = new Set((hiddenRes.data ?? []).map((r) => r.badge_id as string));

  return (defsRes.data ?? [])
    .filter((r) => !hidden.has(r.id as string))
    .filter((r) => !recipientType || (r.recipient_type as BadgeRecipientType) === recipientType)
    .map(mapDefinition);
}

function mapDefinition(r: Record<string, unknown>): BadgeDefinition {
  return {
    id: r.id as string,
    key: r.key as string,
    category: r.category as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    icon: (r.icon as string | null) ?? null,
    tier: r.tier as BadgeTier,
    xp: (r.xp as number) ?? 0,
    isSecret: Boolean(r.is_secret),
    recipientType: (r.recipient_type as BadgeRecipientType) ?? "student",
    studioId: (r.studio_id as string | null) ?? null,
    sort: (r.sort as number) ?? 0,
  };
}

// ─── earned ───────────────────────────────────────────────────────────────

export async function fetchProfileBadges(
  supabase: SupabaseClient,
  recipientId: string,
): Promise<EarnedBadge[]> {
  const { data } = await supabase
    .from("profile_badges")
    .select("badge_id, awarded_at, note, awarded_by:profiles!awarded_by ( full_name )")
    .eq("recipient_id", recipientId)
    .order("awarded_at", { ascending: false });

  return (data ?? []).map((r) => {
    const by = r.awarded_by as unknown as { full_name: string | null } | null;
    return {
      badgeId: r.badge_id as string,
      awardedAt: r.awarded_at as string,
      note: (r.note as string | null) ?? null,
      awardedByName: by?.full_name ?? null,
    };
  });
}

// ─── XP / levels ────────────────────────────────────────────────────────────

export async function fetchXpLevels(supabase: SupabaseClient): Promise<XpLevel[]> {
  const { data } = await supabase
    .from("xp_levels")
    .select("level, name, icon, min_xp, max_xp")
    .order("level", { ascending: true });
  return (data ?? []).map((r) => ({
    level: r.level as number,
    name: r.name as string,
    icon: (r.icon as string | null) ?? null,
    minXp: r.min_xp as number,
    maxXp: (r.max_xp as number | null) ?? null,
  }));
}

/** Resolve a total XP figure against the level ladder into a display summary. */
export function summariseXp(totalXp: number, badgeCount: number, levels: XpLevel[]): XpSummary {
  const ordered = [...levels].sort((a, b) => a.minXp - b.minXp);
  const fallback: XpSummary = {
    totalXp,
    badgeCount,
    level: 1,
    levelName: "Little Dancer",
    levelIcon: "🌱",
    nextLevelName: null,
    nextLevelIcon: null,
    xpIntoLevel: totalXp,
    xpForLevel: null,
    xpToNext: null,
  };
  if (ordered.length === 0) return fallback;

  let current = ordered[0];
  for (const lvl of ordered) {
    if (totalXp >= lvl.minXp) current = lvl;
    else break;
  }
  const next = ordered.find((l) => l.level === current.level + 1) ?? null;

  const bandWidth = current.maxXp !== null ? current.maxXp - current.minXp : null;
  return {
    totalXp,
    badgeCount,
    level: current.level,
    levelName: current.name,
    levelIcon: current.icon,
    nextLevelName: next?.name ?? null,
    nextLevelIcon: next?.icon ?? null,
    xpIntoLevel: totalXp - current.minXp,
    xpForLevel: bandWidth,
    xpToNext: current.maxXp !== null ? Math.max(0, current.maxXp - totalXp) : null,
  };
}

// ─── showcase composition ─────────────────────────────────────────────────

/** Merge catalogue + earned into display rows, masking unseen secret badges. */
export function buildShowcase(
  catalogue: BadgeDefinition[],
  earned: EarnedBadge[],
): ShowcaseBadge[] {
  const earnedMap = new Map(earned.map((e) => [e.badgeId, e]));
  return catalogue.map((def) => {
    const got = earnedMap.get(def.id);
    const isEarned = Boolean(got);
    const locked = def.isSecret && !isEarned;
    return {
      id: def.id,
      category: locked ? "secret" : def.category,
      tier: def.tier,
      icon: locked ? "❔" : def.icon,
      name: locked ? "" : def.name,
      description: locked ? null : def.description,
      xp: def.xp,
      isSecret: def.isSecret,
      earned: isEarned,
      locked,
      awardedAt: got?.awardedAt ?? null,
      note: got?.note ?? null,
    };
  });
}

/** One-call bundle for a student surface: showcase + XP/level. */
export async function fetchStudentBadgeBundle(
  supabase: SupabaseClient,
  studioId: string,
  studentId: string,
): Promise<StudentBadgeBundle> {
  const [catalogue, earned, levels, xpRes] = await Promise.all([
    fetchBadgeCatalogue(supabase, studioId, "student"),
    fetchProfileBadges(supabase, studentId),
    fetchXpLevels(supabase),
    supabase
      .from("student_xp")
      .select("total_xp, badge_count")
      .eq("recipient_id", studentId)
      .maybeSingle(),
  ]);

  const totalXp = (xpRes.data?.total_xp as number | undefined) ?? 0;
  const badgeCount = (xpRes.data?.badge_count as number | undefined) ?? 0;
  const showcase = buildShowcase(catalogue, earned);

  return {
    showcase,
    earnedCount: showcase.filter((b) => b.earned).length,
    totalCount: showcase.length,
    xp: summariseXp(totalXp, badgeCount, levels),
  };
}
