// ============================================================================
//  /portal/student — Timetable (minors) or full self-service hub (adult students).
// ============================================================================

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StudentTimetable from "@/components/portal/student/StudentTimetable";
import AdultStudentHub from "@/components/portal/student/AdultStudentHub";
import { ParentShop } from "@/components/portal/parent/ParentShop";
import EventsTickets, { type ParentEvent } from "@/components/portal/parent/EventsTickets";
import { type StudentPass } from "@/components/portal/student/BuyClassPass";
import { CLASS_PASS_PRICE_CENTS } from "@/lib/passes/constants";
import CheckinCardPanel from "@/components/portal/checkin/CheckinCardPanel";
import { fetchPortalCheckinCards } from "@/lib/portal/checkin-card-data";
import { isAppleWalletConfigured } from "@/lib/apple-wallet/config";
import type { Child, Invoice, ShopProduct } from "@/app/portal/parent/page";

export type EnrolledClass = {
  enrollmentId: string;
  classId: string;
  name: string;
  discipline: string | null;
  level: string | null;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  capacity: number;
  teacherName: string | null;
  priceCents: number;
  recurringGroupId: string | null;
};

export default async function StudentPortal() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, studio_id, self_managed, birthday")
    .eq("id", user!.id)
    .single();

  const { data: rows } = await supabase
    .from("enrollments")
    .select(`
      id,
      classes (
        id, name, discipline, level,
        day_of_week, start_time, end_time, capacity, price_cents, recurring_group_id,
        profiles!teacher_id ( full_name )
      )
    `)
    .eq("student_id", user!.id)
    .eq("status", "active");

  const classes: EnrolledClass[] = (rows ?? [])
    .map((r) => {
      const c = r.classes as unknown as {
        id: string; name: string; discipline: string | null; level: string | null;
        day_of_week: number; start_time: string | null; end_time: string | null;
        capacity: number; price_cents: number; recurring_group_id: string | null;
        profiles: { full_name: string | null } | null;
      } | null;
      if (!c) return null;
      return {
        enrollmentId: r.id as string,
        classId: c.id,
        name: c.name,
        discipline: c.discipline,
        level: c.level,
        dayOfWeek: c.day_of_week,
        startTime: c.start_time,
        endTime: c.end_time,
        capacity: c.capacity,
        teacherName: c.profiles?.full_name ?? null,
        priceCents: c.price_cents ?? 0,
        recurringGroupId: c.recurring_group_id ?? null,
      };
    })
    .filter((c): c is EnrolledClass => c !== null)
    .sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return (a.startTime ?? "").localeCompare(b.startTime ?? "");
    });

  const todayDow = new Date().getDay();

  // The student's own check-in card, if the front desk has issued one. Shown to
  // minors and adults alike — 0108 widened the self-read policy for exactly this.
  const checkinCards = await fetchPortalCheckinCards(
    supabase,
    [user!.id],
    new Map([[user!.id, profile?.full_name ?? null]]),
  );
  const appleWalletEnabled = isAppleWalletConfigured();

  if (!profile?.self_managed) {
    return (
      <>
        <CheckinCardPanel cards={checkinCards} appleWalletEnabled={appleWalletEnabled} />
        <StudentTimetable
          classes={classes}
          studentName={profile?.full_name ?? null}
          todayDow={todayDow}
        />
      </>
    );
  }

  if (!profile.full_name?.trim() || !profile.birthday) {
    redirect("/portal/student/complete-profile");
  }

  const studioId = profile.studio_id as string;
  const selfChild: Child = {
    studentId: user!.id,
    name: profile.full_name,
    classes: classes.map((c) => ({
      id: c.classId,
      name: c.name,
      discipline: c.discipline,
      level: c.level,
      dayOfWeek: c.dayOfWeek,
      startTime: c.startTime,
      priceCents: c.priceCents ?? 0,
      recurringGroupId: c.recurringGroupId,
    })),
  };

  const [invoicesRes, productsRes, eventsRes, ticketsRes, passesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, amount_cents, gst_cents, status, due_date, issued_at, profiles!student_id ( full_name )")
      .eq("payer_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("products")
      .select("id, name, description, price_cents, stock_qty, category, image_url")
      .eq("studio_id", studioId)
      .eq("active", true)
      .order("name"),
    supabase
      .from("events")
      .select("id, name, description, event_date, venue_name, venue_address, ticket_price, total_tickets, sold_tickets, image_url")
      .eq("studio_id", studioId)
      .eq("status", "published")
      .order("event_date", { ascending: true }),
    supabase.from("event_tickets").select("event_id, quantity, status, qr_code").eq("user_id", user!.id),
    supabase
      .from("class_passes")
      .select("id, status, price_cents, qr_code, purchased_at, redeemed_at")
      .eq("student_id", user!.id)
      .order("purchased_at", { ascending: false }),
  ]);

  const invoices: Invoice[] = (invoicesRes.data ?? []).map((inv) => ({
    id: inv.id as string,
    amountCents: inv.amount_cents as number,
    gstCents: inv.gst_cents as number,
    status: inv.status as string,
    dueDate: inv.due_date as string | null,
    issuedAt: inv.issued_at as string | null,
    studentName: profile.full_name,
  }));

  const products = (productsRes.data ?? []) as ShopProduct[];
  const ticketsByEvent = new Map(
    (ticketsRes.data ?? []).map((t) => [
      t.event_id as string,
      { quantity: t.quantity as number, status: t.status as string, qrCode: (t.qr_code as string | null) ?? null },
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
      ticketsRemaining: (e.total_tickets as number) - (e.sold_tickets as number),
      imageUrl: (e.image_url as string | null) ?? null,
      myTicket: held,
    };
  });

  const passes: StudentPass[] = (passesRes.data ?? []).map((p) => ({
    id: p.id as string,
    status: p.status as StudentPass["status"],
    priceCents: p.price_cents as number,
    qrCode: (p.qr_code as string | null) ?? null,
    purchasedAt: p.purchased_at as string,
    redeemedAt: (p.redeemed_at as string | null) ?? null,
  }));

  return (
    <>
      <CheckinCardPanel cards={checkinCards} appleWalletEnabled={appleWalletEnabled} />

      <AdultStudentHub
        studentName={profile.full_name}
        selfChild={selfChild}
        classes={classes}
        invoices={invoices}
        todayDow={todayDow}
        passes={passes}
        passPriceCents={CLASS_PASS_PRICE_CENTS}
      />
      {(events.length > 0 || products.length > 0) && (
        <div className="mx-auto max-w-5xl space-y-12 px-6 pb-16">
          {events.length > 0 && <EventsTickets events={events} />}
          {products.length > 0 && <ParentShop products={products} />}
        </div>
      )}
    </>
  );
}
