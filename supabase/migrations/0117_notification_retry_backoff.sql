-- ============================================================================
--  0117_notification_retry_backoff.sql
--
--  Prerequisite for raising the cron cadence, not a feature.
--
--  /api/cron/deliver-notifications retries a failed send up to MAX_ATTEMPTS on
--  "the next pass". That constant was written when every cron in vercel.json
--  ran once daily, so three attempts spanned three days and a transient Resend
--  or Twilio outage was ridden out for free.
--
--  Raising deliver-notifications to a 5-minute cadence — which the product
--  needs, because a same-day substitute SMS arriving up to 24h later is worse
--  than not offering it — silently turns that into three attempts in fifteen
--  minutes. A twenty-minute provider outage would exhaust every retry and mark
--  real notifications permanently delivered-with-error. The cadence change is
--  therefore unsafe until retries carry their own schedule.
--
--  `next_attempt_at` is that schedule. Deliberately stored as the NEXT eligible
--  time rather than the LAST attempt time: the delivery query then filters on
--  a plain `next_attempt_at <= now()`, which is indexable, instead of needing
--  per-row interval arithmetic against delivery_attempts that PostgREST cannot
--  express and that would force the batch to be over-fetched and filtered in JS.
--
--  NULL means "never attempted, send on the next pass", so every row already in
--  the queue when this lands stays immediately eligible. No backfill.
-- ============================================================================

alter table public.notifications
  add column if not exists next_attempt_at timestamptz;

--  Replaces the plain (sent_at) queue index from 0024. Rows waiting out a
--  backoff still sit in the index; the route's filter skips them by value, and
--  keeping them here means one index serves both the "due now" read and the
--  oldest-first ordering.
--
--  nulls first matters: a never-attempted row must sort ahead of a row that has
--  already failed once, so a provider outage can't starve fresh notifications.
create index if not exists notifications_delivery_due_idx
  on public.notifications(next_attempt_at nulls first, sent_at)
  where delivered_at is null;

drop index if exists public.notifications_delivery_queue_idx;

comment on column public.notifications.next_attempt_at is
  'Earliest time the delivery cron may retry this row. NULL = never attempted. Set by /api/cron/deliver-notifications on a retryable failure; see lib/notify/backoff.ts for the schedule.';
