-- ============================================================================
--  0111_invoice_counter_rls_and_guardianship_indexes.sql
--
--  Two findings from the nightly security/performance audit.
--
--  1. studio_invoice_counters is the only table in public without RLS.
--
--     0060 created it to hold one row per studio — the high-water mark used by
--     assign_invoice_number() to hand out INV-0001, INV-0002, … Because
--     Supabase grants the public schema to `anon` and `authenticated` by
--     default, and this table has no RLS and no policies, every signed-in user
--     of every studio can currently SELECT it (reading how many invoices each
--     studio has issued — a direct proxy for another tenant's billing volume)
--     and, worse, UPDATE or DELETE it. Setting last_number backwards on a
--     competitor's row makes the next invoice collide with an existing
--     (studio_id, invoice_number) pair and the insert fails outright, since
--     0060 put a unique index on that pair. That is a cross-tenant denial of
--     invoicing, from any logged-in account.
--
--     The fix is to enable RLS and grant nothing. No policy is needed and none
--     is wanted: the only legitimate writer is assign_invoice_number(), which
--     is SECURITY DEFINER and owned by postgres, so it bypasses RLS. Nothing
--     in app/ or lib/ reads or writes this table directly (verified by grep) —
--     the number arrives on the invoice row via the BEFORE INSERT trigger.
--
--  2. guardianships is queried by studio_id from ~16 call sites with no index
--     that leads on it.
--
--     0002 indexed guardian_id and student_id, which serve the parent- and
--     student-side RLS reads. But every admin-side read filters studio_id
--     first — admin/people, admin/parents, admin/students, money/invoices-tab,
--     money/plans-tab, lib/forms/data, lib/portal/teacher-messages — and those
--     plans fall back to a sequential scan of the whole table across all
--     tenants. The two composite indexes below match the two shapes actually
--     issued: `.eq(studio_id).in(student_id, …)` and
--     `.eq(studio_id).eq(guardian_id)`. A bare `.eq(studio_id)` uses either.
--
--     The existing single-column indexes stay — they still serve the parent
--     and student RLS paths, which never filter on studio_id.
-- ============================================================================

-- ─── 1. Lock down the invoice counter ───────────────────────────────────────

alter table public.studio_invoice_counters enable row level security;

-- Belt and braces: revoke the default public-schema grants as well, so the
-- table is unreachable over PostgREST even if a permissive policy is ever
-- added to it by mistake.
revoke all on public.studio_invoice_counters from anon, authenticated;

-- ─── 2. Index guardianships for the admin (studio-scoped) reads ─────────────

create index if not exists guardianships_studio_student_idx
  on public.guardianships (studio_id, student_id);

create index if not exists guardianships_studio_guardian_idx
  on public.guardianships (studio_id, guardian_id);
