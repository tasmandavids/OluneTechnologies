"use server";

// ============================================================================
//  Events server actions — legacy event CRUD + production wizard
// ============================================================================

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAdminStudio as getAdminStudioAccess } from "@/lib/portal/access";

// ─── Shared helpers ───────────────────────────────────────────────────────────

export type ActionResult = { ok: true } | { ok: false; error: string };

async function getAdminStudio() {
  const ctx = await getAdminStudioAccess();
  return {
    error: ctx.error,
    supabase: ctx.supabase,
    studioId: ctx.studioId,
    userId: ctx.userId,
  };
}

// ─── Legacy types (kept for backward compat with existing EventsManager) ─────

const EventSchema = z.object({
  name:         z.string().min(1).max(200),
  description:  z.string().max(2000).optional().or(z.literal("")),
  eventDate:    z.string().min(1, "Event date required"),
  venueName:    z.string().max(200).optional().or(z.literal("")),
  venueAddress: z.string().max(500).optional().or(z.literal("")),
  ticketPrice:  z.coerce.number().int().min(0),
  totalTickets: z.coerce.number().int().min(1).max(100_000),
  imageUrl:     z.string().url().optional().or(z.literal("")),
  status:       z.enum(["draft", "published"]).default("draft"),
});

export type EventFormData = z.infer<typeof EventSchema>;

