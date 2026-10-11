-- October audit R-08: production contains private.handle_deleted_user(), which
-- was created from the dashboard and by no migration, so a fresh database
-- differed from production. Capture it verbatim (idempotent: a no-op where it
-- already exists). No trigger references it; it stays locked down.

create schema if not exists private;

create or replace function private.handle_deleted_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.profiles where id = old.id;
  return old;
end;
$function$;

revoke all on function private.handle_deleted_user() from public, anon, authenticated;
