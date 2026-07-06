-- ============================================================================
--  0083_class_xero_item_code
--  Lets admins additionally assign a Xero Item (from Xero's own Products &
--  Services catalog, e.g. "TUITION-BALLET") to a class, picked from a live
--  dropdown backed by Xero — distinct from the ledger account code added in
--  0082. Freezes the item code onto each invoice line item at invoice-
--  creation time, same rationale as the account code: a class's item
--  reassignment later shouldn't rewrite already-sent invoices.
-- ============================================================================

alter table public.classes
  add column if not exists xero_item_code text;

alter table public.invoice_line_items
  add column if not exists item_code text;
