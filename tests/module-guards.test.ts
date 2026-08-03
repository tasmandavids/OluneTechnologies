// ============================================================================
//  Gate G1 (static half) — every vertical-module entry point is guarded.
//
//  Nav filtering is presentation. The boundary that actually matters is the
//  page (don't render it) and the server action (don't let a crafted POST
//  through). This test walks the real source files so that adding a new route
//  or actions file under a gated module without a guard fails CI, rather than
//  quietly shipping an ungated surface.
//
//  The live half of G1 — a real non-dance tenant hitting these by URL and by
//  POST — is a manual gate and cannot be asserted here.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { MODULE_ROUTES } from "@/lib/verticals/modules";
import type { ModuleKey } from "@/lib/verticals/types";

const ROOT = resolve(__dirname, "..");

/**
 * Modules that are NOT in every pack. Only these need guarding — gating a
 * core module like `billing` would be gating it for everyone.
 */
const VERTICAL_MODULES: ModuleKey[] = [
  "production",
  "costumes",
  "fixtures",
  "competitions",
  "skills",
  "venues",
];

/** Any of these means the file has been consciously gated. */
const GUARD_PATTERNS = [/requireModule\s*\(/, /assertModule\s*\(/, /getEntitlementsCached\s*\(/];

function isGuarded(file: string): boolean {
  const src = readFileSync(file, "utf8");
  return GUARD_PATTERNS.some((re) => re.test(src));
}

/** page.tsx / actions.ts under a route prefix, recursively. */
function entryPoints(routePrefix: string): string[] {
  const dir = join(ROOT, "app", routePrefix.replace(/^\//, ""));
  if (!existsSync(dir)) return [];

  const found: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d)) {
      const full = join(d, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry === "page.tsx" || entry === "actions.ts") found.push(full);
    }
  };
  walk(dir);
  return found;
}

describe("vertical-module routes are guarded at the server", () => {
  const cases = VERTICAL_MODULES.flatMap((moduleKey) =>
    (MODULE_ROUTES[moduleKey] ?? []).flatMap((prefix) =>
      entryPoints(prefix).map((file) => ({ moduleKey, file })),
    ),
  );

  // Guard against the test silently passing because it found nothing to check.
  it("finds the shipped dance-only entry points", () => {
    const files = cases.map((c) => c.file.replace(`${ROOT}/`, ""));
    expect(files).toContain("app/portal/admin/events/page.tsx");
    expect(files).toContain("app/portal/admin/events/actions.ts");
    expect(files).toContain("app/portal/parent/recital/page.tsx");
    expect(files).toContain("app/portal/parent/recital/actions.ts");
  });

  it.each(cases.map((c) => [c.file.replace(`${ROOT}/`, ""), c.moduleKey, c.file] as const))(
    "%s is gated behind %s",
    (_display, _moduleKey, file) => {
      expect(isGuarded(file)).toBe(true);
    },
  );
});

describe("the production actions file has no unguarded escape hatch", () => {
  const file = join(ROOT, "app/portal/admin/events/actions.ts");
  const src = readFileSync(file, "utf8");

  it("routes every exported action through the gated helper", () => {
    // Split on the export boundary and check each action body reaches
    // getAdminStudio(), which is where the module gate lives. fetchMusicMetadata
    // previously bypassed it entirely — and had no caller check at all.
    const bodies = src.split(/^export async function /m).slice(1);
    expect(bodies.length).toBeGreaterThan(20);

    const ungated = bodies
      .filter((b) => !b.includes("getAdminStudio()"))
      .map((b) => b.slice(0, b.indexOf("(")));

    expect(ungated).toEqual([]);
  });
});
