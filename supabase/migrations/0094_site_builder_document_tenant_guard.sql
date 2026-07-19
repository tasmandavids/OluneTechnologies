-- ============================================================================
-- 0094 — Site Builder v2 document tenant guard
--
-- 0057's RLS on site_builder_documents checks the row's own studio_id column
-- against the caller, and separately checks that page_id points at *some*
-- published site_pages row — but never checks that page's studio_id matches
-- the document's studio_id. An admin could therefore upsert a document row
-- with page_id set to a *different* studio's published page id (their own
-- studio_id passes the write check), and the public read policy would then
-- serve that document under the other studio's page, since it only verifies
-- page_id + status, not tenant ownership. This closes that gap with a
-- DB-enforced composite FK plus tightened RLS on both read and write.
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
