#!/usr/bin/env node
// ============================================================================
//  Production dependency audit, with reviewed exceptions that expire.
//
//  Replaces a bare `npm audit --omit=dev --audit-level=high`. That command has
//  no way to say "we looked at this one and it does not apply to us", so a
//  single unfixable transitive advisory turns every branch red forever — and
//  the usual response to a check that can never pass is to delete the check.
//  This keeps the check meaningful instead: anything high or critical fails,
//  unless it is listed below with a reason, and each listing expires so the
//  judgement gets revisited rather than inherited.
//
//  Adding an entry is a deliberate act. It needs the advisory id, why the
//  vulnerable path is not reachable from this codebase, and a date by which
//  someone looks again.
// ============================================================================

import { execFileSync } from "node:child_process";

/**
 * Reviewed advisories that do not fail the build.
 *
 * `expires` is a hard stop: past it the entry stops suppressing and the audit
 * fails, which is the point — an exception nobody revisits is just a silently
 * lowered bar.
 */
const REVIEWED = [
  {
    id: "GHSA-86w9-cpqp-85rv",
    package: "node-forge",
    severity: "high",
    expires: "2026-12-31",
    reason:
      "Reached only through passkit-generator, which this app uses to SIGN Apple Wallet " +
      "passes with its own certificate (lib/apple-wallet/pass.ts). The advisory is about " +
      "RSA PKCS#1 v1.5 signature VERIFICATION being too lenient; nothing here verifies a " +
      "third-party signature with node-forge. No upstream fix exists: node-forge 1.4.0 is " +
      "the latest release and passkit-generator 3.6.1 still requires ^1.4.0.",
  },
];

const FAIL_AT = new Set(["high", "critical"]);

function audit() {
  try {
    // npm audit exits non-zero when it finds anything, so the throw carries the
    // report we actually want.
    const out = execFileSync("npm", ["audit", "--omit=dev", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return JSON.parse(out);
  } catch (err) {
    if (err.stdout) return JSON.parse(err.stdout);
    throw err;
  }
}

/** Every advisory id behind one package entry, following nested `via` objects. */
function advisoryIds(vuln) {
  return (vuln.via ?? [])
    .filter((v) => typeof v === "object" && v.url)
    .map((v) => v.url.split("/").pop())
    .filter(Boolean);
}

const report = audit();
const today = new Date().toISOString().slice(0, 10);

const blocking = [];
const suppressed = [];
const expired = [];
const seen = new Set();

for (const [name, vuln] of Object.entries(report.vulnerabilities ?? {})) {
  if (!FAIL_AT.has(vuln.severity)) continue;

  const ids = advisoryIds(vuln);
  // A package whose only `via` entries are other package names (an indirect
  // effect, like passkit-generator -> node-forge) carries no advisory of its
  // own; it is covered once the root cause is.
  if (ids.length === 0) {
    const rootCovered = (vuln.via ?? []).every(
      (v) => typeof v === "string" && report.vulnerabilities[v],
    );
    if (rootCovered) continue;
  }

  for (const id of ids) {
    seen.add(id);
    const entry = REVIEWED.find((r) => r.id === id);
    if (!entry) {
      blocking.push({ name, id, severity: vuln.severity, fixAvailable: vuln.fixAvailable });
    } else if (entry.expires < today) {
      expired.push({ ...entry, name });
    } else {
      suppressed.push({ ...entry, name });
    }
  }
}

const stale = REVIEWED.filter((r) => !seen.has(r.id));

for (const s of suppressed) {
  console.log(`audit: ${s.id} (${s.package}, ${s.severity}) suppressed until ${s.expires}`);
}
for (const s of stale) {
  console.log(
    `audit: ${s.id} no longer reported — remove it from REVIEWED in scripts/check-audit.mjs`,
  );
}

let failed = false;

for (const e of expired) {
  console.error(
    `audit: the exception for ${e.id} (${e.package}) expired on ${e.expires}.\n` +
      `       Re-check whether it still does not apply, then move the date or drop the entry.`,
  );
  failed = true;
}

for (const b of blocking) {
  console.error(
    `audit: ${b.severity} advisory ${b.id} in ${b.name}` +
      (b.fixAvailable ? " — a fix is available, upgrade it." : " — no upstream fix.") +
      `\n       https://github.com/advisories/${b.id}` +
      `\n       If it genuinely cannot reach this codebase, add it to REVIEWED in` +
      `\n       scripts/check-audit.mjs with a reason and an expiry.`,
  );
  failed = true;
}

if (failed) process.exit(1);

const counts = report.metadata?.vulnerabilities ?? {};
console.log(
  `audit passed — ${counts.critical ?? 0} critical, ${counts.high ?? 0} high ` +
    `(${suppressed.length} reviewed), ${counts.moderate ?? 0} moderate, ${counts.low ?? 0} low.`,
);
