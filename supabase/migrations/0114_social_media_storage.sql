-- ============================================================================
--  0114_social_media_storage.sql
--
--  Storage for social-post creative:  social-media/<studio_id>/<slot>-<rand>.<ext>
--
--  Until now the composer asked the studio owner to type an image URL and a
--  video URL. Nobody has a hosted video URL to hand, so TikTok — which
--  hard-requires one (lib/advertising/publish.ts) — could not be used by any
--  studio at all, despite being listed as a live integration.
--
--  WHY PUBLIC. Every publisher fetches the media itself rather than accepting
--  bytes from us: Facebook `/photos?url=`, Instagram `/media?image_url=`,
--  TikTok `source_info.source = PULL_FROM_URL`. A private object or a signed
--  URL is unreadable to those fetchers, so the bucket has to be public for
--  publishing to work at all. Objects are namespaced per studio and writes are
--  admin-only, so "public" means readable-if-you-know-the-random-path — the
--  same posture as site-images (0022), and the same posture as the finished
--  post, which is by definition public the moment it goes out.
--
--  WHY NOT REUSE site-images. Different size ceiling (video is ~12× the image
--  cap) and different lifecycle — saveWebsiteConfig diffs the website config
--  and deletes objects it no longer references, and creative has no business
--  being anywhere near that sweep.
-- ============================================================================

-- 100 MB ceiling matches MAX_AD_VIDEO_BYTES in lib/advertising/media.ts. Set on
-- the bucket too so an oversized upload is refused by Storage even if a client
-- skips the app-side check.
insert into storage.buckets (id, name, public, file_size_limit)
values ('social-media', 'social-media', true, 104857600)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit;

-- ─── RLS on storage.objects (scoped to this bucket) ──────────────────────────
--  First path segment is the studio id: <studio_id>/<file>.
--  Uploads in the app go through a service-role signed URL, so these are
--  defence-in-depth and enable a direct authenticated-client fallback.

drop policy if exists "social_media_public_read" on storage.objects;
create policy "social_media_public_read" on storage.objects
  for select
  using (bucket_id = 'social-media');

drop policy if exists "social_media_admin_insert" on storage.objects;
create policy "social_media_admin_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'social-media'
    and private.current_user_role() = 'admin'
    and (storage.foldername(name))[1] = private.current_studio()::text
  );

drop policy if exists "social_media_admin_update" on storage.objects;
create policy "social_media_admin_update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'social-media'
    and private.current_user_role() = 'admin'
    and (storage.foldername(name))[1] = private.current_studio()::text
  )
  with check (
    bucket_id = 'social-media'
    and private.current_user_role() = 'admin'
    and (storage.foldername(name))[1] = private.current_studio()::text
  );

drop policy if exists "social_media_admin_delete" on storage.objects;
create policy "social_media_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'social-media'
    and private.current_user_role() = 'admin'
    and (storage.foldername(name))[1] = private.current_studio()::text
  );
