-- ============================================================================
--  0104 — Website builder: hero imagery
--
--  The fixed-template builder (0099) shipped with colour/font/section-order
--  customization only: every image slot in every template kind rendered as a
--  derived-from-accent gradient placeholder, and `logo_url` was uploadable but
--  never rendered. This adds the one column the renderer needs for hero art.
--
--  Per-section images live inside the existing `sections` jsonb
--  (`sections[i].images: string[]`) — no DDL needed for those.
--
--  All values are public URLs into the existing `site-images` bucket (0022),
--  namespaced `site-images/<studio_id>/…`.
-- ============================================================================

alter table public.website_configs
  add column if not exists hero_images jsonb not null default '[]'::jsonb;