export async function createEvent(input: unknown): Promise<ActionResult> {
  const parsed = EventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { error, supabase, studioId, userId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const d = parsed.data;
  const { error: dbErr } = await supabase.from("events").insert({
    studio_id:     studioId,
    name:          d.name,
    description:   d.description || null,
    event_date:    d.eventDate,
    venue_name:    d.venueName || null,
    venue_address: d.venueAddress || null,
    ticket_price:  d.ticketPrice,
    total_tickets: d.totalTickets,
    image_url:     d.imageUrl || null,
    status:        d.status,
    created_by:    userId,
  });

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/events");
  return { ok: true };
}

export async function updateEvent(eventId: string, input: unknown): Promise<ActionResult> {
  const parsed = EventSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const d = parsed.data;
  const { error: dbErr } = await supabase
    .from("events")
    .update({
      name:          d.name,
      description:   d.description || null,
      event_date:    d.eventDate,
      venue_name:    d.venueName || null,
      venue_address: d.venueAddress || null,
      ticket_price:  d.ticketPrice,
      total_tickets: d.totalTickets,
      image_url:     d.imageUrl || null,
      status:        d.status,
    })
    .eq("id", eventId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/events");
  return { ok: true };
}

export async function publishEvent(eventId: string): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("events")
    .update({ status: "published" })
    .eq("id", eventId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/events");
  return { ok: true };
}

export async function cancelEvent(eventId: string): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("events")
    .update({ status: "cancelled" })
    .eq("id", eventId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/events");
  return { ok: true };
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("events")
    .delete()
    .eq("id", eventId)
    .eq("studio_id", studioId)
    .eq("status", "draft");

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/events");
  return { ok: true };
}

export type TicketRow = {
  id:                       string;
  quantity:                 number;
  total_cents:              number;
  status:                   string;
  purchased_at:             string;
  stripe_payment_intent_id: string | null;
  buyerName:                string;
};

export async function getEventTickets(
  eventId: string,
): Promise<{ ok: true; tickets: TicketRow[] } | { ok: false; error: string }> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { data, error: dbErr } = await supabase
    .from("event_tickets")
    .select("id, quantity, total_cents, status, purchased_at, stripe_payment_intent_id, events!inner(studio_id), profiles!event_tickets_user_id_fkey(full_name)")
    .eq("event_id", eventId)
    .eq("events.studio_id", studioId)
    .order("purchased_at", { ascending: false });

  if (dbErr) return { ok: false, error: dbErr.message };

  const tickets: TicketRow[] = (data ?? []).map((t) => {
    const prof = (Array.isArray(t.profiles) ? t.profiles[0] : t.profiles) as
      | { full_name: string | null } | null;
    return {
      id:                       t.id,
      quantity:                 t.quantity,
      total_cents:              t.total_cents,
      status:                   t.status,
      purchased_at:             t.purchased_at,
      stripe_payment_intent_id: t.stripe_payment_intent_id,
      buyerName:                prof?.full_name ?? "Unknown",
    };
  });

  return { ok: true, tickets };
}

// ============================================================================
//  Production Wizard Types
// ============================================================================

export type EventType  = "recital" | "showcase" | "concert" | "competition" | "workshop" | "other";
export type StageType  = "proscenium" | "thrust" | "in_the_round" | "black_box" | "other";
export type ActType    = "number" | "speech" | "awards" | "intermission" | "video" | "scene_change" | "other";
export type LightColor = "warm" | "cool" | "spot" | "red" | "blue" | "green" | "amber" | "white";

export interface PerformanceDraft {
  id?:         string;
  date:        string;      // YYYY-MM-DD
  doorsOpen:   string;      // HH:MM
  curtainUp:   string;      // HH:MM
  expectedEnd: string;      // HH:MM
  notes:       string;
}

export interface CrewDraft {
  id?:         string;
  profileId?:  string;
  displayName: string;
  roleLabel:   string;
  phone:       string;
  email:       string;
  isExternal:  boolean;
}

export interface CastMemberDraft {
  id?:          string;
  profileId:    string;
  displayName:  string;
  roleLabel:    string;
  baseCostume:  string;
  sortOrder:    number;
}

export interface CastGroupDraft {
  id?:        string;
  name:       string;
  sortOrder:  number;
  members:    CastMemberDraft[];
}

export interface LightState {
  id:          string;
  active:      boolean;
  colorPreset: LightColor;
}

export interface FormationPoint {
  castMemberId: string;
  name:         string;
  x:            number; // 0–100 %
  y:            number; // 0–100 %
}

export interface ActCueData {
  lights:       LightState[];
  backdrop:     string;
  sceneryNotes: string;
  formations:   FormationPoint[];
}

export interface MusicCueData {
  id?:          string;
  sourceUrl:    string;
  sourceType:   "spotify" | "apple_music" | "other";
  trackTitle:   string;
  artist:       string;
  thumbnailUrl: string | null;
  durationSecs: number | null;
}

export interface ActParticipantDraft {
  id?:             string;
  castMemberId:    string;
  displayName:     string;
  costumeOverride: string;
}

export interface ActData {
  id?:          string;
  title:        string;
  actType:      ActType;
  durationSecs: number | null;
  notes:        string;
  orderIndex:   number;
  participants: ActParticipantDraft[];
  music:        MusicCueData | null;
  cues:         ActCueData | null;
}

export interface WizardFormState {
  // Step 1 — details
  name:         string;
  eventType:    EventType;
  description:  string;
  imageUrl:     string;
  performances: PerformanceDraft[];
  // Step 2 — venue
  venueName:    string;
  venueAddress: string;
  stageType:    StageType;
  stageWidthM:  string;
  stageDepthM:  string;
  venueNotes:   string;
  techNotes:    string;
  // Step 3 — team
  crew: CrewDraft[];
  // Step 4 — cast
  castGroups:                CastGroupDraft[];
  quickChangeThresholdMins:  number;
  // Step 6 — tickets
  ticketPrice:  number;
  totalTickets: number;
  // Meta
  eventId: string | null;
  status:  "draft" | "published";
}

export type StudioProfile = {
  id:        string;
  full_name: string | null;
  role:      string;
  email:     string | null;
};

export type StudioClass = {
  id:   string;
  name: string;
  discipline: string | null;
  students: { id: string; full_name: string | null }[];
};

// ============================================================================
//  Production Wizard — Step 1: init event + performances
// ============================================================================

export async function initProductionEvent(
  state: Pick<WizardFormState, "name" | "eventType" | "description" | "imageUrl" | "performances" | "ticketPrice" | "totalTickets">
): Promise<{ ok: true; eventId: string } | { ok: false; error: string }> {
  if (!state.name.trim()) return { ok: false, error: "Event name is required" };
  if (state.performances.length === 0) return { ok: false, error: "At least one performance date is required" };

  const { error, supabase, studioId, userId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  // Use first performance date as the canonical event_date
  const firstPerf = state.performances[0];
  const eventDate = firstPerf.curtainUp
    ? `${firstPerf.date}T${firstPerf.curtainUp}:00`
    : `${firstPerf.date}T19:00:00`;

  const { data: ev, error: evErr } = await supabase
    .from("events")
    .insert({
      studio_id:   studioId,
      created_by:  userId,
      name:        state.name.trim(),
      event_type:  state.eventType,
      description: state.description || null,
      image_url:   state.imageUrl || null,
      event_date:  eventDate,
      ticket_price:  state.ticketPrice,
      total_tickets: state.totalTickets || 100,
      status: "draft",
    })
    .select("id")
    .single();

  if (evErr || !ev) return { ok: false, error: evErr?.message ?? "Failed to create event" };

  // Insert performances
  if (state.performances.length > 0) {
    const perfs = state.performances.map((p) => ({
      event_id:    ev.id,
      perf_date:   p.date,
      doors_open:  p.doorsOpen || null,
      curtain_up:  p.curtainUp,
      expected_end: p.expectedEnd || null,
      notes:       p.notes || null,
    }));
    await supabase.from("event_performances").insert(perfs);
  }

  revalidatePath("/portal/admin/events");
  return { ok: true, eventId: ev.id };
}

// ============================================================================
//  Production Wizard — Step 2: venue + stage
// ============================================================================

export async function saveVenueStep(
  eventId: string,
  data: Pick<WizardFormState, "venueName" | "venueAddress" | "stageType" | "stageWidthM" | "stageDepthM" | "venueNotes" | "techNotes">
): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("events")
    .update({
      venue_name:    data.venueName || null,
      venue_address: data.venueAddress || null,
      stage_type:    data.stageType,
      stage_width_m: data.stageWidthM ? parseFloat(data.stageWidthM) : null,
      stage_depth_m: data.stageDepthM ? parseFloat(data.stageDepthM) : null,
      venue_notes:   data.venueNotes || null,
      tech_notes:    data.techNotes  || null,
    })
    .eq("id", eventId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true };
}

// ============================================================================
//  Production Wizard — Step 3: crew
// ============================================================================

export async function saveTeamStep(eventId: string, crew: CrewDraft[]): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  // Verify event belongs to studio
  const { data: ev } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("studio_id", studioId)
    .single();
  if (!ev) return { ok: false, error: "Event not found" };

  // Delete existing crew and re-insert (simpler than diff)
  await supabase.from("event_crew").delete().eq("event_id", eventId);

  if (crew.length > 0) {
    const rows = crew.map((c, i) => ({
      event_id:     eventId,
      profile_id:   c.profileId ?? null,
      display_name: c.displayName,
      role_label:   c.roleLabel,
      phone:        c.phone || null,
      email:        c.email || null,
      is_external:  c.isExternal,
      sort_order:   i,
    }));
    const { error: insErr } = await supabase.from("event_crew").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

// ============================================================================
//  Production Wizard — Step 4: cast groups + members
// ============================================================================

export async function saveCastStep(eventId: string, castGroups: CastGroupDraft[]): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { data: ev } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("studio_id", studioId)
    .single();
  if (!ev) return { ok: false, error: "Event not found" };

  // Delete all existing cast groups + members (cascade deletes members too)
  await supabase.from("event_cast_groups").delete().eq("event_id", eventId);
  // Also delete ungrouped cast members
  await supabase.from("event_cast_members").delete().eq("event_id", eventId);

  for (let gi = 0; gi < castGroups.length; gi++) {
    const group = castGroups[gi];

    // Insert group
    const { data: g, error: gErr } = await supabase
      .from("event_cast_groups")
      .insert({ event_id: eventId, name: group.name, sort_order: gi })
      .select("id")
      .single();
    if (gErr || !g) continue;

    // Insert members
    if (group.members.length > 0) {
      const memberRows = group.members.map((m, mi) => ({
        event_id:     eventId,
        group_id:     g.id,
        profile_id:   m.profileId,
        display_name: m.displayName,
        role_label:   m.roleLabel || "Ensemble",
        base_costume: m.baseCostume || null,
        sort_order:   mi,
      }));
      await supabase.from("event_cast_members").insert(memberRows);
    }
  }

  return { ok: true };
}

// ============================================================================
//  Production Wizard — Step 5: Act CRUD
// ============================================================================

export async function loadBuilderData(eventId: string): Promise<
  | {
      ok: true;
      acts: ActData[];
      castGroups: (CastGroupDraft & { id: string })[];
    }
  | { ok: false; error: string }
> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  // Verify ownership
  const { data: ev } = await supabase
    .from("events")
    .select("id")
    .eq("id", eventId)
    .eq("studio_id", studioId)
    .single();
  if (!ev) return { ok: false, error: "Event not found" };

  // Load acts with nested data
  const { data: actsRaw, error: actsErr } = await supabase
    .from("event_acts")
    .select(`
      id, title, act_type, duration_secs, notes, order_index,
      event_act_participants (
        id, cast_member_id, costume_override,
        event_cast_members ( display_name )
      ),
      event_act_music ( id, source_url, source_type, track_title, artist, thumbnail_url, duration_secs ),
      event_act_cues  ( lights, backdrop, scenery_notes, formations )
    `)
    .eq("event_id", eventId)
    .order("order_index");

  if (actsErr) return { ok: false, error: actsErr.message };

  const acts: ActData[] = (actsRaw ?? []).map((a) => {
    const musicRaw  = Array.isArray(a.event_act_music)  ? a.event_act_music[0]  : a.event_act_music;
    const cuesRaw   = Array.isArray(a.event_act_cues)   ? a.event_act_cues[0]   : a.event_act_cues;
    const partsRaw  = Array.isArray(a.event_act_participants) ? a.event_act_participants : [];

    return {
      id:          a.id,
      title:       a.title,
      actType:     a.act_type as ActType,
      durationSecs: a.duration_secs,
      notes:       a.notes ?? "",
      orderIndex:  a.order_index,
      participants: partsRaw.map((p: any) => ({
        id:              p.id,
        castMemberId:    p.cast_member_id,
        displayName:     p.event_cast_members?.display_name ?? "Unknown",
        costumeOverride: p.costume_override ?? "",
      })),
      music: musicRaw ? {
        id:          musicRaw.id,
        sourceUrl:   musicRaw.source_url,
        sourceType:  musicRaw.source_type as "spotify" | "apple_music" | "other",
        trackTitle:  musicRaw.track_title  ?? "",
        artist:      musicRaw.artist       ?? "",
        thumbnailUrl: musicRaw.thumbnail_url ?? null,
        durationSecs: musicRaw.duration_secs ?? null,
      } : null,
      cues: cuesRaw ? {
        lights:       (cuesRaw.lights       as LightState[])    ?? [],
        backdrop:     cuesRaw.backdrop       ?? "",
        sceneryNotes: cuesRaw.scenery_notes  ?? "",
        formations:   (cuesRaw.formations    as FormationPoint[]) ?? [],
      } : null,
    };
  });

  // Load cast groups
  const { data: groupsRaw } = await supabase
    .from("event_cast_groups")
    .select("id, name, sort_order, event_cast_members ( id, profile_id, display_name, role_label, base_costume, sort_order )")
    .eq("event_id", eventId)
    .order("sort_order");

  const castGroups = (groupsRaw ?? []).map((g: any) => ({
    id:        g.id,
    name:      g.name,
    sortOrder: g.sort_order,
    members:   (g.event_cast_members ?? []).map((m: any) => ({
      id:          m.id,
      profileId:   m.profile_id,
      displayName: m.display_name,
      roleLabel:   m.role_label,
      baseCostume: m.base_costume ?? "",
      sortOrder:   m.sort_order,
    })),
  }));

  return { ok: true, acts, castGroups };
}

