-- ============================================================================
--  0087_xero_connections_tenant_index.sql
--  Inbound Xero webhooks arrive keyed by Xero tenant_id (never studio_id), so
--  every reconcile looks the connection up by tenant. Index that path.
-- ============================================================================

create index if not exists xero_connections_tenant_idx
  on public.xero_connections(tenant_id);
