-- ============================================================================
--  0082_class_xero_account_code
--  Lets admins assign a Xero chart-of-accounts code per class (picked from a
--  live dropdown backed by Xero, not free-typed), and freezes that code onto
--  each invoice line item at invoice-creation time so a class's ledger
--  reassignment later doesn't silently rewrite already-sent invoices.
-- ============================================================================

alter table public.classes
  add column if not exists xero_account_code text;

alter table public.invoice_line_items
  add column if not exists account_code text;
