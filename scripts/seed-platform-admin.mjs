#!/usr/bin/env node
/**
 * Creates an Olune platform operator (and a demo studio for it to admin).
 *
 * ─── Read this before running it ────────────────────────────────────────────
 *
 * The account this creates is a CROSS-TENANT SUPERUSER: a `platform_operators`
 * row with `permissions: ["*"]`, which reads every studio's data — children's
 * names, addresses, photos, medical notes, guardian payment details. It is a
 * local and preview convenience, never a production fixture.
 *
 * Until August 2026 this script ran from CI on every merge to `main`, against
 * the linked (production) project, with the password hardcoded here and echoed
 * into the Actions log — and it reset that password on every run, so rotating
 * it by hand lasted until the next merge. That is why the guard below exists
 * and why it is deliberately awkward to satisfy:
 *
 *   ALLOW_PLATFORM_ADMIN_SEED=1   explicit opt-in, every single run
 *   PLATFORM_ADMIN_PASSWORD=…     no default, ≥16 chars, not a known-leaked one
 *   never from CI                 refuses outright when $CI is set
 *
 * The CI refusal is the important one: it means re-adding a `run:` step to a
 * workflow cannot silently recreate the exposure. Removing that check is not a
 * cleanup — it reopens the finding.
 *
 * Usage:
 *   ALLOW_PLATFORM_ADMIN_SEED=1 PLATFORM_ADMIN_PASSWORD='…' \
 *     node --env-file=.env.local scripts/seed-platform-admin.mjs
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { pathToFileURL } from "node:url";
import { createServiceClient } from "./lib/supabase-admin.mjs";

const DEFAULT_EMAIL = "platform-admin@olune.test";
const FULL_NAME = "Platform Admin";
const DEMO_STUDIO_NAME = "Demo Studio";
const DEMO_STUDIO_SLUG = "demo";

/** Long enough that the account is not worth guessing at. */
export const MIN_PASSWORD_LENGTH = 16;

/**
 * Passwords this script itself put into real databases before the guard
 * existed. Refusing them stops a rotation from quietly restoring the value it
 * was meant to replace.
 */
export const BURNED_PASSWORDS = new Set(["testadmin123"]);

/**
 * Why this environment must not seed, or null when it may.
 *
 * Pure and exported so `tests/seed-platform-admin-guard.test.ts` can hold the
 * refusals still without a database — the test is the reason a future edit
 * cannot loosen these by accident.
 */
export function seedRefusal(env) {
  if (env.CI) {
    return (
      "Refusing to seed from CI.\n" +
      "This account is a cross-tenant superuser and CI runs against the linked " +
      "production project. Run it locally, against a local or preview database."
    );
  }

  if (env.ALLOW_PLATFORM_ADMIN_SEED !== "1") {
    return (
      "Refusing to seed without an explicit opt-in.\n" +
      "Set ALLOW_PLATFORM_ADMIN_SEED=1 to confirm you mean to create a " +
      "cross-tenant superuser in the database this environment points at."
    );
  }

  const password = env.PLATFORM_ADMIN_PASSWORD;

  if (!password) {
    return (
      "PLATFORM_ADMIN_PASSWORD is not set.\n" +
      "This script has no default password — supply one you generated, and " +
      "store it in a password manager rather than in a file in this repo."
    );
  }

  if (BURNED_PASSWORDS.has(password.toLowerCase())) {
    return (
      "That password was published in this repository and is burned.\n" +
      "Choose a new one — reusing it restores the exposure this guard exists to close."
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return `PLATFORM_ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }

  return null;
}

async function findUserByEmail(admin, email) {
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const match = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function ensureUser(admin, email, password) {
  let user = await findUserByEmail(admin, email);

  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: FULL_NAME },
    });
    if (error) throw error;
    user = data.user;
    console.log("Created auth user:", user.id);
  } else {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log("Reset password for existing auth user:", user.id);
  }

  return user;
}

async function ensurePlatformOperator(admin, userId) {
  const { error } = await admin.from("platform_operators").upsert(
    {
      user_id: userId,
      full_name: FULL_NAME,
      title: "Olune Operator",
      permissions: ["*"],
    },
    { onConflict: "user_id" },
  );
  if (error) throw error;
  console.log("Platform operator row ensured (permissions: *).");
}

async function ensureDemoStudio(admin, userId, email) {
  const { data: profile } = await admin
    .from("profiles")
    .select("studio_id")
    .eq("id", userId)
    .single();

  if (profile?.studio_id) {
    console.log("User already linked to studio:", profile.studio_id);
    return;
  }

  const { data: existingStudio } = await admin
    .from("studios")
    .select("id")
    .eq("slug", DEMO_STUDIO_SLUG)
    .maybeSingle();

  let studioId = existingStudio?.id;

  if (!studioId) {
    const { data: studio, error: studioErr } = await admin
      .from("studios")
      .insert({ name: DEMO_STUDIO_NAME, slug: DEMO_STUDIO_SLUG, status: "trial" })
      .select("id")
      .single();
    if (studioErr) throw studioErr;
    studioId = studio.id;

    const { error: brandingErr } = await admin
      .from("studio_branding")
      .insert({ studio_id: studioId });
    if (brandingErr) throw brandingErr;

    console.log("Created demo studio:", studioId);
  } else {
    console.log("Reusing existing demo studio:", studioId);
  }

  const { error: profileErr } = await admin
    .from("profiles")
    .update({
      studio_id: studioId,
      role: "admin",
      full_name: FULL_NAME,
      email,
    })
    .eq("id", userId);

  if (profileErr) throw profileErr;
  console.log("Linked user as demo studio admin.");
}

async function main() {
  const refusal = seedRefusal(process.env);
  if (refusal) {
    console.error(`\n${refusal}\n`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Copy .env.local.example → .env.local and fill in Supabase API keys.",
    );
    process.exit(1);
  }

  const email = process.env.PLATFORM_ADMIN_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.PLATFORM_ADMIN_PASSWORD;

  // Name the target. The whole failure mode this guard closes was not knowing
  // which database a run was about to reach into.
  console.log(`Seeding platform operator ${email}`);
  console.log(`  target: ${new URL(url).host}\n`);

  const admin = createServiceClient(url, serviceKey);

  const user = await ensureUser(admin, email, password);
  await admin
    .from("profiles")
    .update({ full_name: FULL_NAME, email })
    .eq("id", user.id);

  await ensurePlatformOperator(admin, user.id);
  await ensureDemoStudio(admin, user.id, email);

  // The password is never printed: it came from the caller's environment, and
  // echoing it is how it reached a CI log last time.
  console.log("\nDone. Sign in at /login with the password you supplied, then:");
  console.log("  /platform       — Olune operator console (cross-tenant)");
  console.log("  /portal/admin   — Demo studio admin");
}

// Only when run directly — importing this file must not touch a database.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