export async function createAct(
  eventId: string,
  data: Pick<ActData, "title" | "actType" | "notes"> & { orderIndex: number }
): Promise<{ ok: true; act: ActData } | { ok: false; error: string }> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { data: row, error: dbErr } = await supabase
    .from("event_acts")
    .insert({
      event_id:    eventId,
      title:       data.title || "",
      act_type:    data.actType,
      notes:       data.notes || null,
      order_index: data.orderIndex,
    })
    .select("id, title, act_type, duration_secs, notes, order_index")
    .single();

  if (dbErr || !row) return { ok: false, error: dbErr?.message ?? "Failed to create act" };

  return {
    ok: true,
    act: {
      id:           row.id,
      title:        row.title,
      actType:      row.act_type as ActType,
      durationSecs: row.duration_secs,
      notes:        row.notes ?? "",
      orderIndex:   row.order_index,
      participants: [],
      music:        null,
      cues:         null,
    },
  };
}

export async function updateAct(
  actId: string,
  data: Partial<Pick<ActData, "title" | "actType" | "durationSecs" | "notes">>
): Promise<ActionResult> {
  const { error, supabase } = await getAdminStudio();
  if (error) return { ok: false, error: error ?? "Unknown" };

  const payload: Record<string, unknown> = {};
  if (data.title        !== undefined) payload.title         = data.title;
  if (data.actType      !== undefined) payload.act_type      = data.actType;
  if (data.durationSecs !== undefined) payload.duration_secs = data.durationSecs;
  if (data.notes        !== undefined) payload.notes         = data.notes || null;

  if (Object.keys(payload).length === 0) return { ok: true };

  const { error: dbErr } = await supabase
    .from("event_acts")
    .update(payload)
    .eq("id", actId);

  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true };
}

