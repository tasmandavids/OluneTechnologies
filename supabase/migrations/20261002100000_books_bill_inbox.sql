-- ============================================================================
--  Olune Books — the bill inbox.
--
--  Until now a bill only existed if an admin typed it in line by line. This
--  adds the paper trail a real payables process needs:
--
--    • ledger_attachments   the supplier's actual invoice (PDF or photo),
--                           stored in the private `books-attachments` bucket
--    • ledger_bills.source  how the bill arrived: typed (manual), dropped into
--                           the inbox (upload), or sent in by a staff member
--                           who wants to be paid (staff)
--    • contact_id nullable  an uploaded invoice nobody has read yet has no
--                           supplier; it's allowed only while the bill is a
--                           draft, so nothing is ever approved without one
--    • extracted            what the studio's AI key read off the document,
--                           kept so the reviewer can see where a prefilled
--                           value came from
--
--  Staff who invoice the studio already do it from Teacher → Invoices
--  (contractor_invoices, 0069). Sending one to a studio that keeps Olune Books
--  now files it in the inbox as a draft bill linked back to the contractor
--  invoice, and paying the bill marks the contractor's invoice paid. A
--  contractor who invoices from their own software can attach that PDF.
--
--  Those staff bills are written with the service role by
--  lib/ledger/server/inbox.ts after it has checked the invoice is addressed to
--  that studio; staff get no grant on any ledger table, so the admin-only RLS
--  below stays the whole story for authenticated clients.
-- ============================================================================

-- ─── Bills: where they came from ─────────────────────────────────────────────

alter table public.ledger_bills alter column contact_id drop not null;

alter table public.ledger_bills drop constraint if exists ledger_bills_contact_when_approved;
alter table public.ledger_bills
  add constraint ledger_bills_contact_when_approved
  check (status = 'draft' or contact_id is not null);

alter table public.ledger_bills
  add column if not exists source       text not null default 'manual',
  add column if not exists submitted_by uuid references public.profiles(id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists extracted    jsonb,
  add column if not exists contractor_invoice_id uuid references public.contractor_invoices(id) on delete set null;

create unique index if not exists ledger_bills_contractor_invoice_idx
  on public.ledger_bills(contractor_invoice_id) where contractor_invoice_id is not null;

alter table public.ledger_bills drop constraint if exists ledger_bills_source_check;
alter table public.ledger_bills
  add constraint ledger_bills_source_check check (source in ('manual', 'upload', 'staff'));

create index if not exists ledger_bills_submitted_by_idx on public.ledger_bills(submitted_by) where submitted_by is not null;

comment on column public.ledger_bills.source is
  'How the bill arrived: manual (typed in Books), upload (dropped into the bill inbox), staff (submitted by a staff member for payment).';

-- ─── Contractor invoices: the contractor's own PDF ──────────────────────────
--  Stored in the studio's books-attachments folder (it's addressed to them),
--  so it's only offered when the invoice goes to a studio.

alter table public.contractor_invoices
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint;

alter table public.contractor_invoices drop constraint if exists contractor_invoices_attachment_studio;
alter table public.contractor_invoices
  add constraint contractor_invoices_attachment_studio
  check (attachment_path is null or (studio_id is not null and attachment_path like studio_id::text || '/%'));

-- ─── Attachments ─────────────────────────────────────────────────────────────

create table if not exists public.ledger_attachments (
  id            uuid primary key default gen_random_uuid(),
  studio_id     uuid not null references public.studios(id) on delete cascade,
  bill_id       uuid references public.ledger_bills(id) on delete cascade,
  journal_id    uuid references public.ledger_journals(id) on delete set null,
  storage_path  text not null unique check (storage_path like studio_id::text || '/%'),
  file_name     text not null check (length(file_name) between 1 and 200),
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 20971520),
  uploaded_by   uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists ledger_attachments_bill_idx on public.ledger_attachments(bill_id) where bill_id is not null;
create index if not exists ledger_attachments_journal_idx on public.ledger_attachments(journal_id) where journal_id is not null;
create index if not exists ledger_attachments_studio_idx on public.ledger_attachments(studio_id, created_at desc);
create index if not exists ledger_attachments_uploaded_by_idx on public.ledger_attachments(uploaded_by);

-- An attachment's bill must be the same studio's.
create or replace function private.ledger_attachments_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.bill_id is not null and not exists (
    select 1 from public.ledger_bills b where b.id = new.bill_id and b.studio_id = new.studio_id
  ) then
    raise exception 'Attachment and bill belong to different studios';
  end if;
  if new.journal_id is not null and not exists (
    select 1 from public.ledger_journals j where j.id = new.journal_id and j.studio_id = new.studio_id
  ) then
    raise exception 'Attachment and journal belong to different studios';
  end if;
  return new;
end $$;

revoke all on function private.ledger_attachments_guard() from public, anon, authenticated;

drop trigger if exists ledger_attachments_guard on public.ledger_attachments;
create trigger ledger_attachments_guard
  before insert or update on public.ledger_attachments
  for each row execute function private.ledger_attachments_guard();

alter table public.ledger_attachments enable row level security;
drop policy if exists ledger_attachments_admin on public.ledger_attachments;
create policy ledger_attachments_admin on public.ledger_attachments for all to authenticated
  using (studio_id = (select private.current_studio()) and (select private.current_user_role()) = 'admin')
  with check (studio_id = (select private.current_studio()) and (select private.current_user_role()) = 'admin');

revoke all on table public.ledger_attachments from anon, authenticated;
grant select, insert, update, delete on public.ledger_attachments to authenticated;

-- ─── Storage: private, per-studio folders ────────────────────────────────────
--  Path: <studio_id>/<random>.<ext>. Private because these are supplier
--  invoices and staff bank details. The app uploads through service-role
--  signed upload URLs and serves through short-lived signed download URLs, so
--  the policies below are defence in depth for a direct authenticated client.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'books-attachments', 'books-attachments', false, 20971520,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "books_attachments_admin_read" on storage.objects;
create policy "books_attachments_admin_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'books-attachments'
    and (select private.current_user_role()) = 'admin'
    and (storage.foldername(name))[1] = (select private.current_studio())::text
  );

drop policy if exists "books_attachments_admin_write" on storage.objects;
create policy "books_attachments_admin_write" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'books-attachments'
    and (select private.current_user_role()) = 'admin'
    and (storage.foldername(name))[1] = (select private.current_studio())::text
  );

drop policy if exists "books_attachments_admin_delete" on storage.objects;
create policy "books_attachments_admin_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'books-attachments'
    and (select private.current_user_role()) = 'admin'
    and (storage.foldername(name))[1] = (select private.current_studio())::text
  );
