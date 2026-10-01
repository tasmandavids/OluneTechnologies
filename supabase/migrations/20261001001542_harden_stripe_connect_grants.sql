-- ============================================================================
--  Harden Stripe Connect table grants.
--
--  RLS already scopes authenticated access by studio, but both API roles
--  inherited every table privilege when migration 0090 created these tables.
--  That included TRUNCATE, TRIGGER and REFERENCES, which application clients
--  never need, plus all privileges for anon despite there being no anonymous
--  policy. Keep RLS as the row boundary and least-privilege grants as a second
--  independent boundary.
-- ============================================================================

revoke all on table public.stripe_connect_accounts from anon, authenticated;
grant select, insert, update, delete on table public.stripe_connect_accounts to authenticated;

revoke all on table public.profile_stripe_customers from anon, authenticated;
grant select, insert, update on table public.profile_stripe_customers to authenticated;
