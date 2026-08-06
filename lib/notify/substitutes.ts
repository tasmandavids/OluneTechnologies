import "server-only";

// ============================================================================
//  Substitute-cover notifications.
//
//  0070 built the substitutes board and nothing that tells anyone about it.
//  A request was inserted and teachers found out only if they happened to open
//  the board — for the single most time-critical workflow in the product, where
//  a teacher is sick and a class starts in four hours.
//
//  Both sides are covered here so the two call sites can't drift:
//   • posting a request  → every other teacher in the studio (email + SMS)
//   • someone claiming it → the person who posted it (email)
//
//  Notification failures never fail the underlying action. A cover request that
//  saved but didn't send is recoverable — the board still shows it. A request
//  that refused to save because an SMS bounced is not.
// ============================================================================

import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal shape we need — avoids dragging generated DB types through here. */
type Client = Pick<SupabaseClient, "from">;

export type SubstituteRequestSummary = {
  id: string;
  studioId: string;
  className: string;
  date: string;
  startTime: string;
  postedBy: string;
};

/** "Tue 12 Aug" — short enough for an SMS, unambiguous in a list. */
function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  return parsed.toLocaleDateString("en-NZ", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

/** Trim seconds off a stored `time` value: 16:00:00 → 16:00. */
function formatTime(time: string): string {
  return time.slice(0, 5);
}

/**
 * Tell the studio's teachers that a class needs covering.
 *
 * Everyone with the teacher role except whoever posted it. Admins are excluded
 * deliberately: they are usually the ones posting, and an admin who wants the
 * board can open it.
 */
export async function notifySubstituteRequested(
  supabase: Client,
  request: SubstituteRequestSummary,
): Promise<void> {
  const { data: teachers } = await supabase
    .from("profiles")
    .select("id")
    .eq("studio_id", request.studioId)
    .eq("role", "teacher");

  const recipients = (teachers ?? [])
    .map((t) => t.id as string)
    .filter((id) => id !== request.postedBy);

  if (recipients.length === 0) return;

  const when = `${formatDate(request.date)} at ${formatTime(request.startTime)}`;

  const { error } = await supabase.from("notifications").insert(
    recipients.map((userId) => ({
      studio_id: request.studioId,
      user_id: userId,
      type: "substitute_needed",
      title: `Cover needed: ${request.className}`,
      body: `${when}. First to claim it takes the class.`,
      link: "/portal/teacher/substitutes",
      payload: { request_id: request.id },
    })),
  );

  if (error) {
    console.error(`[substitutes] failed to notify teachers for ${request.id}: ${error.message}`);
  }
}

/**
 * Tell the poster their class is covered.
 *
 * The whole point of posting is not having to chase it, so the answer has to
 * come back without them checking.
 */
export async function notifySubstituteFilled(
  supabase: Client,
  request: SubstituteRequestSummary,
  filledByName: string | null,
): Promise<void> {
  const who = filledByName?.trim() || "Someone";
  const when = `${formatDate(request.date)} at ${formatTime(request.startTime)}`;

  const { error } = await supabase.from("notifications").insert({
    studio_id: request.studioId,
    user_id: request.postedBy,
    type: "substitute_filled",
    title: `${request.className} is covered`,
    body: `${who} picked up ${when}.`,
    link: "/portal/teacher/substitutes",
    payload: { request_id: request.id },
  });

  if (error) {
    console.error(`[substitutes] failed to notify poster of ${request.id}: ${error.message}`);
  }
}
