"use client";

// ============================================================================
//  EventsManager — entry screen + production wizard launcher
// ============================================================================

import { useState, useTransition } from "react";
import { ProductionWizard } from "./ProductionWizard";
import { deleteEvent, getFullEvent, type WizardFormState } from "@/app/portal/admin/events/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

// ─── Types (mirrors page.tsx selects) ────────────────────────────────────────

export type EventRow = {
  id:           string;
  name:         string;
  description:  string | null;
  event_type:   string | null;
  event_date:   string;
  venue_name:   string | null;
  ticket_price: number;
  total_tickets: number;
  sold_tickets:  number;
  status:        string;
  image_url:     string | null;
  created_at:    string;
};

export type ProfileRow = {
  id:        string;
  full_name: string | null;
  role:      string;
  email:     string | null;
};

export type ClassRow = {
  id:          string;
  name:        string;
  discipline:  string | null;
  enrollments: { profiles: { id: string; full_name: string | null }[] }[];
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  draft:     "bg-amber-50 text-amber-700 border-amber-200",
  published: "bg-green-50 text-green-700 border-green-200",
  cancelled: "bg-red-50  text-red-700  border-red-200",
  completed: "bg-gray-50 text-gray-600 border-gray-200",
};

const EVENT_TYPE_LABEL: Record<string, string> = {
  recital:     "Recital",
  showcase:    "Showcase",
  concert:     "Concert",
  competition: "Competition",
  workshop:    "Workshop",
  other:       "Event",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-NZ", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });
}

function fmtPrice(cents: number) {
  if (cents === 0) return "Free";
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-20 h-20 rounded-2xl bg-brand/10 flex items-center justify-center mb-5">
        <svg className="w-10 h-10 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z" />
        </svg>
      </div>
      <h3 className="text-lg font-bold text-ink mb-1">No events yet</h3>
      <p className="text-muted text-sm mb-6 max-w-xs">
        Create your first production — set up the show, build the lineup, design the lighting.
      </p>
      <button
        onClick={onNew}
        className="rounded-xl bg-brand text-white px-6 py-2.5 text-sm font-semibold hover:bg-brand/90 transition"
      >
        Create your first event
      </button>
    </div>
  );
}

// ─── Event card ───────────────────────────────────────────────────────────────

