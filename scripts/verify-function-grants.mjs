#!/usr/bin/env node
/**
 * Guard against the regression that migrations 0048 and 0075 both tried and
 * failed to fix permanently.
 *
 * Supabase ships `alter default privileges ... grant execute on functions to
 * anon, authenticated`, and PostgreSQL additionally grants EXECUTE to PUBLIC on
 * every new function no matter what the default privileges say (verified: you
 * cannot revoke that in ALTER DEFAULT PRIVILEGES — revoking from every role
 * collapses the pg_default_acl row to NULL, which *means* the built-in default).
 *
 * The consequence is that every migration adding a function to `public` silently
 * publishes it at /rest/v1/rpc/<name> for anon unless it revokes by hand. There
 * is no database-level way to prevent that, so it is checked here instead.
 *
 * Fails if:
 *   - any function in `public` is executable by `anon`
 *   - any SECURITY DEFINER function in `public` is executable by
 *     `authenticated` without being in ALLOWED_AUTHENTICATED_RPCS below
 *
 * Adding a function to the allowlist is the deliberate act of saying "yes, a
 * signed-in user may call this, and I have checked that its body authorises the
 * caller itself." Do not add trigger functions or RLS helpers — those belong in
 * the `private` schema, which PostgREST does not expose.
 *
 * Usage: node --env-file=.env.local scripts/verify-function-grants.mjs
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "wnoxcwihrzbxvogvmhqv";
const token = process.env.SUPABASE_ACCESS_TOKEN;

/**
 * Functions in `public` that signed-in users are meant to call over
 * /rest/v1/rpc. Keyed by name; overloads share an entry.
 *
 * `anon` is intentionally absent from this file — nothing in this app is
 * designed to be called by a signed-out client, so any anon EXECUTE is a bug.
 */
const ALLOWED_AUTHENTICATED_RPCS = new Set([
  "accept_private_lesson", // app/portal/teacher/private-lessons/actions.ts
  "accept_studio_invite", // app/portal/teacher/affiliations/actions.ts
  "admin_record_installment_payment", // app/portal/admin/payment-plans/actions.ts
  "create_instructor_workspace_for_user", // components/onboarding/OnboardingWizard.tsx
  "create_studio_for_user", // components/onboarding/OnboardingWizard.tsx
  "decline_private_lesson", // app/portal/teacher/private-lessons/actions.ts
  "enroll_student_atomic", // app/portal/{admin/students,parent/enroll}/actions.ts
  "mark_inquiry_viewed", // app/portal/teacher/network/[id]/actions.ts
  "register_device_token", // app/api/devices/route.ts
  "register_studio_member", // app/join/actions.ts
]);

const QUERY = `
  select p.proname as name,
         pg_get_function_identity_arguments(p.oid) as args,
         p.prosecdef as security_definer,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prokind = 'f'
  order by p.proname
`;

async function fetchFunctions() {
  if (!token) {
    throw new Error(
      "SUPABASE_ACCESS_TOKEN missing — add to .env.local (supabase.com/dashboard/account/tokens)",
    );
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: QUERY }),
    },
  );

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? body.message
        : `HTTP ${res.status}`;
    throw new Error(`Management API query failed: ${msg}`);
  }
  return body;
}

function signature(fn) {
  return `public.${fn.name}(${fn.args})`;
}

async function main() {
  const functions = await fetchFunctions();

  const anonExposed = functions.filter((f) => f.anon_exec);
  const authExposed = functions.filter(
    (f) =>
      f.auth_exec && f.security_definer && !ALLOWED_AUTHENTICATED_RPCS.has(f.name),
  );
  // An allowlisted RPC that lost its grant is just as broken as an unguarded
  // one — the app calls it and gets a permission error at runtime.
  const missingGrants = [...ALLOWED_AUTHENTICATED_RPCS].filter(
    (name) =>
      functions.some((f) => f.name === name) &&
      !functions.some((f) => f.name === name && f.auth_exec),
  );

  console.log(`Checked ${functions.length} functions in schema public.`);

  if (
    anonExposed.length === 0 &&
    authExposed.length === 0 &&
    missingGrants.length === 0
  ) {
    console.log("\n✓ No function in public is reachable by anon.");
    console.log("✓ Every authenticated-callable SECURITY DEFINER function is allowlisted.");
    return;
  }

  if (anonExposed.length > 0) {
    console.error(
      `\n✗ ${anonExposed.length} function(s) in public are executable by anon:`,
    );
    for (const f of anonExposed) console.error(`    ${signature(f)}`);
    console.error(
      "\n  Fix in a migration:\n" +
        "    revoke all on function public.<name>(<args>) from public, anon, authenticated;\n" +
        "    grant execute on function public.<name>(<args>) to authenticated;  -- only if it is a real RPC\n" +
        "  `from public` is required — revoking from `anon` alone does nothing.",
    );
  }

  if (authExposed.length > 0) {
    console.error(
      `\n✗ ${authExposed.length} SECURITY DEFINER function(s) are callable by authenticated but not allowlisted:`,
    );
    for (const f of authExposed) console.error(`    ${signature(f)}`);
    console.error(
      "\n  Either move it to the `private` schema (trigger functions and RLS\n" +
        "  helpers belong there), or add it to ALLOWED_AUTHENTICATED_RPCS in\n" +
        "  scripts/verify-function-grants.mjs once you have checked that its body\n" +
        "  authorises the caller.",
    );
  }

  if (missingGrants.length > 0) {
    console.error(
      `\n✗ ${missingGrants.length} allowlisted RPC(s) are NOT callable by authenticated:`,
    );
    for (const name of missingGrants) console.error(`    public.${name}`);
    console.error(
      "\n  The app calls these; without the grant they fail at runtime.\n" +
        "  Add: grant execute on function public.<name>(<args>) to authenticated;",
    );
  }

  process.exit(1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
