-- ============================================================================
--  0106_billing_catalog_backfill.sql
--
--  Populates the 0105 catalogue from the pricing that already exists, so the
--  cutover is lossless: every class, pass and private lesson keeps charging
--  exactly what it charged before, just read from a product instead of from a
--  column or a TS constant.
--
--  Deliberately NOT seeded here: the ten-item "starter catalogue". That list
--  lives in lib/billing/starter-catalog.ts and is applied by an explicit
--  one-click action in Money → Products. Duplicating it as SQL would give it
--  two sources of truth that drift apart on the first edit, and it would push
--  ten products a studio never asked for into every tenant.
--
--  Every step is guarded so re-running is a no-op.
-- ============================================================================

-- ─── 1. Class fees → products ────────────────────────────────────────────────
--  One product per distinct (price, account code, item code) combination within
--  a studio, so two classes that already bill identically share one catalogue
--  entry rather than cluttering it with a near-duplicate per class row.
--
--  pricing_model follows how the studio actually invoices (studios.
--  billing_period), because classes.price_cents is the amount charged for one
--  billing period — a term for termly studios, a month for monthly ones.

with fee_groups as (
  select
    c.studio_id,
    c.price_cents,
    c.xero_account_code,
    c.xero_item_code,
    coalesce(s.billing_period, 'monthly')                       as billing_period,
    -- Suffix only when the same price appears under different ledger codes, so
    -- the common case stays a clean "CLASS-4500".
    row_number() over (
      partition by c.studio_id, c.price_cents
      order by c.xero_account_code nulls first, c.xero_item_code nulls first
    )                                                            as seq,
    row_number() over (
      partition by c.studio_id
      order by c.price_cents, c.xero_account_code nulls first, c.xero_item_code nulls first
    )                                                            as ordinal
  from public.classes c
  join public.studios s on s.id = c.studio_id
  where c.price_cents > 0
    and c.product_id is null
  group by c.studio_id, c.price_cents, c.xero_account_code, c.xero_item_code, s.billing_period
)
insert into public.billing_products (
  studio_id, name, code, description, category, pricing_model,
  unit_amount_cents, unit_label, recurring_interval, term_id,
  account_code, item_code, sort_order
)
select
  g.studio_id,
  case when g.billing_period = 'termly'
       then 'Term tuition — $' || to_char(g.price_cents / 100.0, 'FM999999990.00')
       else 'Monthly tuition — $' || to_char(g.price_cents / 100.0, 'FM999999990.00')
  end,
  'CLASS-' || g.price_cents || case when g.seq > 1 then '-' || g.seq else '' end,
  'Created automatically from existing class pricing.',
  'tuition',
  case when g.billing_period = 'termly' then 'term' else 'recurring' end,
  g.price_cents,
  case when g.billing_period = 'termly' then 'term' else 'month' end,
  case when g.billing_period = 'termly' then null else 'month' end,
  null,
  g.xero_account_code,
  g.xero_item_code,
  g.ordinal
from fee_groups g
on conflict do nothing;

-- Link each class to the product that matches its price and codes.
update public.classes c
   set product_id = p.id
  from public.billing_products p
 where c.product_id is null
   and c.price_cents > 0
   and p.studio_id = c.studio_id
   and p.unit_amount_cents = c.price_cents
   and p.category = 'tuition'
   and p.code like 'CLASS-%'
   and p.account_code is not distinct from c.xero_account_code
   and p.item_code is not distinct from c.xero_item_code;

-- ─── 2. Class passes → PASS-DROPIN ───────────────────────────────────────────
--  Mirrors lib/passes/constants.ts today: 2500c, one credit, revenue account
--  200-01. Created for every studio because 0107 makes product_id mandatory on
--  new pass rows, so the purchase route needs one to exist everywhere.

insert into public.billing_products (
  studio_id, name, code, description, category, pricing_model,
  unit_amount_cents, unit_label, credit_count, account_code, sort_order
)
select s.id, 'Casual class pass', 'PASS-DROPIN',
       'Single-use drop-in pass bought from the student portal.',
       'pass', 'pass', 2500, 'pass', 1, '200-01', 10
  from public.studios s
 where not exists (
   select 1 from public.billing_products p
    where p.studio_id = s.id and upper(p.code) = 'PASS-DROPIN'
 );

update public.class_passes cp
   set product_id = p.id
  from public.billing_products p
 where cp.product_id is null
   and p.studio_id = cp.studio_id
   and upper(p.code) = 'PASS-DROPIN';

-- ─── 3. Private lessons → PRIVATE-HR ─────────────────────────────────────────
--  Hourly, priced from what the studio has actually been charging. Existing
--  bookings store a whole-booking amount, so divide by the booked duration to
--  recover an hourly rate, then take the median across the studio's history.
--  Studios with no billed history get 6000c/hour as a visible starting point.

with rates as (
  select b.studio_id,
         percentile_cont(0.5) within group (
           order by b.amount_cents
                    / greatest(extract(epoch from (b.end_time - b.start_time)) / 3600.0, 0.25)
         ) as hourly_cents
    from public.private_lesson_bookings b
   where b.amount_cents is not null
     and b.amount_cents > 0
   group by b.studio_id
)
insert into public.billing_products (
  studio_id, name, code, description, category, pricing_model,
  unit_amount_cents, unit_label, min_units, increment_units, sort_order
)
select s.id, 'Private lesson', 'PRIVATE-HR',
       'Billed per hour, rounded up to the nearest 15 minutes.',
       'tuition', 'hourly',
       round(coalesce(r.hourly_cents, 6000))::int,
       'hour', 1.00, 0.25, 20
  from public.studios s
  left join rates r on r.studio_id = s.id
 where not exists (
   select 1 from public.billing_products p
    where p.studio_id = s.id and upper(p.code) = 'PRIVATE-HR'
 );

update public.private_lesson_bookings b
   set product_id = p.id
  from public.billing_products p
 where b.product_id is null
   and p.studio_id = b.studio_id
   and upper(p.code) = 'PRIVATE-HR';

-- ─── 4. Retail products borrow the catalogue only for coding ─────────────────
--  Left unlinked on purpose. public.products keeps its own price, stock and
--  checkout; a shop item only needs a billing_product_id once a studio wants
--  its merch revenue coded differently, which is a per-studio choice made in
--  the UI, not something to guess at here.

-- ─── 5. Existing invoices get their subtotal ─────────────────────────────────
--  Every invoice written before this point was GST-inclusive at 15%, with
--  gst_cents already holding the embedded component — so the subtotal is just
--  the difference. tax_inclusive defaults to true (0105), which is correct for
--  all of them.

update public.invoices
   set subtotal_cents = amount_cents - coalesce(gst_cents, 0)
 where subtotal_cents = 0
   and amount_cents <> 0;
