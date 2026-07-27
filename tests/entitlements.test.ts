// ============================================================================
//  Gate G0 — the dance no-op.
//
//  The thesis of the multi-vertical work is that existing dance tenants are
//  untouched. This file is the mechanical proof, and it is a MERGE GATE.
//
//  If a test here fails, the change is wrong. Do NOT update the expectation to
//  match new output — that defeats the entire purpose of the gate.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  ADMIN_NAV,
  OFFICE_NAV,
  PORTAL_NAV,
  SELF_MANAGED_STUDENT_NAV,
  buildAdminNav,
  buildOfficeNav,
  buildPortalNav,
  buildSelfManagedStudentNav,
  flattenNav,
  type NavItem,
  type NavSection,
} from "@/lib/portal/nav-config";
import { packEntitlements, hasModule, type Entitlements } from "@/lib/portal/entitlements";
import { dancePack } from "@/lib/verticals/packs/dance";
import {
  getPack,
  allDisciplines,
  allVerticals,
  authoredVerticals,
  isAuthored,
  isSignupReady,
} from "@/lib/verticals/registry";
import onboardingMessages from "@/messages/en/onboarding.json";
import { MODULE_KEYS, moduleForPath } from "@/lib/verticals/modules";
import type { ModuleKey } from "@/lib/verticals/types";

/** A dance studio with no studio_modules rows, no flags, no overrides. */
const danceStudio: Entitlements = packEntitlements("studio-1", "dance");

function collectModules(sections: NavSection[]): ModuleKey[] {
  const out: ModuleKey[] = [];
  const walk = (items: NavItem[]) => {
    for (const item of items) {
      if (item.module) out.push(item.module);
      if (item.children) walk(item.children);
    }
  };
  for (const section of sections) walk(section.items);
  return out;
}

describe("nav parity — a stock dance studio sees exactly today's nav", () => {
  it("admin nav is unchanged", () => {
    expect(buildAdminNav(danceStudio)).toEqual(ADMIN_NAV);
  });

  it("office nav is unchanged", () => {
    expect(buildOfficeNav(danceStudio)).toEqual(OFFICE_NAV);
  });

  it.each(["teacher", "office", "parent", "student"] as const)("%s nav is unchanged", (role) => {
    expect(buildPortalNav(role, danceStudio)).toEqual(PORTAL_NAV[role]);
  });

  it("self-managed student nav is unchanged", () => {
    expect(buildSelfManagedStudentNav(danceStudio)).toEqual(SELF_MANAGED_STUDENT_NAV);
  });

  it("fails open when entitlements could not be resolved", () => {
    // A resolver error must never blank someone's sidebar.
    expect(buildAdminNav(null)).toEqual(ADMIN_NAV);
    expect(buildPortalNav("parent", null)).toEqual(PORTAL_NAV.parent);
  });
});

describe("the dance pack declares every module the nav reaches", () => {
  // This is what makes the parity tests above pass for the right reason
  // rather than by accident.
  const referenced = new Set<ModuleKey>([
    ...collectModules(ADMIN_NAV),
    ...collectModules(OFFICE_NAV),
    ...collectModules(Object.values(PORTAL_NAV).map((items) => ({ items }))),
    ...collectModules([{ items: SELF_MANAGED_STUDENT_NAV }]),
  ]);

  it.each([...referenced])("dance grants %s", (key) => {
    expect(hasModule(danceStudio, key)).toBe(true);
  });

  it("every module tag in the nav is a real ModuleKey", () => {
    for (const key of referenced) expect(MODULE_KEYS).toContain(key);
  });
});

