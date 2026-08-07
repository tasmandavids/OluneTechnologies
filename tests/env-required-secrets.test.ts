// ============================================================================
//  Production-required secrets registry.
//
//  The bug this guards against: `requireSecret` falls back to EMAIL_*/CRON_SECRET
//  outside production and throws inside it, so a call site added without a
//  matching registry entry works perfectly in dev and takes a feature down in
//  prod — silently, because the throw happens inside a crypto helper on a user
//  code path rather than at boot. That is how INTEGRATIONS_TOKEN_ENCRYPTION_KEY
//  shipped undocumented and unmonitored.
//
//  So the registry is checked against the source itself: every name passed to
//  requireSecret must be listed, and every listed name must really be used.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  PRODUCTION_REQUIRED_SECRETS,
  missingProductionSecrets,
} from "@/lib/env/required-secret";

const ROOT = resolve(__dirname, "..");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Names passed as the first argument to requireSecret(), across lib/ and app/. */
function calledSecretNames(): Set<string> {
  const names = new Set<string>();
  for (const file of [...sourceFiles(join(ROOT, "lib")), ...sourceFiles(join(ROOT, "app"))]) {
    // The definition itself takes `name: string`, not a literal — skip it.
    if (file.endsWith(join("lib", "env", "required-secret.ts"))) continue;
    const src = readFileSync(file, "utf8");
    for (const match of src.matchAll(/requireSecret\(\s*["'`]([A-Z0-9_]+)["'`]/g)) {
      names.add(match[1]);
    }
  }
  return names;
}

describe("production-required secrets registry", () => {
  const registered = new Set(PRODUCTION_REQUIRED_SECRETS.map((s) => s.name));

  it("lists every secret requireSecret demands", () => {
    const missing = [...calledSecretNames()].filter((n) => !registered.has(n));
    expect(
      missing,
      `requireSecret() is called with ${missing.join(", ")}, which ${
        missing.length === 1 ? "is" : "are"
      } absent from PRODUCTION_REQUIRED_SECRETS. Add an entry so /api/health/secrets ` +
        `can report it before a studio owner finds it in production.`,
    ).toEqual([]);
  });

  it("lists no secret that nothing actually requires", () => {
    const called = calledSecretNames();
    const stale = [...registered].filter((n) => !called.has(n));
    expect(
      stale,
      `PRODUCTION_REQUIRED_SECRETS lists ${stale.join(", ")}, which no requireSecret() ` +
        `call site uses. Remove the entry so the health check does not report a ` +
        `false outage.`,
    ).toEqual([]);
  });

  it("finds the call sites at all", () => {
    // Guards the regex: if it silently matched nothing, both checks above pass
    // vacuously and the registry stops being verified.
    expect(calledSecretNames().size).toBeGreaterThan(0);
  });

  it("gives every entry a consequence, not just a name", () => {
    for (const secret of PRODUCTION_REQUIRED_SECRETS) {
      expect(secret.breaks.trim().length, `${secret.name} needs a 'breaks'`).toBeGreaterThan(0);
    }
  });
});

describe("missingProductionSecrets", () => {
  it("reports a secret whose value is absent or blank", () => {
    const missing = missingProductionSecrets({ EMAIL_TOKEN_ENCRYPTION_KEY: "   " });
    expect(missing.map((s) => s.name)).toContain("EMAIL_TOKEN_ENCRYPTION_KEY");
  });

  it("reports nothing when every secret has a value", () => {
    const full = Object.fromEntries(
      PRODUCTION_REQUIRED_SECRETS.map((s) => [s.name, "set"]),
    );
    expect(missingProductionSecrets(full)).toEqual([]);
  });
});
