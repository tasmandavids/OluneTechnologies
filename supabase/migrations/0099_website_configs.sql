-- ============================================================================
--  0099 — Website Configs (fixed-template site builder v3)
--
--  Replaces BOTH the v1 legacy block editor (site_pages.blocks) and the v2
--  "Studio" canvas builder (site_builder_documents) with a much simpler model:
--  one studio picks one fixed template ("kind") and customizes it — colors,
--  fonts, section visibility/order, density, logo. No freeform per-node
--  editing, no multi-page concept — one row per studio.
--
--  RLS mirrors the existing site_pages / site_builder_documents pattern:
--    • admin of the studio → full access
--    • anyone → read a published config (public site rendering)
-- ============================================================================

create type public.website_template_kind as enum (
  'split', 'poster', 'editorial', 'stack', 'sidebar', 'band', 'bold', 'frame'
);

create table if not exists public.website_configs (
  studio_id             uuid primary key references public.studios(id) on delete cascade,
  template_id           text not null,
  kind                  public.website_template_kind not null,
  accent_color          text not null,
  paper_color           text not null,
  ink_color             text not null,
  font_display          text not null,
  font_body             text not null,
  density               int not null default 56,
  studio_name_override  text,
  headline              text not null,
  tagline               text not null,
  eyebrow               text not null,
  logo_url              text,
  sections              jsonb not null default '[]'::jsonb,
  status                text not null default 'draft' check (status in ('draft', 'published')),
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.website_configs enable row level security;

drop policy if exists "website_configs_admin_all" on public.website_configs;
create policy "website_configs_admin_all" on public.website_configs
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

drop policy if exists "website_configs_public_read" on public.website_configs;
create policy "website_configs_public_read" on public.website_configs
  for select using (status = 'published');

grant select on public.website_configs to anon, authenticated;
grant insert, update, delete on public.website_configs to authenticated;

-- Note: no DB trigger for updated_at — matches site_pages/studio_branding
-- convention where the app sets updated_at = now() explicitly on writes.