describe("module gating actually gates", () => {
  // The REAL swim pack, not a hand-rolled stand-in — so this test fails if
  // swim ever gains production/costumes, rather than passing against a fixture
  // that can drift from the pack it is meant to represent.
  const swimStudio: Entitlements = packEntitlements("studio-2", "swim");

  it("the swim pack genuinely omits the dance-only modules", () => {
    // Guards the whole gating story: while every vertical fell back to the
    // dance pack, nothing could be gated off and Gate G1 was unprovable.
    expect(swimStudio.pack.key).toBe("swim");
    expect(hasModule(swimStudio, "production")).toBe(false);
    expect(hasModule(swimStudio, "costumes")).toBe(false);
    // …but keeps the generic core.
    expect(hasModule(swimStudio, "billing")).toBe(true);
    expect(hasModule(swimStudio, "classes")).toBe(true);
    expect(hasModule(swimStudio, "messaging")).toBe(true);
  });

  it("hides recital and costume surfaces from a pack that omits them", () => {
    const adminHrefs = buildAdminNav(swimStudio).flatMap((s) => s.items.map((i) => i.href));
    expect(adminHrefs).not.toContain("/portal/admin/events");

    const parentHrefs = buildPortalNav("parent", swimStudio).map((i) => i.href);
    expect(parentHrefs).not.toContain("/portal/parent/recital");

    // …and the rest of the parent nav survives intact.
    expect(parentHrefs).toContain("/portal/parent/billing");
    expect(parentHrefs).toContain("/portal/parent/schedule");
  });

  it("keeps ⌘K from surfacing a gated destination", () => {
    // CommandPalette flattens the same filtered nav, so a gated module must not
    // reappear as a search result.
    const hrefs = flattenNav(buildAdminNav(swimStudio)).map((i) => i.href);
    expect(hrefs).not.toContain("/portal/admin/events");
    expect(hrefs).toContain("/portal/admin/classes");
  });

  it("drops a section that loses all of its items", () => {
    const noFinance: Entitlements = {
      ...danceStudio,
      modules: new Set([...dancePack.modules].filter((m) => m !== "billing")),
    };
    const titles = buildAdminNav(noFinance).map((s) => s.titleKey);
    expect(titles).not.toContain("nav.sections.finance");
  });

  it("keeps a parent item whose children were filtered out", () => {
    const noSubs: Entitlements = {
      ...danceStudio,
      modules: new Set(
        [...dancePack.modules].filter(
          (m) => m !== "substitutes" && m !== "availability" && m !== "privateLessons",
        ),
      ),
    };
    const staff = buildAdminNav(noSubs)
      .flatMap((s) => s.items)
      .find((i) => i.href === "/portal/admin/staff");
    expect(staff).toBeDefined();
    expect(staff?.children).toEqual([]);
  });
});

describe("registry", () => {
  it("degrades to dance for a vertical with no authored pack yet", () => {
    // dance and swim are authored; the other six land in Phase 2. Note the
    // consequence: an unauthored vertical inherits dance's modules, so it is
    // NOT gated — which is exactly why swim was authored early.
    expect(getPack("gymnastics")).toBe(dancePack);
    expect(getPack("not-a-vertical")).toBe(dancePack);
    expect(getPack(null)).toBe(dancePack);
  });

  it("only offers verticals that have a pack", () => {
    expect(authoredVerticals()).toEqual(["dance", "swim"]);
  });

  it("offers all eight in the signup picker regardless of pack", () => {
    // The picker shows everything — unbuilt verticals capture a waitlist row
    // rather than being hidden, so we learn what to build next.
    expect(allVerticals()).toHaveLength(8);
    expect(allVerticals()).toContain("gymnastics");
  });

  it("isAuthored reports which packs exist", () => {
    expect(isAuthored("dance")).toBe(true);
    expect(isAuthored("swim")).toBe(true);
    expect(isAuthored("gymnastics")).toBe(false);
    expect(isAuthored("not-a-vertical")).toBe(false);
    expect(isAuthored(null)).toBe(false);
  });

  it("isSignupReady is stricter than isAuthored", () => {
    // swim has a working pack an operator can assign, but it has not been
    // through copy vocabularisation — a swim school signing up today would
    // read "dancer" throughout the portal, so signup routes it to the
    // waitlist instead. This is the gap the two predicates exist to express.
    expect(isSignupReady("dance")).toBe(true);
    expect(isSignupReady("swim")).toBe(false);
    expect(isAuthored("swim")).toBe(true);
    expect(isSignupReady("gymnastics")).toBe(false);
  });

  it("every picker option has a label to render", () => {
    // A missing key would render the raw key in the UI. next-intl resolves at
    // runtime, so assert the catalogue directly.
    const labels = onboardingMessages.onboarding.vertical.options as Record<string, string>;
    for (const key of allVerticals()) {
      expect(labels[key], `missing onboarding.vertical.options.${key}`).toBeTruthy();
    }
  });

  it("no longer tells every visitor Olune is for dance studios", () => {
    // This copy sat on the highest-intent screen in the funnel.
    expect(onboardingMessages.onboarding.system.studioOwner.title).not.toMatch(/dance/i);
  });

  it("exposes a de-duplicated cross-vertical discipline union", () => {
    const keys = allDisciplines().map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain("ballet");
  });
});

describe("module route mapping", () => {
  it("maps the dance-only routes to their gates", () => {
    expect(moduleForPath("/portal/admin/events")).toBe("production");
    expect(moduleForPath("/portal/admin/events/new")).toBe("production");
    expect(moduleForPath("/portal/parent/recital")).toBe("costumes");
  });

  it("prefers the longest matching prefix", () => {
    // /portal/admin/site and /portal/admin/site/domain both belong to `site`,
    // but a nested route must never fall through to a shorter unrelated one.
    expect(moduleForPath("/portal/admin/site/domain")).toBe("site");
    expect(moduleForPath("/portal/admin/private-lessons")).toBe("privateLessons");
  });

  it("returns null for ungated routes", () => {
    expect(moduleForPath("/portal/admin")).toBeNull();
    expect(moduleForPath("/portal/admin/settings")).toBeNull();
  });
});
