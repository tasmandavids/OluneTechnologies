-- ============================================================================
-- 0092 — Site Builder v2 document tenant guard
--
-- Ensure a builder document can only ever point at a site_pages row owned by
-- the same studio. Without this, an admin could create a document row for a
-- different studio's published page_id and have the public renderer load it.
-- ============================================================================

delete from public.site_builder_documents sbd
where not exists (
  select 1
  from public.site_pages p
  where p.id = sbd.page_id
    and p.studio_id = sbd.studio_id
);

create unique index if not exists site_pages_id_studio_uidx
  on public.site_pages(id, studio_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.site_builder_documents'::regclass
      and conname = 'site_builder_documents_page_studio_fk'
  ) then
    alter table public.site_builder_documents
      add constraint site_builder_documents_page_studio_fk
      foreign key (page_id, studio_id)
      references public.site_pages(id, studio_id)
      on delete cascade;
  end if;
end $$;

drop policy if exists "sbd_admin_all" on public.site_builder_documents;
create policy "sbd_admin_all" on public.site_builder_documents
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
    and exists (
      select 1
      from public.site_pages p
      where p.id = site_builder_documents.page_id
        and p.studio_id = site_builder_documents.studio_id
    )
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
    and exists (
      select 1
      from public.site_pages p
      where p.id = site_builder_documents.page_id
        and p.studio_id = site_builder_documents.studio_id
    )
  );

drop policy if exists "sbd_public_read" on public.site_builder_documents;
create policy "sbd_public_read" on public.site_builder_documents
  for select using (
    exists (
      select 1
      from public.site_pages p
      where p.id = site_builder_documents.page_id
        and p.studio_id = site_builder_documents.studio_id
        and p.status = 'published'
    )
  );
