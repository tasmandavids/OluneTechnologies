#!/usr/bin/env node
// Finds user-facing English literals that never reach next-intl.
//
// Three sources of untranslated copy, each invisible to check-i18n.mjs because
// that script only compares message files against each other:
//   1. JSX text nodes            <p>Save changes</p>
//   2. User-facing JSX attributes placeholder / title / aria-label / label / alt
//   3. String literals thrown or assigned as errors/toasts in .ts action files
//
// Heuristics are deliberately conservative: a literal must look like prose
// (contains a space or is a capitalised word >3 chars) and must not look like
// a className, url, key, or code identifier.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components"];

// Marketing copy is deliberately English-only per docs/i18n-audit-2026-08-07.md.
const EXCLUDE = [
  "components/marketing/",
  "app/(marketing)/",
  "node_modules",
];

const ATTRS = ["placeholder", "title", "aria-label", "label", "alt", "emptyMessage"];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = relative(ROOT, full);
    if (EXCLUDE.some((e) => rel.startsWith(e))) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(tsx|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

// Looks like prose a user would read, not code.
function isProse(s) {
  const v = s.trim();
  if (v.length < 4) return false;
  if (!/[a-z]/.test(v)) return false;              // ALLCAPS / constants
  if (/^[a-z0-9_.-]+$/.test(v)) return false;      // identifier / key / css
  if (/^https?:|^\/|^#|^@/.test(v)) return false;  // url / path / anchor
  if (/^[\w-]+\.(png|jpg|svg|webp|json|ts|tsx)$/.test(v)) return false;
  if (/[{}<>$]/.test(v)) return false;             // template / jsx fragment
  if (/^\s*[\d.,%$]+\s*$/.test(v)) return false;   // numeric
  // Prose: has a space, or is a capitalised word of decent length.
  return /\s/.test(v) || /^[A-Z][a-z]{3,}$/.test(v);
}

const findings = [];

for (const dir of SCAN_DIRS) {
  for (const file of walk(join(ROOT, dir))) {
    const rel = relative(ROOT, file);
    const src = readFileSync(file, "utf8");
    const lines = src.split("\n");
    const isTsx = file.endsWith(".tsx");

    lines.forEach((line, i) => {
      const n = i + 1;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments

      if (isTsx) {
        // JSX text nodes: >text< on one line
        for (const m of line.matchAll(/>([^<>{}\n]+)</g)) {
          if (isProse(m[1])) findings.push({ file: rel, line: n, kind: "jsx-text", text: m[1].trim() });
        }
        // User-facing attributes with literal values
        for (const attr of ATTRS) {
          const re = new RegExp(`\\b${attr}=\"([^\"]+)\"`, "g");
          for (const m of line.matchAll(re)) {
            if (isProse(m[1])) findings.push({ file: rel, line: n, kind: `attr:${attr}`, text: m[1] });
          }
        }
      } else {
        // .ts action/route files: thrown or returned user-facing messages
        for (const m of line.matchAll(/(?:Error\(|error:\s*|message:\s*|toast\.\w+\()\s*"([^"]+)"/g)) {
          if (isProse(m[1])) findings.push({ file: rel, line: n, kind: "error-msg", text: m[1] });
        }
      }
    });
  }
}

// Group by top-level area
const byArea = {};
for (const f of findings) {
  const parts = f.file.split("/");
  const area = parts.slice(0, Math.min(3, parts.length - 1)).join("/") || parts[0];
  (byArea[area] ||= []).push(f);
}

const areas = Object.entries(byArea).sort((a, b) => b[1].length - a[1].length);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(findings, null, 2));
} else if (process.argv.includes("--files")) {
  const byFile = {};
  for (const f of findings) (byFile[f.file] ||= []).push(f);
  Object.entries(byFile)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([file, list]) => console.log(`${String(list.length).padStart(4)}  ${file}`));
} else {
  console.log(`Hardcoded user-facing strings: ${findings.length}\n`);
  for (const [area, list] of areas) {
    console.log(`${String(list.length).padStart(4)}  ${area}`);
  }
}
