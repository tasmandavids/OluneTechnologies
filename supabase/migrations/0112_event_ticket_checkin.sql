-- ============================================================================
--  0112_event_ticket_checkin.sql
--
--  Make recital tickets scannable at the door.
--
--  0009 gave every ticket a QR code and nothing to scan it with. The image is
--  generated at purchase, stored on the row, shown to the parent — and there
--  is no column recording a check-in, no endpoint accepting a scan, and no
--  door UI. On recital night the studio has a phone and a queue of families
--  holding decorative QR codes.
--
--  Two problems are fixed here.
--
--  1. NO CHECK-IN STATE. Added below: checked_in_at / checked_in_by. Deliberately
--     modelled on class_passes (0091) rather than inventing a second shape —
--     a nullable timestamp claimed by a single conditional UPDATE is what makes
--     double-scanning fail cleanly, including when two door staff scan the same
--     family at the same moment.
--
--  2. THE QR PAYLOAD IS UNGUARDED. 0009 encodes
--       { event_id, event_name, event_date, user_id, quantity, issued_at }
--     with no secret and no server-side cross-check. Every field is either
--     public or self-reported, and `quantity` is self-reported by the holder —
--     so anyone able to read their own ticket knows an event_id and a user_id,
--     and could mint a QR claiming any number of seats.
--
--     qr_token below is the same defence class_passes already uses: an
--     unguessable per-ticket secret that the scanner matches against the row.
--     The scan endpoint additionally ignores `quantity` from the payload and
--     reads it from the row, so a forged payload cannot inflate a party size
--     even if a token leaks.
--
--     Existing tickets get a fresh token from the default, which their already
--     printed/emailed QR image does NOT contain. The scan endpoint therefore
--     keeps a legacy path (resolve by event_id + user_id when no token is
--     present) so tickets bought before today still scan. That path is no
--     weaker than what shipped — it is the status quo plus a check-in record —
--     and it retires by itself as those events pass.
-- ============================================================================

alter table public.event_tickets
  add column if not exists qr_token      uuid not null default gen_random_uuid(),
  add column if not exists checked_in_at timestamptz,
  add column if not exists checked_in_by uuid references public.profiles(id);

-- The scanner resolves a ticket by token alone, so it must be unique and fast.
create unique index if not exists event_tickets_qr_token_idx
  on public.event_tickets(qr_token);

-- Door view: "who has arrived for this event". Partial, because the door only
-- ever asks about tickets that HAVE been scanned; unscanned rows are the
-- complement and are already covered by event_tickets_event_idx.
create index if not exists event_tickets_checked_in_idx
  on public.event_tickets(event_id, checked_in_at)
  where checked_in_at is not null;

comment on column public.event_tickets.qr_token is
  'Unguessable per-ticket secret encoded in the QR payload. Rotated whenever the ticket is re-issued (upsert on re-purchase), which invalidates the previous QR.';
comment on column public.event_tickets.checked_in_at is
  'Set once, by a single conditional UPDATE, the first time the ticket is scanned at the door. A second scan matches zero rows and is reported as a duplicate.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
--
--  No policy changes needed. event_tickets_admin_all (0009, re-stated in 0047)
--  already grants studio admins full access to tickets for their own events,
--  which covers the new columns, and event_tickets_own keeps the holder's own
--  row readable. The scan endpoint runs as the signed-in admin, so the check-in
--  UPDATE is tenant-scoped by that existing policy rather than by service role.
