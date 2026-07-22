-- ============================================================================
-- Fix substitute_requests claim RLS violation
-- ============================================================================
-- Postgres requires the *new* row produced by an UPDATE to remain visible
-- under a SELECT policy, in addition to satisfying the command's WITH CHECK.
-- sub_requests_teacher_read only allowed status = 'open', so the instant a
-- non-admin teacher claimed a slot (setting status = 'filled'), the resulting
-- row became invisible to them and the UPDATE was rejected with
-- "new row violates row-level security policy for table substitute_requests".
-- It also meant a teacher's own claimed slots never showed up again on
-- reload. Allow a teacher to always see requests they've filled themselves.

drop policy if exists "sub_requests_teacher_read" on public.substitute_requests;
create policy "sub_requests_teacher_read" on public.substitute_requests
  for select using (
    filled_by = (select auth.uid())
    or (
      status = 'open'
      and (
        studio_id = private.current_studio()
        or exists (
          select 1 from public.studio_memberships sm
          where sm.user_id = (select auth.uid())
            and sm.studio_id = substitute_requests.studio_id
            and sm.status = 'active'
        )
      )
    )
  );
