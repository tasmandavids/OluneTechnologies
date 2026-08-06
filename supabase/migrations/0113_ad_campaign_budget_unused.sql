-- ============================================================================
--  0113_ad_campaign_budget_unused.sql
--
--  Document ad_campaigns.budget_cents as unread, rather than dropping it.
--
--  The column was written and displayed but never spent: lib/advertising/
--  publish.ts posts ORGANICALLY — Facebook Page feed, Instagram media publish,
--  Telegram broadcast, TikTok video init. There is no Marketing API call, no
--  ad set and no spend anywhere in the codebase, so a studio owner reading
--  "Budget: $200" on their campaign was being told we were spending their
--  money. The app no longer reads or writes it (7 Aug 2026).
--
--  Kept rather than dropped for two reasons: existing rows carry values a
--  studio may have entered and would be surprised to lose, and the column is
--  exactly what a future paid-ads integration needs. A comment costs nothing
--  and stops the next person re-deriving all of the above from scratch.
-- ============================================================================

comment on column public.ad_campaigns.budget_cents is
  'UNUSED as of 0113. Publishing is organic only — nothing in the product spends on ads. Retained for a future paid-ads integration; no application code reads or writes this.';
