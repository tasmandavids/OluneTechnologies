-- Audit D-04: one ticket row per purchase, not per (event, buyer).
-- Re-buying after a refund used to rewrite the refunded row, so the first sale
-- and its refund vanished from Books and Xero. A buyer may now hold many
-- historical rows but only one live (reserved or paid) row per event.
alter table public.event_tickets
  drop constraint if exists event_tickets_event_id_user_id_key;

create unique index if not exists event_tickets_one_live_per_buyer
  on public.event_tickets (event_id, user_id)
  where status in ('reserved', 'paid');
