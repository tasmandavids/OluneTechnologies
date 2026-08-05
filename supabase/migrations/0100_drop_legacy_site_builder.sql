-- ============================================================================
--  0100 — Drop legacy site builder (v1 blocks + v2 Studio + SEO audits)
--
--  Superseded by 0099_website_configs.sql. Confirmed with the product owner:
--  no production studio content depends on any of this — clean-slate removal,
--  no data migration. DO NOT apply this until the new `website_configs`
--  system (public rendering + admin routes) has been cut over and verified —
--  see /Users/tasmandavids/.claude/plans/eager-wiggling-pie.md Phase 6.
--
--  Drop order respects FKs: seo_audits.page_id and
--  site_builder_documents.page_id both reference site_pages.id, so both must
--  go before site_pages itself.
--
--  The `site-images` storage bucket (created in 0022) is NOT dropped — it is
--  reused by the new website builder's logo upload flow.
-- ============================================================================

drop table if exists public.seo_audits;
drop table if exists public.site_builder_documents;
drop table if exists public.site_pages;
