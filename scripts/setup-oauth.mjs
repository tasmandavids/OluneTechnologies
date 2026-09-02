#!/usr/bin/env node
/**
 * Configure Supabase Auth for Google OAuth.
 *
 * Usage:
 *   node --env-file=.env.local scripts/setup-oauth.mjs
 *   node --env-file=.env.local scripts/setup-oauth.mjs --enable-google
 *   node --env-file=.env.local scripts/setup-oauth.mjs --check   (read-only)
 *
 * Optional env vars for provider credentials:
 *   GOOGLE_OAUTH_CLIENT_ID
 *   GOOGLE_OAUTH_CLIENT_SECRET
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "wnoxcwihrzbxvogvmhqv";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const ROOT = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "localhost";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

if (!TOKEN) {
  console.error("Missing SUPABASE_ACCESS_TOKEN in environment (.env.local).");
  console.error("Create one at https://supabase.com/dashboard/account/tokens");
  process.exit(1);
}

const args = new Set(process.argv.slice(2));
const checkOnly = args.has("--check");
const enableGoogle =
  !checkOnly && (args.has("--enable-google") || Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID));

/**
 * A Site URL that points at the developer's own machine. Supabase falls back to
 * the Site URL whenever a redirect target is not in the allow-list, so a
 * loopback value there sends real users on the live site to a dead tab —
 * ERR_CONNECTION_REFUSED on 127.0.0.1 — after an otherwise successful sign-in.
 * It is also the value a project starts life with, so it survives by default.
 */