function EventCard({
  event,
  onEdit,
  onDelete,
}: {
  event: EventRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const sold = event.sold_tickets;
  const cap  = event.total_tickets;
  const pct  = cap > 0 ? Math.round((sold / cap) * 100) : 0;

  return (
    <div className="group relative rounded-2xl border border-[--hair] bg-surface hover:border-brand/30 hover:shadow-sm transition-all overflow-hidden">
      {/* Colour strip by type */}
      <div className="h-1 w-full bg-gradient-to-r from-brand/60 to-brand/20" />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {/* Type + status pills */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
                {EVENT_TYPE_LABEL[event.event_type ?? ""] ?? "Event"}
              </span>
              <span className={`text-[11px] font-semibold rounded-full border px-2 py-0.5 capitalize ${STATUS_STYLE[event.status] ?? STATUS_STYLE.draft}`}>
                {event.status}
              </span>
            </div>
            <h3 className="text-base font-bold text-ink truncate">{event.name}</h3>
            <p className="text-sm text-muted mt-0.5">{fmtDate(event.event_date)}</p>
            {event.venue_name && (
              <p className="text-xs text-muted mt-0.5 truncate">📍 {event.venue_name}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
            <button
              onClick={onEdit}
              title="Edit event"
              className="p-1.5 rounded-lg hover:bg-brand/10 text-muted hover:text-brand transition"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
            </button>
            {event.status === "draft" && (
              <button
                onClick={() => setConfirmDelete(true)}
                title="Delete draft"
                className="p-1.5 rounded-lg hover:bg-red-50 text-muted hover:text-red-600 transition"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Ticket stats */}
        <div className="mt-4 pt-4 border-t border-[--hair]">
          <div className="flex items-center justify-between text-xs text-muted mb-1.5">
            <span>{fmtPrice(event.ticket_price)} · {sold}/{cap} sold</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-[--subtle] overflow-hidden">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      {/* Delete confirm overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-surface/95 flex flex-col items-center justify-center rounded-2xl gap-3 p-4">
          <p className="text-sm font-semibold text-ink text-center">Delete &ldquo;{event.name}&rdquo;?</p>
          <p className="text-xs text-muted text-center">This cannot be undone. Only drafts can be deleted.</p>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-4 py-2 rounded-xl text-sm bg-[--subtle] text-ink hover:bg-[--hair] transition"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setDeleting(true);
                startTransition(async () => {
                  await deleteEvent(event.id);
                  setConfirmDelete(false);
                  setDeleting(false);
                  onDelete();
                });
              }}
              disabled={deleting}
              className="px-4 py-2 rounded-xl text-sm bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface EventsManagerProps {
  events:   EventRow[];
  profiles: ProfileRow[];
  classes:  ClassRow[];
}

const EMPTY_WIZARD: WizardFormState = {
  name: "", eventType: "recital", description: "", imageUrl: "",
  performances: [{ date: "", doorsOpen: "", curtainUp: "", expectedEnd: "", notes: "" }],
  venueName: "", venueAddress: "", stageType: "proscenium",
  stageWidthM: "", stageDepthM: "", venueNotes: "", techNotes: "",
  crew: [], castGroups: [], quickChangeThresholdMins: 10,
  ticketPrice: 0, totalTickets: 100,
  eventId: null, status: "draft",
};

export function EventsManager({ events: initialEvents, profiles, classes }: EventsManagerProps) {
  const [events, setEvents]         = useState<EventRow[]>(initialEvents);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardInit, setWizardInit] = useState<WizardFormState>(EMPTY_WIZARD);
  const [search, setSearch]         = useState("");
  const [isLoading, setIsLoading]   = useState(false);

  const filtered = events.filter(e =>
    search === "" || e.name.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setWizardInit(EMPTY_WIZARD);
    setWizardOpen(true);
  };

  const openEdit = async (eventId: string) => {
    setIsLoading(true);
    const res = await getFullEvent(eventId);
    setIsLoading(false);
    if (!res.ok) return;

    const ev = res.event;
    setWizardInit({
      name:         ev.name,
      eventType:    ev.eventType,
      description:  ev.description,
      imageUrl:     ev.imageUrl ?? "",
      performances: ev.performances.length > 0
        ? ev.performances
        : [{ date: "", doorsOpen: "", curtainUp: "", expectedEnd: "", notes: "" }],
      venueName:    ev.venueName    ?? "",
      venueAddress: ev.venueAddress ?? "",
      stageType:    ev.stageType,
      stageWidthM:  ev.stageWidthM?.toString() ?? "",
      stageDepthM:  ev.stageDepthM?.toString() ?? "",
      venueNotes:   ev.venueNotes   ?? "",
      techNotes:    ev.techNotes    ?? "",
      crew:         ev.crew,
      castGroups:   ev.castGroups,
      quickChangeThresholdMins: ev.quickChangeThresholdMins,
      ticketPrice:  ev.ticketPrice,
      totalTickets: ev.totalTickets,
      eventId:      ev.id,
      status:       ev.status as "draft" | "published",
    });
    setWizardOpen(true);
  };

  const handleWizardClose = () => {
    setWizardOpen(false);
    window.location.reload();
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Events</h1>
          <p className="text-sm text-muted mt-0.5">
            {events.length === 0 ? "Create your first production" : `${events.length} event${events.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-brand text-white px-5 py-2.5 text-sm font-semibold hover:bg-brand/90 transition shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          New Event
        </button>
      </div>

      {/* Search */}
      {events.length > 0 && (
        <div className="mb-6">
          <div className="relative max-w-xs">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              placeholder="Search events…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-[--hair] bg-surface text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
            />
          </div>
        </div>
      )}

      {/* Loading overlay for edit fetch */}
      {isLoading && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
          <div className="bg-surface rounded-2xl p-6 flex items-center gap-3 shadow-xl">
            <svg className="w-5 h-5 text-brand animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium text-ink">Loading event…</span>
          </div>
        </div>
      )}

      {/* Events grid or empty */}
      {filtered.length === 0 && events.length === 0 ? (
        <EmptyState onNew={openNew} />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted text-center py-12">No events match &ldquo;{search}&rdquo;</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(ev => (
            <EventCard
              key={ev.id}
              event={ev}
              onEdit={() => openEdit(ev.id)}
              onDelete={() => setEvents(prev => prev.filter(e => e.id !== ev.id))}
            />
          ))}
        </div>
      )}

      {/* Production Wizard */}
      {wizardOpen && (
        <ProductionWizard
          initialState={wizardInit}
          profiles={profiles}
          classes={classes}
          onClose={handleWizardClose}
        />
      )}
    </div>
  );
}
