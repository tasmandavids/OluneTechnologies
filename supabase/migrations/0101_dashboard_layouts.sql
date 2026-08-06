-- ============================================================================
--  Per-studio "Today" dashboard layout — lets an owner drag/resize/snap the
--  widget grid and have it stick. One row per studio (shared layout, not
--  per-user), mirroring the website_configs single-row-per-studio pattern.
-- ============================================================================

create table if not exists public.dashboard_layouts (
  studio_id   uuid primary key references public.studios(id) on delete cascade,
  layout      jsonb not null default '[]'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.dashboard_layouts enable row level security;

drop policy if exists "dashboard_layouts_ops_all" on public.dashboard_layouts;
create policy "dashboard_layouts_ops_all" on public.dashboard_layouts
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() in ('admin', 'office')
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() in ('admin', 'office')
  );

grant select, insert, update, delete on public.dashboard_layouts to authenticated;

-- Note: no DB trigger for updated_at — matches website_configs/site_pages
-- convention where the app sets updated_at = now() explicitly on writes.