export async function deleteAct(actId: string): Promise<ActionResult> {
  const { error, supabase } = await getAdminStudio();
  if (error) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase.from("event_acts").delete().eq("id", actId);
  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true };
}

export async function reorderActs(orderedIds: string[]): Promise<ActionResult> {
  const { error, supabase } = await getAdminStudio();
  if (error) return { ok: false, error: error ?? "Unknown" };

  // Update order_index for each act
  const updates = orderedIds.map((id, i) =>
    supabase.from("event_acts").update({ order_index: i }).eq("id", id)
  );
  await Promise.all(updates);
  return { ok: true };
}

// ─── Participants ─────────────────────────────────────────────────────────────

export async function upsertActParticipants(
  actId: string,
  participants: ActParticipantDraft[]
): Promise<ActionResult> {
  const { error, supabase } = await getAdminStudio();
  if (error) return { ok: false, error: error ?? "Unknown" };

  // Delete existing, then re-insert
  await supabase.from("event_act_participants").delete().eq("act_id", actId);

  if (participants.length > 0) {
    const rows = participants.map((p) => ({
      act_id:          actId,
      cast_member_id:  p.castMemberId,
      costume_override: p.costumeOverride || null,
    }));
    const { error: insErr } = await supabase.from("event_act_participants").insert(rows);
    if (insErr) return { ok: false, error: insErr.message };
  }

  return { ok: true };
}

