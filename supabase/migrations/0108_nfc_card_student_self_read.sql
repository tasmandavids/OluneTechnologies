-- ============================================================================
--  0108 — Let any student read their own NFC check-in card
--
--  0103 gated the self-read policy on public.is_self_managed_student(), which
--  is correct for billing/enrolment surfaces but wrong here: minors log in to
--  /portal/student too, and the check-in card is now shown at the top of that
--  portal (plus offered as an Apple Wallet pass). Under the old policy a minor
--  couldn't see their own card at all.
--
--  Widening this leaks nothing meaningful — the row's only sensitive column is
--  `token`, which is the value physically written to the card already in the
--  student's pocket. Guardian and studio-admin reads are unchanged, and every
--  write path still runs through the admin/office policy.
--
--  Idempotent & guarded — safe to re-run.
-- ============================================================================

drop policy if exists "nfc_cards_self_read" on public.nfc_cards;
create policy "nfc_cards_self_read" on public.nfc_cards
  for select using (student_id = auth.uid());
