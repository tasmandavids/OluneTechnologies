#!/usr/bin/env node
/**
 * Compare local migration files with remote supabase_migrations.schema_migrations.
 * Uses Supabase Management API (no local CLI required).
 *
 * Usage: node --env-file=.env.local scripts/verify-migrations.mjs
 */

import { readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? "wnoxcwihrzbxvogvmhqv";
const token = process.env.SUPABASE_ACCESS_TOKEN;

function localVersions() {
  return readdirSync(resolve(root, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => f.split("_", 1)[0])
    .sort();
}

async function remoteVersions() {
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
      body: JSON.stringify({
        query:
          "select version from supabase_migrations.schema_migrations order by version",
      }),
    },
  );

  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      typeof body === "object" && body && "message" in body
        ? body.message
        : JSON.stringify(body);
    throw new Error(`Management API ${res.status}: ${msg}`);
  }

  if (!Array.isArray(body)) {
    throw new Error("Unexpected API response — expected migration rows");
  }

  return body.map((row) => String(row.version)).sort();
}

async function main() {
  const local = localVersions();
  const remote = await remoteVersions();
  const remoteSet = new Set(remote);

  const missingOnRemote = local.filter((v) => !remoteSet.has(v));
  const localSet = new Set(local);
  const extraOnRemote = remote.filter((v) => !localSet.has(v));

  console.log(`Project:  ${PROJECT_REF}`);
  console.log(`Local:    ${local.length} migrations (latest ${local.at(-1)})`);
  console.log(`Remote:   ${remote.length} migrations (latest ${remote.at(-1)})`);

  if (missingOnRemote.length === 0 && extraOnRemote.length === 0) {
    console.log("\n✓ Local and remote migrations are in sync.");
    return;
  }

  if (missingOnRemote.length > 0) {
    console.error(`\n✗ Pending on remote: ${missingOnRemote.join(", ")}`);
    console.error("  Run: npm run db:push");
  }
  if (extraOnRemote.length > 0) {
    console.error(`\n✗ On remote but not in repo: ${extraOnRemote.join(", ")}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