export async function updateParticipantCostume(
  actId: string,
  castMemberId: string,
  costumeOverride: string
): Promise<ActionResult> {
  const { error, supabase } = await getAdminStudio();
  if (error) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("event_act_participants")
    .update({ costume_override: costumeOverride || null })
    .eq("act_id", actId)
    .eq("cast_member_id", castMemberId);

  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true };
}

// ─── Music cue ───────────────────────────────────────────────────────────────

export async function fetchMusicMetadata(
  url: string
): Promise<{ ok: true; meta: Omit<MusicCueData, "id" | "sourceUrl"> } | { ok: false; error: string }> {
  const isSpotify     = url.includes("spotify.com");
  const isAppleMusic  = url.includes("music.apple.com");

  if (!isSpotify && !isAppleMusic) {
    return { ok: false, error: "Paste a Spotify or Apple Music track URL" };
  }

  const oembedBase = isSpotify
    ? "https://open.spotify.com/oembed"
    : "https://music.apple.com/oembed";

  try {
    const res = await fetch(`${oembedBase}?url=${encodeURIComponent(url)}`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return { ok: false, error: "Could not fetch track info — check the URL" };

    const data = await res.json() as {
      title?: string;
      author_name?: string;
      thumbnail_url?: string;
      duration?: number;
    };

    return {
      ok: true,
      meta: {
        sourceType:   isSpotify ? "spotify" : "apple_music",
        trackTitle:   data.title        ?? "Unknown track",
        artist:       data.author_name  ?? "Unknown artist",
        thumbnailUrl: data.thumbnail_url ?? null,
        durationSecs: data.duration     ?? null,
      },
    };
  } catch {
    return { ok: false, error: "Network error fetching track info" };
  }
}

export async function saveActMusic(
  actId: string,
  sourceUrl: string,
  meta: Omit<MusicCueData, "id" | "sourceUrl">
): Promise<{ ok: true; music: MusicCueData } | { ok: false; error: string }> {
  const { error, supabase } = await getAdminStudio();
  if (error) return { ok: false, error: error ?? "Unknown" };

  const row = {
    act_id:       actId,
    source_url:   sourceUrl,
    source_type:  meta.sourceType,
    track_title:  meta.trackTitle,
    artist:       meta.artist,
    thumbnail_url: meta.thumbnailUrl,
    duration_secs: meta.durationSecs,
  };

  const { data, error: dbErr } = await supabase
    .from("event_act_music")
    .upsert(row, { onConflict: "act_id" })
    .select("id, source_url, source_type, track_title, artist, thumbnail_url, duration_secs")
    .single();

  if (dbErr || !data) return { ok: false, error: dbErr?.message ?? "Failed to save music" };

  return {
    ok: true,
    music: {
      id:           data.id,
      sourceUrl:    data.source_url,
      sourceType:   data.source_type as "spotify" | "apple_music" | "other",
      trackTitle:   data.track_title  ?? "",
      artist:       data.artist       ?? "",
      thumbnailUrl: data.thumbnail_url ?? null,
      durationSecs: data.duration_secs ?? null,
    },
  };
}

export async function removeActMusic(actId: string): Promise<ActionResult> {
  const { error, supabase } = await getAdminStudio();
  if (error) return { ok: false, error: error ?? "Unknown" };

  await supabase.from("event_act_music").delete().eq("act_id", actId);
  return { ok: true };
}

// ─── Stage cues ──────────────────────────────────────────────────────────────

export async function saveActCues(actId: string, cues: ActCueData): Promise<ActionResult> {
  const { error, supabase } = await getAdminStudio();
  if (error) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("event_act_cues")
    .upsert(
      {
        act_id:        actId,
        lights:        cues.lights       as unknown as any,
        backdrop:      cues.backdrop      || null,
        scenery_notes: cues.sceneryNotes  || null,
        formations:    cues.formations   as unknown as any,
      },
      { onConflict: "act_id" }
    );

  if (dbErr) return { ok: false, error: dbErr.message };
  return { ok: true };
}

// ============================================================================
//  Production Wizard — Step 6: finalize + publish
// ============================================================================

export async function finalizeEvent(
  eventId: string,
  data: { ticketPrice: number; totalTickets: number; status: "draft" | "published" }
): Promise<ActionResult> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { error: dbErr } = await supabase
    .from("events")
    .update({
      ticket_price:  data.ticketPrice,
      total_tickets: data.totalTickets,
      status:        data.status,
    })
    .eq("id", eventId)
    .eq("studio_id", studioId);

  if (dbErr) return { ok: false, error: dbErr.message };
  revalidatePath("/portal/admin/events");
  return { ok: true };
}

