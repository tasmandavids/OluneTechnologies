// ============================================================================
//  /portal/admin/events/scan — recital door check-in.
//
//  Tickets have carried a QR code since 0009 with nothing to scan it; this is
//  the door. Lists the events worth scanning (published, and not long past)
//  and hands off to the scanner.
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireModule } from "@/lib/portal/require-module";
import { TicketScanner, type ScannableEvent } from "@/components/admin/events/TicketScanner";

export const dynamic = "force-dynamic";

/** How long after an event it still makes sense to admit someone. */
const TAIL_HOURS = 12;

export default async function EventScanPage() {
  await requireModule("production");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/portal/admin");

  // Doors open before the advertised time and people arrive late, so the window
  // runs from now-minus-a-shift rather than from the event time exactly.
  const from = new Date(Date.now() - TAIL_HOURS * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from("events")
    .select("id, name, event_date")
    .eq("studio_id", profile.studio_id)
    .eq("status", "published")
    .gte("event_date", from)
    .order("event_date", { ascending: true });

  const scannable: ScannableEvent[] = (events ?? []).map((e) => ({
    id: e.id as string,
    name: e.name as string,
    eventDate: e.event_date as string,
  }));

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <TicketScanner events={scannable} />
    </div>
  );
}
