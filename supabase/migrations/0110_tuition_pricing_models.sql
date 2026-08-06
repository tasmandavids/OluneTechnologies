-- ============================================================================
--  0110_tuition_pricing_models.sql
--
--  0105 gave every class a catalogue price. It did not give a studio a way to
--  say "two of these together cost one price". A studio pricing Intermediate at
--  $299 that runs it on two nights has two class rows, and a family clicking
--  both is charged $598 — the enrolment path bills each class at its own price
--  and only zeroes duplicates when they share a recurring_group_id, which two
--  separately-created classes never do.
--
--  0105's answer was billing_price_tiers, a percentage ladder. Two problems:
--  studios don't think in percentages, and it was never wired into enrolment
--  anyway. So this migration adds the two models studios actually describe when
--  asked how they charge, and one setting that picks between them:
--
--    per_class        each class has its own price (today's behaviour)
--    hours            total weekly hours sets the tuition, from a table the
--                     studio types: 2.0 hrs = $170, 3.0 hrs = $230. The
--                     Studio Pro / Jackrabbit convention.
--    per_class_combos per-class prices, plus named combinations that fire
--                     automatically and replace the lines they cover.
--
--  One model per studio, not three at once. A studio that charges by the hour
--  never has to see a combo, and the Products screen hides what the chosen
--  model doesn't use — the whole point being that the person setting this up
--  runs a dance school, not a billing system.
--
--  Why combos reuse pricing_model = 'package' instead of new bundle tables:
--  billing_product_components already models "these products, this price", and
--  expandPackage() already renders it as a combo line plus zero-priced detail
--  lines, which is exactly the invoice a family should receive. The only thing
--  missing was a trigger, so that's the only thing added — auto_apply. Note
--  that combos match on PRODUCTS, not class names, the same discipline
--  lib/enrollment-billing.ts applies to recurring groups: an admin naming two
--  classes "Intermediate" is not a statement about price.
--
--  Nothing here changes what any existing studio is charged.
--  studios.tuition_pricing_model defaults to 'per_class', so every tenant keeps
--  today's behaviour with no backfill.
-- ============================================================================

-- ─── Which model a studio charges tuition on ────────────────────────────────
--  studios is already member-readable (it's how lib/discounts.ts reads
--  sibling_discount_pct under a parent session), so the enrolment quote can
--  read this with no new policy.

alter table public.studios
  add column if not exists tuition_pricing_model text not null default 'per_class';

alter table public.studios
  drop constraint if exists studios_tuition_pricing_model_check;
alter table public.studios
  add constraint studios_tuition_pricing_model_check
    check (tuition_pricing_model in ('per_class', 'hours', 'per_class_combos'));

-- ─── An eighth pricing model, and the combo trigger ─────────────────────────

alter table public.billing_products
  drop constraint if exists billing_products_pricing_model_check;
alter table public.billing_products
  add constraint billing_products_pricing_model_check
    check (pricing_model in ('one_off', 'hourly', 'per_session', 'pass',
                             'recurring', 'term', 'package', 'hours_ladder'));

--  The rate card's tail: what each hour past the last band costs. NULL means
--  the last band is a cap — "5 hours or more is $290, however many they do".
alter table public.billing_products
  add column if not exists overflow_rate_cents int;

alter table public.billing_products
  drop constraint if exists billing_products_overflow_rate_check;
alter table public.billing_products
  add constraint billing_products_overflow_rate_check
    check (overflow_rate_cents is null or overflow_rate_cents >= 0);

--  Fire this package automatically when a family's basket satisfies it,
--  rather than waiting to be picked by name.
alter table public.billing_products
  add column if not exists auto_apply boolean not null default false;

--  Only a package has components to match a basket against.
alter table public.billing_products
  drop constraint if exists billing_products_auto_apply_package_only;
alter table public.billing_products
  add constraint billing_products_auto_apply_package_only
    check (auto_apply = false or pricing_model = 'package');

--  One active ladder per studio, so "what does this dancer pay" has exactly one
--  answer and a double-clicked setup button can't create a second.
create unique index if not exists billing_products_one_hours_ladder
  on public.billing_products(studio_id)
  where pricing_model = 'hours_ladder' and active;

-- ─── The rate card ──────────────────────────────────────────────────────────
--  Total dollars for a band of weekly hours, typed by the studio. No
--  percentages and no per-hour arithmetic: "1.5 hours a week is $135" is the
--  whole statement. The highest matching min_hours wins — deliberately the same
--  rule billing_price_tiers already uses, so there is one lookup idiom in this
--  schema rather than two.
--
--  The unique index on (product_id, min_hours) means ties are impossible by
--  construction, which is why the resolver needs no tie-break.

create table if not exists public.billing_hour_bands (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.billing_products(id) on delete cascade,
  min_hours   numeric(5,2) not null check (min_hours > 0 and min_hours <= 100),
  total_cents int not null check (total_cents >= 0),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now(),
  unique (product_id, min_hours)
);

create index if not exists billing_hour_bands_product_idx
  on public.billing_hour_bands(product_id, min_hours);

-- ─── RLS ────────────────────────────────────────────────────────────────────
--  Mirrors billing_price_tiers above: admins write, members read the bands of
--  an active product because the parent's enrolment quote prices against them.

alter table public.billing_hour_bands enable row level security;

drop policy if exists "billing_hour_bands_admin" on public.billing_hour_bands;
create policy "billing_hour_bands_admin" on public.billing_hour_bands
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

drop policy if exists "billing_hour_bands_member_read" on public.billing_hour_bands;
create policy "billing_hour_bands_member_read" on public.billing_hour_bands
  for select using (
    exists (
      select 1 from public.billing_products p
       where p.id = product_id
         and p.studio_id = private.current_studio()
         and p.active
    )
  );

grant select, insert, update, delete on public.billing_hour_bands to authenticated;
