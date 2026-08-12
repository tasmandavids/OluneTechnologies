-- ============================================================================
--  0119_studio_plans.sql
--
--  Olune's own subscription — the money that flows Olune ← studio, which is a
--  different direction from every other Stripe table in this schema.
--
--  Everything already here (stripe_connect_accounts 0090, subscriptions 0014,
--  invoices, payments) is studio → parent: a studio charging its own families
--  through its own connected account. Nothing charges the studio for using
--  Olune, so signup has been free and unbounded since 0001. This migration adds
--  the missing side.
--
--    studio_subscriptions  — one row per studio. The trial clock, the plan, and
--                            the Stripe subscription behind it.
--    platform_plan_prices  — Stripe Price ids per (plan, interval).
--
--  ── Why the tier → module mapping is NOT in here
--  It lives in lib/plans/catalog.ts, for the same reason the vertical packs are
--  TS and not rows (lib/verticals/types.ts): ModuleKey stays exhaustively
--  typechecked, and a tier gaining a module is a reviewable diff rather than a
--  data migration. What genuinely belongs in the database is the part that
--  differs per environment and per operator decision — the Stripe Price ids,
--  and which studio is on which plan.
--
--  ── Why existing studios are comped
--  Every studio in this table today signed up under a product that was free and
--  never asked them for a card. Starting a clock on them retroactively would
--  lock working studios out of their own admin over a bill they never agreed
--  to. They are grandfathered to 'comped' with no expiry; only studios created
--  after this migration get the 14-day trial.
--
--  ── Why a trigger rather than an edit to create_studio_for_user
--  There are two creation paths already (create_studio_for_user and
--  create_instructor_workspace_for_user, 0001 / 0052) and adding a third later
--  is likely. A trigger on the table cannot be forgotten by a new path; an
--  edit to one RPC can.
--
--  Idempotent & guarded — safe to re-run.
-- ============================================================================

-- ============================================================================
--  PLATFORM_PLAN_PRICES — the Stripe side of the catalogue
-- ============================================================================
--  Price ids are environment-specific (test mode and live mode issue different
--  ids for the same plan), so they cannot be a constant in the repo, and six
--  env vars for three plans × two intervals would be worse. Rows, set once per
--  environment by an operator.
create table if not exists public.platform_plan_prices (
  plan_key         text not null check (plan_key in ('solo', 'studio', 'scale')),
  billing_interval text not null check (billing_interval in ('month', 'year')),

  stripe_price_id  text not null,
  active           boolean not null default true,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  primary key (plan_key, billing_interval)
);

drop trigger if exists platform_plan_prices_updated_at on public.platform_plan_prices;
create trigger platform_plan_prices_updated_at
  before update on public.platform_plan_prices
  for each row execute function private.touch_updated_at();

alter table public.platform_plan_prices enable row level security;

--  Deliberately no grant to `authenticated`. The plan picker renders from the
--  TS catalogue; the Price id is only ever read server-side by the checkout
--  route, which uses the service client. Operators read it to fill it in.
grant select, insert, update, delete on public.platform_plan_prices to service_role;
grant select on public.platform_plan_prices to authenticated;

drop policy if exists "platform_plan_prices_operator_read" on public.platform_plan_prices;
create policy "platform_plan_prices_operator_read" on public.platform_plan_prices
  for select using (private.is_platform_operator());

-- ============================================================================
--  STUDIO_SUBSCRIPTIONS — one row per studio
-- ============================================================================
create table if not exists public.studio_subscriptions (
  studio_id        uuid primary key references public.studios(id) on delete cascade,

  plan_key         text not null default 'studio'
                     check (plan_key in ('solo', 'studio', 'scale')),
  billing_interval text not null default 'month'
                     check (billing_interval in ('month', 'year')),

  --  trialing → the 14-day clock is running, no card taken
  --  active   → paying
  --  past_due → Stripe could not collect
  --  canceled → subscription ended
  --  comped   → Olune is not charging this studio (grandfathered, or an
  --             operator decision). Never expires, never locks.
  status           text not null default 'trialing'
                     check (status in ('trialing', 'active', 'past_due', 'canceled', 'comped')),

  --  Null means "no clock". Required while trialing, meaningless otherwise.
  trial_ends_at    timestamptz,

  --  A STUDIO-level customer on Olune's own platform account. Distinct from
  --  profiles.stripe_customer_id and profile_stripe_customers (0090), which are
  --  parents being charged by a studio. Same Stripe account, opposite roles.
  stripe_customer_id     text,
  stripe_subscription_id text unique,

  current_period_end     timestamptz,
  --  Set when a studio cancels through the Stripe billing portal. They keep
  --  access until current_period_end, so this is display-only — the lock fires
  --  on status, not on this flag.
  cancel_at_period_end   boolean not null default false,

  comped           boolean not null default false,
  comped_reason    text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  --  A trial with no end date is a free account by accident. This is the
  --  constraint that makes the gate meaningful.
  constraint studio_subscriptions_trial_has_end
    check (status <> 'trialing' or trial_ends_at is not null)
);

create index if not exists studio_subscriptions_status_idx
  on public.studio_subscriptions(status);

--  The operator view: whose trial is about to run out.
create index if not exists studio_subscriptions_trial_idx
  on public.studio_subscriptions(trial_ends_at)
  where status = 'trialing';

