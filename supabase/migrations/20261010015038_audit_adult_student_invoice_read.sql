-- October audit F2a-02: self-managed adult students can read the invoices they
-- pay. Migration 0056 gave them INSERT/UPDATE on invoices but no SELECT, so the
-- billing page was always empty. payments and invoice_line_items already allow
-- the payer to read their own rows.
drop policy if exists "inv_student_read" on public.invoices;
create policy "inv_student_read" on public.invoices
  for select to authenticated
  using (
    studio_id = (select private.current_studio())
    and (select private.is_self_managed_student())
    and payer_id = (select auth.uid())
  );
