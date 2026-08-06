-- ============================================================================
--  0105_billing_catalog.sql
--
--  One catalogue for everything a studio sells. Until now pricing was scattered
--  and mostly hardcoded: classes.price_cents typed per class row, class passes
--  pinned to a 2500c TS constant, private lessons keyed in per booking, and
--  manual invoice lines free-typed with no code at all. Only class-derived
--  lines ever reached Xero with a real account/item code (0082, 0083); nothing
--  else could be classified, and GST-exclusive or non-GST-registered studios
--  were unrepresentable because taxType/lineAmountTypes were hardcoded.
--
--  billing_products is now the single source of truth for "what does this cost
--  and where does the revenue land". Seven pricing models cover the ways a
--  studio actually charges — one-off fee, per hour, per session, multi-use
--  pass, recurring, per term, and package — plus volume tiers for families
--  doing a lot of classes.
--
--  Ledger codes are provider-neutral. account_code/item_code on the product are
--  the shared default for whichever ledger is connected;
--  billing_product_ledger_codes only carries a row when a studio's QuickBooks
--  or MYOB codes differ from that default.
--
--  Why tax-inclusive is a STUDIO setting and not a per-product one: Xero's
--  lineAmountTypes is a property of the invoice, not the line, so a mixed
--  inclusive/exclusive invoice cannot be expressed at all. studios.
--  prices_include_tax therefore decides how every unit_amount_cents is read and
--  what lineAmountTypes gets sent; billing_products.tax_treatment only picks
--  the per-line tax type (standard / zero-rated / exempt). Both are frozen onto
--  the invoice and its line items at creation, same rationale as 0082/0083 —
--  re-pricing a product later must never rewrite an already-sent invoice.
-- ============================================================================

-- ─── Catalogue ───────────────────────────────────────────────────────────────