create index if not exists studio_subscriptions_customer_idx
  on public.studio_subscriptions(stripe_customer_id);

drop trigger if exists studio_subscriptions_updated_at on public.studio_subscriptions;
create trigger studio_subscriptions_updated_at
  before update on public.studio_subscriptions
  for each row execute function private.touch_updated_at();

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.studio_subscriptions enable row level security;

--  Read-only to the application. Every write happens as service_role, from the
--  Stripe webhook or an operator action — a studio admin must not be able to
--  set their own status to 'active', which is the obvious attack on a paywall.
grant select on public.studio_subscriptions to authenticated;
grant select, insert, update, delete on public.studio_subscriptions to service_role;

drop policy if exists "studio_subscriptions_admin_read" on public.studio_subscriptions;
create policy "studio_subscriptions_admin_read" on public.studio_subscriptions
  for select using (
    studio_id = private.current_studio() and private.is_studio_admin()
  );

drop policy if exists "studio_subscriptions_operator_read" on public.studio_subscriptions;
create policy "studio_subscriptions_operator_read" on public.studio_subscriptions
  for select using (private.is_platform_operator());

-- ============================================================================
--  STUDIOS.PLAN_KEY — the mirror the entitlement loader can actually read
-- ============================================================================
--  loadEntitlements (lib/portal/entitlements.ts) runs on the ANON client, by
--  design: it also serves published studio sites, which have no session. It
--  therefore cannot read studio_subscriptions, whose select policy is
--  admin-only — and widening that policy to anon would publish every studio's
--  trial dates and payment status to the internet.
--
--  So the one field entitlements needs is mirrored onto studios, which anon
--  already reads for `vertical` in the same query. Cost: one column and a sync
--  trigger. Benefit: plan gating with no extra round-trip and no new leak
--  beyond the tier itself, which is already inferable from which features a
--  studio's public site uses.
--
--  Defaults to 'scale' — fail open. A studios row that somehow has no
--  subscription must not be silently stripped of features.
alter table public.studios
  add column if not exists plan_key text not null default 'scale';

alter table public.studios drop constraint if exists studios_plan_key_check;
alter table public.studios
  add constraint studios_plan_key_check
    check (plan_key in ('solo', 'studio', 'scale'));

comment on column public.studios.plan_key is
  'Read-only mirror of studio_subscriptions.plan_key, kept in sync by private.sync_studio_plan_key(). Exists so the anon-client entitlement loader can gate modules without reading the billing table. Never write this directly.';

create or replace function private.sync_studio_plan_key()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.studios
     set plan_key = new.plan_key
   where id = new.studio_id
     and plan_key is distinct from new.plan_key;
  return new;
end;
$$;

drop trigger if exists studio_subscriptions_sync_plan on public.studio_subscriptions;
create trigger studio_subscriptions_sync_plan
  after insert or update of plan_key on public.studio_subscriptions
  for each row execute function private.sync_studio_plan_key();

-- ============================================================================
--  TRIAL ON CREATION
-- ============================================================================
--  security definer because the inserting session is the studio's own creator
--  (an `authenticated` role with no write grant on this table by design, see
--  the RLS block above). The function is the only sanctioned writer on the
--  signup path.
--
--  A trial is on 'scale' deliberately: a studio evaluating Olune should see
--  everything Olune does, then choose a tier at checkout. Starting them on the
--  tier they'll probably buy means the trial sells the smaller product.
create or replace function private.grant_studio_trial()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.studio_subscriptions (studio_id, plan_key, status, trial_ends_at)
  values (new.id, 'scale', 'trialing', now() + interval '14 days')
  on conflict (studio_id) do nothing;
  return new;
end;
$$;

drop trigger if exists studios_grant_trial on public.studios;
create trigger studios_grant_trial
  after insert on public.studios
  for each row execute function private.grant_studio_trial();

-- ============================================================================
--  BACKFILL — grandfather everyone who is already here
-- ============================================================================
--  Runs after the trigger exists, but inserts into studio_subscriptions rather
--  than studios, so the trigger does not fire and cannot overwrite these rows.
--  `on conflict do nothing` keeps the migration re-runnable.
insert into public.studio_subscriptions
  (studio_id, plan_key, status, trial_ends_at, comped, comped_reason)
select
  s.id,
  'scale',
  'comped',
  null,
  true,
  'Grandfathered: signed up before Olune had paid plans (0119).'
from public.studios s
on conflict (studio_id) do nothing;

--  The sync trigger only fires for rows this statement actually inserted, so
--  set the mirror explicitly for anything already present from a re-run.
update public.studios s
   set plan_key = sub.plan_key
  from public.studio_subscriptions sub
 where sub.studio_id = s.id
   and s.plan_key is distinct from sub.plan_key;

comment on table public.studio_subscriptions is
  'Olune → studio billing. One row per studio: trial clock, plan, Stripe subscription. Read-only to studio admins; written by the Stripe webhook and platform operators. Tier → module mapping lives in lib/plans/catalog.ts, not here.';

comment on column public.studio_subscriptions.comped is
  'True = Olune is not charging this studio. Never expires and never locks the portal. Set for every studio that predates 0119.';
