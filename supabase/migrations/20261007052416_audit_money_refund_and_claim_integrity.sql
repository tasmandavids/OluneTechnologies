-- Audit B-03: one ledger row per Stripe refund. charge.refunded used to key
-- the ledger on the charge id when the refund list was absent, so partial
-- refunds were recorded as cumulative totals. Production has no duplicates.
create unique index if not exists payments_stripe_refund_id_key
  on public.payments (stripe_refund_id)
  where stripe_refund_id is not null;

-- Audit B-16: webhook claims could never expire. processed_at distinguishes a
-- finished event from a claim left behind by a crashed handler; the latter is
-- re-claimable after a few minutes. Existing rows were all handled (a failed
-- handler deleted its claim), so they are backfilled as processed.
alter table public.stripe_events add column if not exists processed_at timestamptz;
update public.stripe_events set processed_at = received_at where processed_at is null;