create table if not exists public.billing_products (
  id                       uuid primary key default gen_random_uuid(),
  studio_id                uuid not null references public.studios(id) on delete cascade,
  name                     text not null,
  -- Studio SKU. Doubles as the default ledger item code when item_code is null.
  code                     text not null,
  description              text,
  category                 text not null default 'tuition'
                             check (category in ('tuition', 'fee', 'pass', 'hire', 'retail', 'other')),
  pricing_model            text not null
                             check (pricing_model in ('one_off', 'hourly', 'per_session',
                                                      'pass', 'recurring', 'term', 'package')),
  unit_amount_cents        int not null default 0 check (unit_amount_cents >= 0),
  -- Display + invoice-line unit ("hour", "session", "week", "term", "month").
  unit_label               text,

  -- hourly
  min_units                numeric(6,2) check (min_units is null or min_units > 0),
  increment_units          numeric(6,2) check (increment_units is null or increment_units > 0),

  -- pass
  credit_count             int check (credit_count is null or credit_count > 0),
  credit_expiry_days       int check (credit_expiry_days is null or credit_expiry_days > 0),

  -- recurring
  recurring_interval       text check (recurring_interval is null or
                             recurring_interval in ('week', 'fortnight', 'month', 'term', 'year')),
  recurring_interval_count int not null default 1 check (recurring_interval_count > 0),

  -- term (optional: a price scoped to one term)
  term_id                  uuid references public.studio_terms(id) on delete set null,

  -- tax
  tax_treatment            text not null default 'standard'
                             check (tax_treatment in ('standard', 'zero_rated', 'exempt')),
  -- Basis points, so 15% NZ GST is 1500 and a future rate change is a data edit.
  tax_rate_bp              int not null default 1500 check (tax_rate_bp >= 0 and tax_rate_bp <= 10000),

  -- ledger defaults (any provider)
  account_code             text,
  item_code                text,

  active                   boolean not null default true,
  sort_order               int not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Case-insensitive SKU uniqueness per studio. Expression index rather than a
-- table constraint because Postgres can't express upper(code) in `unique (...)`.
-- The backfill in 0106 relies on this to stay idempotent.
create unique index if not exists billing_products_studio_code_key
  on public.billing_products(studio_id, upper(code));

create index if not exists billing_products_studio_idx
  on public.billing_products(studio_id, active, category);

-- ─── Packages ────────────────────────────────────────────────────────────────
--  A package's own unit_amount_cents is what the family pays. Components
--  describe what that price entitles them to, and drive the detail lines shown
--  under the package on an invoice.

create table if not exists public.billing_product_components (
  id                   uuid primary key default gen_random_uuid(),
  package_product_id   uuid not null references public.billing_products(id) on delete cascade,
  -- restrict, not cascade: deleting a product that a package sells would
  -- silently change what that package includes.
  component_product_id uuid not null references public.billing_products(id) on delete restrict,
  quantity             numeric(6,2) not null default 1 check (quantity > 0),
  sort_order           int not null default 0,
  created_at           timestamptz not null default now(),
  unique (package_product_id, component_product_id),
  check (package_product_id <> component_product_id)
);

create index if not exists billing_product_components_package_idx
  on public.billing_product_components(package_product_id, sort_order);

-- ─── Volume tiers ────────────────────────────────────────────────────────────
--  "From the 3rd class, 20% off." Highest matching min_quantity wins.

create table if not exists public.billing_price_tiers (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.billing_products(id) on delete cascade,
  min_quantity      numeric(6,2) not null check (min_quantity > 0),
  unit_amount_cents int check (unit_amount_cents is null or unit_amount_cents >= 0),
  discount_bp       int check (discount_bp is null or (discount_bp > 0 and discount_bp <= 10000)),
  sort_order        int not null default 0,
  created_at        timestamptz not null default now(),
  unique (product_id, min_quantity),
  -- A tier states an absolute price or a discount, never both and never neither.
  check ((unit_amount_cents is null) <> (discount_bp is null))
);

create index if not exists billing_price_tiers_product_idx
  on public.billing_price_tiers(product_id, min_quantity);

-- ─── Per-provider ledger overrides ───────────────────────────────────────────
--  Only written when a studio's QuickBooks/MYOB codes differ from the product
--  default. An absent row means "use the product's own account_code/item_code".

create table if not exists public.billing_product_ledger_codes (
  id               uuid primary key default gen_random_uuid(),
  product_id       uuid not null references public.billing_products(id) on delete cascade,
  provider         text not null check (provider in ('xero', 'quickbooks', 'myob')),
  account_code     text,
  item_code        text,
  tax_code         text,
  tracking_option  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (product_id, provider)
);

create index if not exists billing_product_ledger_codes_product_idx
  on public.billing_product_ledger_codes(product_id);

-- ─── Freeze columns on invoices and their lines ──────────────────────────────

alter table public.invoice_line_items
  add column if not exists product_id    uuid references public.billing_products(id) on delete set null,
  add column if not exists tax_treatment text not null default 'standard',
  add column if not exists tax_rate_bp   int  not null default 1500,
  add column if not exists unit_label    text;

-- Hourly billing needs fractional quantities (1.5 hours). The existing int
-- values cast losslessly; Xero accepts decimal quantities on a LineItem.
do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'invoice_line_items'
       and column_name  = 'quantity'
       and data_type    = 'integer'
  ) then
    alter table public.invoice_line_items
      alter column quantity type numeric(10,3) using quantity::numeric;
  end if;
end $$;

create index if not exists invoice_line_items_product_idx
  on public.invoice_line_items(product_id);

alter table public.invoices
  add column if not exists subtotal_cents int not null default 0,
  -- Frozen per invoice: what lineAmountTypes this invoice was priced under.
  add column if not exists tax_inclusive  boolean not null default true;

-- ─── Studio-level tax posture ────────────────────────────────────────────────

alter table public.studios
  add column if not exists prices_include_tax boolean not null default true,
  add column if not exists gst_registered     boolean not null default true,
  add column if not exists gst_number         text;

-- ─── Links from the things that are sold ─────────────────────────────────────

alter table public.classes
  add column if not exists product_id uuid references public.billing_products(id) on delete set null;

-- restrict: a pass row's price is validated against its product by RLS (0107),
-- so the product must outlive the passes sold under it.
alter table public.class_passes
  add column if not exists product_id uuid references public.billing_products(id) on delete restrict;

alter table public.private_lesson_bookings
  add column if not exists product_id uuid references public.billing_products(id) on delete set null;

