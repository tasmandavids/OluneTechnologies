-- ============================================================================
--  Audit R-10, R-11: what an anonymous caller can reach directly.
--
--  R-10  Anyone holding the public anon key could insert leads straight into
--        PostgREST, skipping the rate limiter on the /enrol server action. The
--        action now inserts with the service role after its own checks, so the
--        anonymous insert path is removed.
--
--  R-11  anon could select every column of a public instructor's profile,
--        including email, phone, birthday and Stripe customer id. anon keeps
--        only the columns the public instructor pages render.
-- ============================================================================

drop policy if exists "leads_public_trial_insert" on public.leads;
revoke insert on public.leads from anon;

revoke select on public.profiles from anon;
grant select (
  id,
  account_kind,
  active_studio_id,
  profile_public,
  full_name,
  headline,
  bio,
  disciplines,
  syllabus_certs,
  training_institutions,
  age_groups,
  engagement_types,
  availability_type,
  location_city,
  website_url,
  avatar_url,
  teaching_video_url,
  rate_min_nzd,
  rate_max_nzd,
  network_verified
) on public.profiles to anon;
