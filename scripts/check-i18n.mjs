#!/usr/bin/env node
/**
 * i18n guardrail.
 *
 * Fails the build when a locale drifts from the English source:
 *   1. a message file is missing or contains invalid JSON
 *   2. a key exists in messages/en but is missing from another locale
 *   3. a locale has a key English doesn't have (dead key)
 *   4. a string is not valid ICU MessageFormat
 *   5. the ICU argument set differs between en and a translation
 *   6. a Russian plural omits the `few` or `many` category
 *   7. a value in a critical namespace is byte-identical to English
 *      (i.e. copy-pasted and never translated)
 *
 * Rule 7 has an allowlist for values that are legitimately the same word in
 * another language ("Actions" in French, "Dashboard" in Italian). Add to
 * IDENTICAL_OK below rather than weakening the rule.
 *
 * Run: node scripts/check-i18n.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "@formatjs/icu-messageformat-parser";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MESSAGES = path.join(ROOT, "messages");
const SOURCE = "en";

/** Keep in sync with MESSAGE_MODULES in lib/i18n/load-messages.ts */
const MODULES = [
  "core", "errors", "onboarding", "setup", "marketing", "enrol", "join",
  "programmes", "admin", "parent", "portal", "teacher", "student",
  "platform", "site", "payments", "office",
];

/**
 * Namespaces where an untranslated value is a bug rather than a coincidence.
 * Deliberately excludes `site` and `marketing`, where brand names, prices and
 * proper nouns legitimately match across locales.
 */
const CRITICAL_NAMESPACES = ["common", "nav", "auth", "shell", "roles", "errors", "payments"];

/** Key patterns whose value is legitimately identical in every locale. */
const IDENTICAL_OK_KEYS = [
  /Placeholder$/,                 // you@studio.co.nz, jane-smith, …
  /^setup\.regions\./,            // New Zealand place names
  /^errors\.notFound\.eyebrow$/,  // "404"
  /\.(command|sku|slug)$/,
];

/**
 * Per-locale words that are correctly spelled the same as the English source.
 * `"*"` applies to every locale.
 */
const IDENTICAL_OK = {
  "*": ["Olune"],
  fr: [
    "Actions", "Date", "Total", "Parent", "Parents", "Messages", "Notifications",
    "Documents", "Studio", "Studios", "Pages", "Finance", "Communications",
    "Badges", "Description", "Note", "Type", "Minimum", "Transactions",
    "Conversation", "Participants", "Absent", "Technique", "Performance", "Active",
  ],
  it: [
    "Team", "Studio", "Account", "Dashboard", "Staff", "Check-in", "Link",
    "Email", "Chat", "SEO", "Performance",
  ],
  ru: [],
  zh: ["SKU", "SEO"],
};

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const errors = [];
const warnings = [];

function loadLocale(locale) {
  const out = {};
  for (const mod of MODULES) {
    const file = path.join(MESSAGES, locale, `${mod}.json`);
    if (!fs.existsSync(file)) {
      errors.push(`${locale}: missing module file ${mod}.json`);
      continue;
    }
    try {
      Object.assign(out, flatten(JSON.parse(fs.readFileSync(file, "utf8"))));
    } catch (err) {
      errors.push(`${locale}/${mod}.json: invalid JSON — ${err.message}`);
    }
  }
  return out;
}

/**
 * Argument names actually interpolated by the message, read off the ICU AST.
 * A regex can't do this correctly: in `{n, plural, =0 {today} other {#}}` the
 * `{today}` is literal text, not an argument.
 */
function icuArgs(value) {
  if (typeof value !== "string") return [];
  const found = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      // 0 literal · 1 argument · 2 number · 3 date · 4 time · 5 select · 6 plural · 7 pound · 8 tag
      if (node.type >= 1 && node.type <= 6 && node.value) found.add(node.value);
      if (node.options) for (const opt of Object.values(node.options)) walk(opt.value);
      if (node.children) walk(node.children);
    }
  };
  walk(parse(value));
  return [...found].sort();
}

const isIdenticalOk = (locale, key, value) =>
  IDENTICAL_OK_KEYS.some((re) => re.test(key)) ||
  (IDENTICAL_OK["*"] ?? []).includes(value) ||
  (IDENTICAL_OK[locale] ?? []).includes(value);

const locales = fs
  .readdirSync(MESSAGES)
  .filter((d) => fs.statSync(path.join(MESSAGES, d)).isDirectory());

const source = loadLocale(SOURCE);
const sourceKeys = Object.keys(source);

for (const locale of locales) {
  const target = locale === SOURCE ? source : loadLocale(locale);

  // 4 — every string must be parseable ICU, source included
  for (const [key, value] of Object.entries(target)) {
    if (typeof value !== "string") continue;
    try {
      parse(value);
    } catch (err) {
      errors.push(`${locale}: invalid ICU in "${key}" — ${err.message}`);
    }
  }

  if (locale === SOURCE) continue;

  // 2 + 3 — key parity
  for (const k of sourceKeys.filter((k) => !(k in target))) {
    errors.push(`${locale}: missing key "${k}"`);
  }
  for (const k of Object.keys(target).filter((k) => !(k in source))) {
    errors.push(`${locale}: key "${k}" does not exist in ${SOURCE}`);
  }

  for (const key of sourceKeys) {
    if (!(key in target)) continue;
    const from = source[key];
    const to = target[key];

    // 5 — ICU arguments must match exactly
    let a, b;
    try {
      a = icuArgs(from).join("|");
      b = icuArgs(to).join("|");
    } catch {
      continue; // already reported as an ICU parse failure
    }
    if (a !== b) {
      errors.push(
        `${locale}: ICU arguments differ for "${key}"\n      ${SOURCE}: {${a}}\n      ${locale}: {${b}}`,
      );
    }

    // 6 — Russian plural categories
    if (locale === "ru" && typeof to === "string" && /,\s*plural\s*,/.test(to)) {
      const missing = [
        !/\bfew\s*\{/.test(to) && "few",
        !/\bmany\s*\{/.test(to) && "many",
      ].filter(Boolean);
      if (missing.length) {
        errors.push(`ru: plural "${key}" is missing the ${missing.join(" and ")} category`);
      }
    }

    // 7 — untranslated values in critical namespaces
    if (
      typeof from === "string" &&
      from === to &&
      from.trim().length > 2 &&
      CRITICAL_NAMESPACES.includes(key.split(".")[0]) &&
      !isIdenticalOk(locale, key, from)
    ) {
      errors.push(`${locale}: "${key}" is still the English value (${JSON.stringify(from)})`);
    }
  }

  // Advisory — untranslated values outside the critical namespaces.
  const soft = sourceKeys.filter(
    (k) =>
      typeof source[k] === "string" &&
      target[k] === source[k] &&
      source[k].trim().length > 2 &&
      !CRITICAL_NAMESPACES.includes(k.split(".")[0]) &&
      !isIdenticalOk(locale, k, source[k]),
  );
  if (soft.length) {
    warnings.push(`${locale}: ${soft.length} values outside critical namespaces still match English`);
  }
}

if (warnings.length) {
  console.warn("i18n warnings (not fatal):");
  for (const w of warnings) console.warn(`  • ${w}`);
  console.warn("");
}

if (errors.length) {
  console.error(`i18n check failed — ${errors.length} problem(s):\n`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error("");
  process.exit(1);
}

console.log(
  `i18n check passed — ${sourceKeys.length} keys × ${locales.length} locales, no drift.`,
);