alter table public.subscription_line_items
  add column if not exists product_id uuid references public.billing_products(id) on delete set null;

alter table public.invoice_template_line_items
  add column if not exists product_id uuid references public.billing_products(id) on delete set null;

-- The retail shop keeps its own table (stock, barcode, image, its own
-- checkout). It only borrows the catalogue's ledger coding.
alter table public.products
  add column if not exists billing_product_id uuid references public.billing_products(id) on delete set null;

create index if not exists classes_product_idx on public.classes(product_id);
create index if not exists class_passes_product_idx on public.class_passes(product_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.billing_products enable row level security;
alter table public.billing_product_components enable row level security;
alter table public.billing_price_tiers enable row level security;
alter table public.billing_product_ledger_codes enable row level security;

drop policy if exists "billing_products_admin" on public.billing_products;
create policy "billing_products_admin" on public.billing_products
  for all using (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  )
  with check (
    studio_id = private.current_studio()
    and private.current_user_role() = 'admin'
  );

-- Parents and self-managed students see prices in the portal (enrolment
-- quotes, pass checkout), so the catalogue itself is member-readable — but
-- only the active rows, never archived pricing.
drop policy if exists "billing_products_member_read" on public.billing_products;
create policy "billing_products_member_read" on public.billing_products
  for select using (
    studio_id = private.current_studio()
    and active
  );

drop policy if exists "billing_product_components_admin" on public.billing_product_components;
create policy "billing_product_components_admin" on public.billing_product_components
  for all using (
    exists (
      select 1 from public.billing_products p
       where p.id = package_product_id
         and p.studio_id = private.current_studio()
         and private.current_user_role() = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.billing_products p
       where p.id = package_product_id
         and p.studio_id = private.current_studio()
         and private.current_user_role() = 'admin'
    )
  );

drop policy if exists "billing_product_components_member_read" on public.billing_product_components;
create policy "billing_product_components_member_read" on public.billing_product_components
  for select using (
    exists (
      select 1 from public.billing_products p
       where p.id = package_product_id
         and p.studio_id = private.current_studio()
         and p.active
    )
  );

drop policy if exists "billing_price_tiers_admin" on public.billing_price_tiers;
create policy "billing_price_tiers_admin" on public.billing_price_tiers
  for all using (
    exists (
      select 1 from public.billing_products p
       where p.id = product_id
         and p.studio_id = private.current_studio()
         and private.current_user_role() = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.billing_products p
       where p.id = product_id
         and p.studio_id = private.current_studio()
         and private.current_user_role() = 'admin'
    )
  );

drop policy if exists "billing_price_tiers_member_read" on public.billing_price_tiers;
create policy "billing_price_tiers_member_read" on public.billing_price_tiers
  for select using (
    exists (
      select 1 from public.billing_products p
       where p.id = product_id
         and p.studio_id = private.current_studio()
         and p.active
    )
  );

-- Ledger codes are bookkeeping, not pricing — admin only, no member read.
drop policy if exists "billing_product_ledger_codes_admin" on public.billing_product_ledger_codes;
create policy "billing_product_ledger_codes_admin" on public.billing_product_ledger_codes
  for all using (
    exists (
      select 1 from public.billing_products p
       where p.id = product_id
         and p.studio_id = private.current_studio()
         and private.current_user_role() = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.billing_products p
       where p.id = product_id
         and p.studio_id = private.current_studio()
         and private.current_user_role() = 'admin'
    )
  );

grant select, insert, update, delete on public.billing_products to authenticated;
grant select, insert, update, delete on public.billing_product_components to authenticated;
grant select, insert, update, delete on public.billing_price_tiers to authenticated;
grant select, insert, update, delete on public.billing_product_ledger_codes to authenticated;

-- ─── updated_at ──────────────────────────────────────────────────────────────

drop trigger if exists billing_products_touch_updated_at on public.billing_products;
create trigger billing_products_touch_updated_at
  before update on public.billing_products
  for each row execute function private.touch_updated_at();

drop trigger if exists billing_product_ledger_codes_touch_updated_at on public.billing_product_ledger_codes;
create trigger billing_product_ledger_codes_touch_updated_at
  before update on public.billing_product_ledger_codes
  for each row execute function private.touch_updated_at();
