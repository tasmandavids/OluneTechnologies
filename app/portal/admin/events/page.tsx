// ============================================================================
//  /portal/admin/events — Events management hub (server component shell)
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { EventsManager } from "@/components/admin/events/EventsManager";
import { requireModule } from "@/lib/portal/require-module";

export const dynamic = "force-dynamic";

export default async function EventsPage() {
  // Recitals and productions are dance-only. Redirects to the role home for a
  // studio whose pack omits the module, so a direct URL is not a way in.
  await requireModule("production");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("studio_id, role")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "admin") redirect("/portal/admin");

  const studioId = profile.studio_id;

  // Events list
  const { data: events } = await supabase
    .from("events")
    .select("id, name, description, event_type, event_date, venue_name, ticket_price, total_tickets, sold_tickets, status, image_url, created_at")
    .eq("studio_id", studioId)
    .order("event_date", { ascending: true });

  // All studio profiles — used for team + cast picker in the wizard
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, role, email")
    .eq("studio_id", studioId)
    .order("full_name");

  // Classes with enrolled students — for cast roster import
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name, discipline, enrollments!inner(profiles!enrollments_student_id_fkey(id, full_name))")
    .eq("studio_id", studioId)
    .eq("enrollments.status", "active")
    .order("name");

  return (
    <EventsManager
      events={events ?? []}
      profiles={profiles ?? []}
      classes={classes ?? []}
    />
  );
}
