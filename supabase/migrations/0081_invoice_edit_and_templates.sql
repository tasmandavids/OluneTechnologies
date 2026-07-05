-- ============================================================================
--  0081_invoice_edit_and_templates
--  Admins currently can only create/void/refund invoices from the Billing
--  page — there's no way to view full invoice detail or edit a draft before
--  sending it. Adds a persisted description column (previously only used
--  transiently for the Stripe/Xero label) plus a reusable invoice-template
--  system so recurring charges (costume fee, term tuition, etc.) don't need
--  to be retyped every time.
-- ============================================================================

alter table public.invoices
  add column if not exists description text;

create table if not exists public.invoice_templates (
  id                uuid primary key default gen_random_uuid(),
  studio_id         uuid not null references public.studios(id) on delete cascade,
  name              text not null,
  description       text,
  default_due_days  int not null default 14 check (default_due_days >= 0),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists invoice_templates_studio_idx on public.invoice_templates (studio_id, name);

create table if not exists public.invoice_template_line_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.invoice_templates(id) on delete cascade,
  description   text not null,
  quantity      int not null default 1 check (quantity > 0),
  unit_cents    int not null check (unit_cents >= 0),
  sort_order    int not null default 0
);

create index if not exists invoice_template_line_items_template_idx
  on public.invoice_template_line_items (template_id, sort_order);

alter table public.invoice_templates enable row level security;
alter table public.invoice_template_line_items enable row level security;

grant select, insert, update, delete on public.invoice_templates to authenticated;
grant select, insert, update, delete on public.invoice_template_line_items to authenticated;

-- Editing a draft invoice's amount now rewrites its line items (delete + reinsert).
grant update, delete on public.invoice_line_items to authenticated;

drop policy if exists "invoice_templates_admin_all" on public.invoice_templates;
create policy "invoice_templates_admin_all" on public.invoice_templates
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

drop policy if exists "invoice_template_line_items_admin_all" on public.invoice_template_line_items;
create policy "invoice_template_line_items_admin_all" on public.invoice_template_line_items
  for all using (
    exists (
      select 1 from public.invoice_templates it
      where it.id = template_id
        and it.studio_id = private.current_studio()
        and private.current_user_role() = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.invoice_templates it
      where it.id = template_id
        and it.studio_id = private.current_studio()
        and private.current_user_role() = 'admin'
    )
  );

-- Note: public.invoice_line_items already has a `for all` "invoice_line_items_admin"
-- policy (0038, rewritten onto private.current_studio()/current_user_role() by the
-- 0048 migration) scoped to studio admins — it covers update/delete once granted
-- above, so no new policy is needed here.

drop trigger if exists invoice_templates_touch_updated_at on public.invoice_templates;
create trigger invoice_templates_touch_updated_at
  before update on public.invoice_templates
  for each row execute function private.touch_updated_at();
