-- ============================================================================
--  0116_lead_attribution.sql
--
--  Record where a lead actually came from.
--
--  0006 gave leads a free-text `source`, and app/enrol/actions.ts has always
--  written the literal string "enrol-page" into it. That records which FORM was
--  used, not which channel produced the family — so every lead in the table
--  looks identical, and no studio has ever been able to answer the only
--  question that matters about marketing spend: which of these is working.
--
--  `source` is kept and still written: it distinguishes an enrolment-page
--  enquiry from a walk-in or a manually added lead, which is a real (if
--  smaller) distinction. The columns below carry the channel.
--
--  FIRST-touch semantics — see lib/analytics/attribution.ts for why last-touch
--  would credit "direct" for almost every conversion.
--
--  Everything here originates in a query string or a Referer header, i.e. it is
--  attacker-controlled. It is length-capped in application code before insert,
--  and these columns are only ever rendered as text, never as HTML or SQL.
-- ============================================================================

alter table public.leads
  add column if not exists utm_source   text,
  add column if not exists utm_medium   text,
  add column if not exists utm_campaign text,
  add column if not exists utm_term     text,
  add column if not exists utm_content  text,
  add column if not exists referrer     text,
  add column if not exists landing_path text;

-- "How many leads did each channel produce this term" — the report this whole
-- migration exists to make possible. Leads is small per studio, so one
-- composite index leading on studio_id covers the grouping and the filtering.
create index if not exists leads_studio_source_idx
  on public.leads(studio_id, utm_source);

comment on column public.leads.utm_source is
  'First-touch acquisition channel, captured from the visitor''s landing URL (or inferred from gclid/fbclid). Null means no signal — render that as "Direct", not as a channel.';
comment on column public.leads.landing_path is
  'The page the visitor first arrived on, path only. Query and hash are deliberately dropped: they carry no attribution value and can carry personal data.';

-- ─── RLS ─────────────────────────────────────────────────────────────────────
--  No policy changes. 0006's studio-admin policy already governs the row, and
--  these are additional columns on it.
