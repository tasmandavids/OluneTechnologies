-- ============================================================================
--  0092 — link class_passes to the invoice generated for their payment.
--
--  Class-pass sales now generate a real public.invoices row (classified under
--  chart-of-accounts code 200-01) instead of only a payments-ledger row, so
--  they report correctly in accounting/Xero. This column lets a pass row
--  point back at that invoice (traceability, and lets refund reconciliation
--  in lib/webhooks/process-stripe-event.ts find it).
-- ============================================================================

alter table public.class_passes
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

create index if not exists class_passes_invoice_idx on public.class_passes(invoice_id);
