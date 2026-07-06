-- ============================================================================
--  0084_invoice_line_items_payer_insert
--  invoice_line_items has only ever had an admin-only insert policy
--  ("invoice_line_items_admin", 0038). The parent/self-managed-student
--  enrollment flow (insertEnrollmentInvoice in
--  app/portal/parent/enroll/actions.ts) writes both the `invoices` row and
--  its `invoice_line_items` rows using the caller's own session-scoped
--  client — the invoices insert has always been allowed via
--  inv_parent_insert_own / inv_student_insert_own, but the matching
--  invoice_line_items insert was silently rejected by RLS (the app code
--  doesn't check that insert's error), leaving every parent-created
--  enrollment invoice with zero line items. Xero sync then fell back to a
--  single synthesized line with no account/item code, which is why
--  itemization and Xero account/item codes never showed up on these
--  invoices no matter what was configured on the class.
-- ============================================================================

drop policy if exists "invoice_line_items_payer_insert_own" on public.invoice_line_items;
create policy "invoice_line_items_payer_insert_own" on public.invoice_line_items
  for insert with check (
    exists (
      select 1 from public.invoices i
      where i.id = invoice_id
        and i.studio_id = private.current_studio()
        and i.payer_id = (select auth.uid())
        and (
          private.is_my_child(i.student_id)
          or (public.is_self_managed_student() and i.student_id = (select auth.uid()))
        )
    )
  );
