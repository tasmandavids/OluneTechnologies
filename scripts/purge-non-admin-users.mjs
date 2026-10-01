#!/usr/bin/env node
/**
 * Delete all Supabase auth users except the main admin, then remove orphaned studios.
 *
 * Usage:
 *   KEEP_ADMIN_EMAIL=you@example.com node --env-file=.env.local scripts/purge-non-admin-users.mjs
 *
 * KEEP_ADMIN_EMAIL is required. It used to default to the seeded
 * platform-admin@olune.test, which is now banned, so a bare run would have
 * deleted every real account.
 */

import { createServiceClient } from "./lib/supabase-admin.mjs";

const KEEP_EMAIL = (process.env.KEEP_ADMIN_EMAIL ?? "").trim().toLowerCase();
if (!KEEP_EMAIL) {
  console.error("Set KEEP_ADMIN_EMAIL to the account that must survive the purge.");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createServiceClient(url, serviceKey);

async function listAllUsers() {
  const users = [];
  let page = 1;
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 200) break;
    page += 1;
  }
  return users;
}

async function main() {
  console.log(`Keeping admin: ${KEEP_EMAIL}\n`);

  const users = await listAllUsers();
  const keeper = users.find((u) => u.email?.toLowerCase() === KEEP_EMAIL);

  if (!keeper) {
    console.error(`Keeper account not found (${KEEP_EMAIL}). Run seed:platform-admin first or set KEEP_ADMIN_EMAIL.`);
    process.exit(1);
  }

  const toDelete = users.filter((u) => u.id !== keeper.id);
  console.log(`Found ${users.length} user(s). Deleting ${toDelete.length}…`);

  let deleted = 0;
  let failed = 0;
  for (const user of toDelete) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      console.error(`  ✗ ${user.email ?? user.id}: ${error.message}`);
      failed += 1;
    } else {
      console.log(`  ✓ deleted ${user.email ?? user.id}`);
      deleted += 1;
    }
  }

  const { data: keeperProfile } = await admin
    .from("profiles")
    .select("studio_id")
    .eq("id", keeper.id)
    .maybeSingle();

  const keepStudioId = keeperProfile?.studio_id ?? null;

  if (keepStudioId) {
    const { error: studioErr } = await admin
      .from("studios")
      .delete()
      .neq("id", keepStudioId);
    if (studioErr) {
      console.warn("Could not prune extra studios:", studioErr.message);
    } else {
      console.log("Removed studios not linked to the kept admin.");
    }
  } else {
    const { error: studioErr } = await admin.from("studios").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (studioErr) {
      console.warn("Could not clear studios:", studioErr.message);
    } else {
      console.log("Removed all studios (keeper has no studio yet).");
    }
  }

  console.log(`\nDone. Deleted ${deleted} user(s)${failed ? `, ${failed} failed` : ""}.`);
  console.log(`Kept: ${KEEP_EMAIL} (${keeper.id})`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
