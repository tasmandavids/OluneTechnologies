import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { CostumeHub } from "@/components/portal/parent/CostumeHub";
import { updateCostumeSize } from "./actions";
import { requireModule } from "@/lib/portal/require-module";

export default async function RecitalPage() {
  // Costume hub is dance-only; redirects to the parent home when off.
  await requireModule("costumes");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: guardianships } = await supabase
    .from("guardianships")
    .select("student_id")
    .eq("guardian_id", user.id);

  const studentIds = (guardianships ?? []).map((g) => g.student_id as string);

  const [costumesRes, eventsRes] = await Promise.all([
    studentIds.length
      ? supabase
          .from("student_costumes")
          .select(`
            id, costume_name, size_label, size_notes, colour, status,
            price_cents, paid, fitting_date, return_required, notes,
            profiles!student_id ( full_name ),
            classes ( name ),
            events ( name, event_date, venue_name )
          `)
          .in("student_id", studentIds)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),

    supabase
      .from("events")
      .select("id, name, event_date, venue_name, photo_day_date, info_pack_url, running_order_notes")
      .gte("event_date", new Date().toISOString())
      .order("event_date")
      .limit(5),
  ]);

  const costumes = (costumesRes.data ?? []).map((c) => {
    const p = c.profiles as unknown as { full_name: string | null } | null;
    const cl = c.classes as unknown as { name: string } | null;
    const ev = c.events as unknown as { name: string; event_date: string | null; venue_name: string | null } | null;
    return {
      id: c.id as string,
      costumeName: c.costume_name as string,
      sizeLabel: (c.size_label as string | null) ?? null,
      sizeNotes: (c.size_notes as string | null) ?? null,
      colour: (c.colour as string | null) ?? null,
      status: c.status as string,
      priceCents: (c.price_cents as number | null) ?? null,
      paid: c.paid as boolean,
      fittingDate: (c.fitting_date as string | null) ?? null,
      returnRequired: c.return_required as boolean,
      notes: (c.notes as string | null) ?? null,
      studentName: p?.full_name ?? null,
      className: cl?.name ?? null,
      eventName: ev?.name ?? null,
    };
  });

  const recitals = (eventsRes.data ?? []).map((e) => ({
    eventName: e.name as string,
    eventDate: (e.event_date as string | null) ?? null,
    venue: (e.venue_name as string | null) ?? null,
    photoDay: (e.photo_day_date as string | null) ?? null,
    runningOrder: (e.running_order_notes as string | null) ?? null,
    ticketLink: null,
    infoPack: (e.info_pack_url as string | null) ?? null,
  }));

  return (
    <CostumeHub
      costumes={costumes}
      recitals={recitals}
      onUpdateSize={updateCostumeSize}
    />
  );
}