// ─── Load full event for editing ─────────────────────────────────────────────

export interface FullEventData {
  id:          string;
  name:        string;
  eventType:   EventType;
  description: string;
  imageUrl:    string | null;
  venueName:   string | null;
  venueAddress: string | null;
  stageType:   StageType;
  stageWidthM: number | null;
  stageDepthM: number | null;
  venueNotes:  string | null;
  techNotes:   string | null;
  ticketPrice: number;
  totalTickets: number;
  status:      string;
  quickChangeThresholdMins: number;
  performances: PerformanceDraft[];
  crew:         CrewDraft[];
  castGroups:   (CastGroupDraft & { id: string })[];
}

export async function getFullEvent(
  eventId: string
): Promise<{ ok: true; event: FullEventData } | { ok: false; error: string }> {
  const { error, supabase, studioId } = await getAdminStudio();
  if (error || !studioId) return { ok: false, error: error ?? "Unknown" };

  const { data: ev, error: evErr } = await supabase
    .from("events")
    .select(`
      id, name, event_type, description, image_url,
      venue_name, venue_address, stage_type, stage_width_m, stage_depth_m,
      venue_notes, tech_notes, ticket_price, total_tickets, status,
      quick_change_threshold_mins,
      event_performances ( id, perf_date, doors_open, curtain_up, expected_end, notes ),
      event_crew ( id, profile_id, display_name, role_label, phone, email, is_external, sort_order ),
      event_cast_groups (
        id, name, sort_order,
        event_cast_members ( id, profile_id, display_name, role_label, base_costume, sort_order )
      )
    `)
    .eq("id", eventId)
    .eq("studio_id", studioId)
    .single();

  if (evErr || !ev) return { ok: false, error: evErr?.message ?? "Event not found" };

  const performances: PerformanceDraft[] = (ev.event_performances ?? []).map((p: any) => ({
    id:          p.id,
    date:        p.perf_date,
    doorsOpen:   p.doors_open   ?? "",
    curtainUp:   p.curtain_up   ?? "",
    expectedEnd: p.expected_end ?? "",
    notes:       p.notes        ?? "",
  }));

  const crew: CrewDraft[] = ((ev.event_crew as any[]) ?? []).map((c) => ({
    id:          c.id,
    profileId:   c.profile_id  ?? undefined,
    displayName: c.display_name,
    roleLabel:   c.role_label,
    phone:       c.phone ?? "",
    email:       c.email ?? "",
    isExternal:  c.is_external,
  }));

  const castGroups = ((ev.event_cast_groups as any[]) ?? []).map((g) => ({
    id:        g.id,
    name:      g.name,
    sortOrder: g.sort_order,
    members:   (g.event_cast_members ?? []).map((m: any) => ({
      id:          m.id,
      profileId:   m.profile_id,
      displayName: m.display_name,
      roleLabel:   m.role_label,
      baseCostume: m.base_costume ?? "",
      sortOrder:   m.sort_order,
    })),
  }));

  return {
    ok: true,
    event: {
      id:          ev.id,
      name:        ev.name,
      eventType:   (ev.event_type  as EventType)  ?? "recital",
      description: ev.description  ?? "",
      imageUrl:    ev.image_url    ?? null,
      venueName:   ev.venue_name   ?? null,
      venueAddress: ev.venue_address ?? null,
      stageType:   (ev.stage_type  as StageType)  ?? "proscenium",
      stageWidthM: ev.stage_width_m  ?? null,
      stageDepthM: ev.stage_depth_m  ?? null,
      venueNotes:  ev.venue_notes    ?? null,
      techNotes:   ev.tech_notes     ?? null,
      ticketPrice: ev.ticket_price,
      totalTickets: ev.total_tickets,
      status:      ev.status,
      quickChangeThresholdMins: ev.quick_change_threshold_mins ?? 10,
      performances,
      crew,
      castGroups,
    },
  };
}
