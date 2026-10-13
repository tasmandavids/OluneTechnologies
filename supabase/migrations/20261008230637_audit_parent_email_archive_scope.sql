-- Audit E-01: the parent email archive copied whole threads to every parent on them.
-- Remove archived messages the parent neither sent nor received, then drop threads
-- left empty. New syncs archive per message (lib/email/parent-archive.ts).

delete from public.parent_email_messages pem
using public.profiles p
where p.id = pem.parent_id
  and pem.source_email_message_id is not null
  and not exists (
    select 1
    from public.email_messages em
    where em.id = pem.source_email_message_id
      and lower(coalesce(p.email, '')) <> ''
      and (
        lower(coalesce(em.from_address, '')) = lower(p.email)
        or exists (select 1 from unnest(em.to_addresses) a where lower(a) = lower(p.email))
        or exists (select 1 from unnest(em.cc_addresses) a where lower(a) = lower(p.email))
      )
  );

delete from public.parent_email_threads t
where not exists (
  select 1 from public.parent_email_messages m where m.parent_email_thread_id = t.id
);