function isLoopbackUrl(url) {
  try {
    const { hostname } = new URL(url);
    return (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function callbackUrls() {
  const urls = new Set();

  // Supabase globs the ENTIRE redirect URL against these patterns, including
  // the ?next=… query string we send (e.g. /auth/callback?next=/join). A bare
  // "/auth/callback" entry therefore does NOT match a request that carries a
  // query — Supabase rejects it and falls back to the Site URL (apex). So each
  // host is registered with a trailing "/**", which matches the path AND the
  // query. This mirrors the working Vercel entries (…vercel.app/**).
  const withGlob = (base) => {
    urls.add(`${base}/auth/callback`); // explicit, for readability
    urls.add(`${base}/**`); // the one that actually matches with a query string
  };

  // Local dev, including studio subdomains (e.g. nova.localhost:3000).
  withGlob("http://localhost:3000");
  withGlob("http://127.0.0.1:3000");
  withGlob("https://127.0.0.1:3000");
  withGlob("http://*.localhost:3000");

  if (APP_URL) withGlob(APP_URL.replace(/\/$/, ""));

  // Production apex hosts.
  for (const host of ["olune.co.nz", "www.olune.co.nz", "olune.app", "www.olune.app"]) {
    withGlob(`https://${host}`);
  }

  // Wildcard studio subdomains. Studio sites live on <slug>.olune.co.nz and
  // OAuth must return to that same subdomain so the session cookie is set on
  // the host the user signed in from. Without this, Supabase rejects the
  // subdomain redirect and falls back to the Site URL (apex marketing page) —
  // the bug where Google sign-in dumps studio users on olune.co.nz and new
  // users get routed to create-your-own-studio onboarding.
  for (const domain of ["olune.co.nz", "olune.app"]) {
    withGlob(`https://*.${domain}`);
  }

  if (ROOT && ROOT !== "localhost") {
    withGlob(`https://${ROOT}`);
    withGlob(`https://www.${ROOT}`);
    withGlob(`https://*.${ROOT}`);
  }

  return [...urls];
}

async function api(path, init = {}) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} failed (${res.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

/**
 * Read-only diagnosis (--check): print what Auth is actually configured with
 * and name anything that would strand a signing-in user. Changes nothing, so
 * it is safe to run against production while someone is reporting a problem.
 * Exits non-zero when it finds a fault, so CI or a script can gate on it.
 */
function report(current, existing) {
  const siteUrl = (current.site_url ?? "").trim();
  // Only the "/**" globs are load-bearing — the bare "/auth/callback" twins are
  // there for readability and never match a redirect carrying a query string
  // (see callbackUrls()). Reporting them as missing would bury the real fault.
  const expected = callbackUrls().filter((u) => u.endsWith("/**"));
  const missing = expected.filter((u) => !existing.includes(u));
  const problems = [];

  console.log("\nSite URL:", siteUrl || "(unset)");
  if (!siteUrl) {
    problems.push("Site URL is unset — Supabase has nowhere to fall back to.");
  } else if (isLoopbackUrl(siteUrl)) {
    problems.push(
      `Site URL is ${siteUrl} — a developer machine. Every redirect Supabase ` +
        "cannot match against the allow-list lands there, so live sign-ins end " +
        "on a dead tab (ERR_CONNECTION_REFUSED).",
    );
  }

  console.log("\nRedirect URLs (%d):", existing.length);
  for (const url of existing) console.log("  •", url);

  if (missing.length) {
    console.log("\nMissing from the allow-list (%d):", missing.length);
    for (const url of missing) console.log("  ✗", url);
    problems.push(
      "Redirects to the hosts above are rejected and fall back to the Site URL.",
    );
  }

  console.log("\nProviders:");
  console.log("  Google:", current.external_google_enabled ? "enabled" : "disabled");

  if (!problems.length) {
    console.log("\n✓ Auth redirect configuration looks correct.\n");
    return;
  }

  console.log("\n✗ Problems found:");
  for (const p of problems) console.log("  •", p);
  console.log("\nRun without --check to repair (sets the Site URL and adds the missing entries):");
  console.log("  node --env-file=.env.local scripts/setup-oauth.mjs\n");
  process.exitCode = 1;
}

async function main() {
  const current = await api("/config/auth");
  const existing = (current.uri_allow_list ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (checkOnly) {
    return report(current, existing);
  }

  const merged = [...new Set([...existing, ...callbackUrls()])];
  const productionSite =
    process.env.SUPABASE_SITE_URL?.replace(/\/$/, "") ||
    (APP_URL && !APP_URL.includes("localhost") ? APP_URL.replace(/\/$/, "") : null) ||
    "https://www.olune.co.nz";
  const patch = {
    site_url: productionSite,
    uri_allow_list: merged.join(","),
  };

  if (enableGoogle) {
    const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
    const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    if (!id || !secret) {
      console.error("Google enable requested but GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET missing.");
      process.exit(1);
    }
    patch.external_google_enabled = true;
    patch.external_google_client_id = id;
    patch.external_google_secret = secret;
    patch.external_google_skip_nonce_check = false;
  }

  const updated = await api("/config/auth", {
    method: "PATCH",
    body: JSON.stringify(patch),
  });

  console.log("\n✓ Supabase auth config updated\n");
  console.log("Site URL:", updated.site_url);
  console.log("Redirect URLs:");
  for (const url of (updated.uri_allow_list ?? "").split(",").filter(Boolean)) {
    console.log("  •", url.trim());
  }
  console.log("\nProviders:");
  console.log("  Google:", updated.external_google_enabled ? "enabled" : "disabled");

  const supabaseCallback = `https://${PROJECT_REF}.supabase.co/auth/v1/callback`;
  console.log("\n── Provider console setup ──────────────────────────────");
  console.log("\nUse this redirect URI in Google Cloud Console:");
  console.log(" ", supabaseCallback);
  console.log("\nGoogle Cloud Console → APIs & Services → Credentials → OAuth client:");
  console.log("  https://console.cloud.google.com/apis/credentials");
  const origins = ["http://localhost:3000"];
  if (APP_URL) origins.push(APP_URL.replace(/\/$/, ""));
  else if (ROOT && ROOT !== "localhost") {
    origins.push(`https://${ROOT}`, `https://www.${ROOT}`);
  }
  console.log("  Authorized JavaScript origins:");
  for (const o of origins) console.log("   ", o);
  console.log("  Authorized redirect URIs:", supabaseCallback);
  console.log("\nSupabase provider settings:");
  console.log(`  https://supabase.com/dashboard/project/${PROJECT_REF}/auth/providers`);

  if (!updated.external_google_enabled) {
    console.log("\nTo enable Google once credentials are in .env.local, run:");
    console.log("  node --env-file=.env.local scripts/setup-oauth.mjs --enable-google");
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
