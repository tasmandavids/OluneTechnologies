import { describe, it, expect } from "vitest";
import {
  mapMembershipRow,
  roleForStudio,
  primaryMembership,
  affiliatedStudios,
  portalHomeForAccount,
  showAffiliationsNav,
  type MembershipRow,
} from "@/lib/account/memberships";
import type { StudioMembership } from "@/lib/account/memberships";

const sampleRow: MembershipRow = {
  id: "m1",
  studio_id: "s1",
  role: "teacher",
  status: "active",
  is_primary: true,
  linked_via: "invite",
  linked_at: "2026-01-01T00:00:00Z",
  studios: { name: "Sunrise Dance", slug: "sunrise", kind: "studio" },
};

describe("mapMembershipRow", () => {
  it("maps snake_case DB row to app shape", () => {
    const m = mapMembershipRow(sampleRow);
    expect(m.studioName).toBe("Sunrise Dance");
    expect(m.studioSlug).toBe("sunrise");
    expect(m.isPrimary).toBe(true);
  });
});

describe("roleForStudio", () => {
  const memberships: StudioMembership[] = [
    mapMembershipRow(sampleRow),
    mapMembershipRow({
      ...sampleRow,
      id: "m2",
      studio_id: "s2",
      role: "parent",
      is_primary: false,
      studios: { name: "Other", slug: "other", kind: "studio" },
    }),
  ];

  it("returns membership role for known studio", () => {
    expect(roleForStudio(memberships, "s2", "teacher")).toBe("parent");
  });

  it("falls back when studio not found", () => {
    expect(roleForStudio(memberships, "missing", "teacher")).toBe("teacher");
  });
});

describe("primaryMembership", () => {
  it("returns primary row", () => {
    const m = primaryMembership([
      mapMembershipRow({ ...sampleRow, is_primary: false }),
      mapMembershipRow(sampleRow),
    ]);
    expect(m?.isPrimary).toBe(true);
  });
});

describe("affiliatedStudios", () => {
  it("excludes instructor home workspace", () => {
    const list = affiliatedStudios([
      mapMembershipRow(sampleRow),
      mapMembershipRow({
        ...sampleRow,
        id: "home",
        studio_id: "home-id",
        is_primary: true,
        studios: { name: "Jane Smith", slug: "jane", kind: "instructor" },
      }),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].studioName).toBe("Sunrise Dance");
  });
});

describe("portalHomeForAccount", () => {
  it("routes instructors to teacher portal", () => {
    expect(portalHomeForAccount("instructor", "teacher")).toBe("/portal/teacher");
  });

  it("routes studio owners by role", () => {
    expect(portalHomeForAccount("studio_owner", "admin")).toBe("/portal/admin");
  });

  it("routes an instructor who is a parent at the active studio to the parent portal", () => {
    expect(portalHomeForAccount("instructor", "parent")).toBe("/portal/parent");
  });
});

describe("showAffiliationsNav", () => {
  it("shows for instructors", () => {
    expect(showAffiliationsNav("instructor", 1)).toBe(true);
  });

  it("shows for multi-membership teachers", () => {
    expect(showAffiliationsNav(null, 2)).toBe(true);
  });

  it("hides for single-studio non-instructors", () => {
    expect(showAffiliationsNav(null, 1)).toBe(false);
  });
});
