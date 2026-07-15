// ============================================================================
//  /portal/parent — Family hub: children overview + invoice list.
//  Server component: fetches guardianships (children + their classes)
//  and invoices billed to this parent. Renders as a client component for
//  animated entrance.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import ParentHub from "@/components/portal/parent/ParentHub";
import FamilyBadges from "@/components/portal/parent/FamilyBadges";
import { ParentShop } from "@/components/portal/parent/ParentShop";
import {
  fetchBadgeCatalogue,
  fetchProfileBadges,
  buildShowcase,
} from "@/lib/portal/badges-data";
import EventsTickets, {
  type ParentEvent,
} from "@/components/portal/parent/EventsTickets";

export type ShopProduct = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  stock_qty: number;
  category: string | null;
  image_url: string | null;
};

export type Child = {
  studentId: string;
  name: string | null;
  classes: {
    id: string;
    name: string;
    discipline: string | null;
    level: string | null;
    dayOfWeek: number;
    startTime: string | null;
    priceCents: number;
    recurringGroupId: string | null;
  }[];
};

export type Invoice = {
  id: string;
  amountCents: number;
  gstCents: number;
  status: string;
  dueDate: string | null;
  issuedAt: string | null;
  studentName: string | null;
};

export default async function ParentPortal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Resolve the parent's studio so shop + events are scoped correctly.
  const { data: parentProfile } = await supabase
    .from("profiles")
    .select("studio_id")
    .eq("id", user!.id)
    .single();
  const studioId = (parentProfile?.studio_id as string | null) ?? null;

  const [
    guardianshipsRes,
    invoicesRes,
    profileRes,
    productsRes,
    eventsRes,
    ticketsRes,
    pendingFormsRes,
    costumeActionRes,
    unreadNotifRes,
  ] = await Promise.all([
    supabase
      .from("guardianships")
      .select(`
        student_id,
        profiles!student_id (
          full_name,
          enrollments (
            id,
            status,
            classes (
              id, name, discipline, level, day_of_week, start_time, price_cents, recurring_group_id
            )
          )
        )
      `)
      .eq("guardian_id", user!.id),

    supabase
      .from("invoices")
      .select(`
        id, amount_cents, gst_cents, status, due_date, issued_at,
        profiles!student_id ( full_name )
      `)
      .eq("payer_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(20),

    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user!.id)
      .single(),

    // Active products for the studio shop (RLS allows studio members to browse).
    supabase
      .from("products")
      .select("id, name, description, price_cents, stock_qty, category, image_url")
      .eq("studio_id", studioId ?? "")
      .eq("active", true)
      .order("name"),

    // Published, upcoming events (RLS exposes only published rows to members).
    supabase
      .from("events")
      .select(
        "id, name, description, event_date, venue_name, venue_address, ticket_price, total_tickets, sold_tickets, image_url",
      )
      .eq("studio_id", studioId ?? "")
      .eq("status", "published")
      .order("event_date", { ascending: true }),

    // This parent's existing tickets, to mark events they already hold.
    supabase
      .from("event_tickets")
      .select("event_id, quantity, status, qr_code")
      .eq("user_id", user!.id),

    // Pending required forms count — fetched after we know studentIds below
    Promise.resolve({ count: 0 }),

    // Costumes needing size confirmation
    Promise.resolve({ count: 0 }),

    // Unread notifications
    supabase
      .from("parent_notifications")
      .select("id", { count: "exact", head: true })
      .eq("parent_id", user!.id)
      .is("read_at", null),
  ]);

  const children: Child[] = (guardianshipsRes.data ?? []).map((g) => {
    const profile = g.profiles as unknown as {
      full_name: string | null;
      enrollments: {
        id: string;
        status: string;
        classes: {
          id: string; name: string; discipline: string | null;
          level: string | null; day_of_week: number; start_time: string | null;
          price_cents: number; recurring_group_id: string | null;
        } | null;
      }[];
    } | null;

    const activeEnrollments = (profile?.enrollments ?? [])
      .filter((e) => e.status === "active" && e.classes)
      .map((e) => ({
        id: e.classes!.id,
        name: e.classes!.name,
        discipline: e.classes!.discipline,
        level: e.classes!.level,
        dayOfWeek: e.classes!.day_of_week,
        startTime: e.classes!.start_time,
        priceCents: e.classes!.price_cents ?? 0,
        recurringGroupId: e.classes!.recurring_group_id ?? null,
      }));

    return {
      studentId: g.student_id,
      name: profile?.full_name ?? null,
      classes: activeEnrollments,
    };
  });

  const invoices: Invoice[] = (invoicesRes.data ?? []).map((inv) => {
    const student = inv.profiles as unknown as { full_name: string | null } | null;
    return {
      id: inv.id,
      amountCents: inv.amount_cents,
      gstCents: inv.gst_cents,
      status: inv.status,
      dueDate: inv.due_date,
      issuedAt: inv.issued_at,
      studentName: student?.full_name ?? null,
    };
  });

  const products: ShopProduct[] = (productsRes.data ?? []) as ShopProduct[];

  const ticketsByEvent = new Map<
    string,
    { quantity: number; status: string; qrCode: string | null }
  >(
    (ticketsRes.data ?? []).map((t) => [
      t.event_id as string,
      {
        quantity: t.quantity as number,
        status: t.status as string,
        qrCode: (t.qr_code as string | null) ?? null,
      },
    ]),
  );

  const events: ParentEvent[] = (eventsRes.data ?? []).map((e) => {
    const held = ticketsByEvent.get(e.id as string) ?? null;
    return {
      id: e.id as string,
      name: e.name as string,
      description: (e.description as string | null) ?? null,
      eventDate: e.event_date as string,
      venueName: (e.venue_name as string | null) ?? null,
      venueAddress: (e.venue_address as string | null) ?? null,
      ticketPrice: e.ticket_price as number,
      ticketsRemaining:
        (e.total_tickets as number) - (e.sold_tickets as number),
      imageUrl: (e.image_url as string | null) ?? null,
      myTicket: held,
    };
  });

  // Parent's own "family" badges (read-only display).
  const familyShowcase = studioId
    ? buildShowcase(
        await fetchBadgeCatalogue(supabase, studioId, "parent"),
        await fetchProfileBadges(supabase, user!.id),
      )
    : [];

  const outstanding = invoices
    .filter((i) => i.status === "sent" || i.status === "overdue")
    .reduce((s, i) => s + i.amountCents, 0);

  const upcomingClasses = children.flatMap((child) =>
    child.classes.map((c) => ({
      childName: child.name ?? "Dancer",
      className: c.name,
      dayOfWeek: c.dayOfWeek,
      startTime: c.startTime,
    }))
  );

  return (
    <>
      <ParentHub
        parentName={profileRes.data?.full_name ?? null}
        familyChildren={children}
        invoices={invoices}
        commandCentre={{
          upcomingClasses,
          outstandingCents: outstanding,
          pendingFormCount: 0,
          costumeActionCount: 0,
          unreadNotificationCount: unreadNotifRes.count ?? 0,
        }}
      />

      {familyShowcase.length > 0 && (
        <div className="mx-auto max-w-5xl px-6 pb-4">
          <FamilyBadges badges={familyShowcase} />
        </div>
      )}

      {(events.length > 0 || products.length > 0) && (
        <div className="mx-auto max-w-5xl space-y-12 px-6 pb-16">
          {events.length > 0 && <EventsTickets events={events} />}
          {products.length > 0 && <ParentShop products={products} />}
        </div>
      )}
    </>
  );
}
