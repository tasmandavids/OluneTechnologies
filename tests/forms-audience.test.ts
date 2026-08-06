// ============================================================================
//  Form audience resolution.
//
//  The bug this guards against: the admin's "17 of 24 signed" and the family's
//  list of forms are computed from the same audience, so if the two disagree a
//  studio chases signatures on forms nobody can see. Both sides call
//  audienceCoversSubject, and these cases pin down what it means.
// ============================================================================

import { describe, it, expect } from "vitest";
import { audienceCoversSubject, type AudienceSubject } from "@/lib/forms/audience";
import { canAccessPortalPath } from "@/lib/portal/office-access";
import { fieldKeyFromLabel, parseFormFields } from "@/lib/forms/types";
import type { FormAudienceTarget } from "@/lib/forms/types";
import type { Role } from "@/lib/types";

function subject(partial: Partial<AudienceSubject> & { role: AudienceSubject["role"] }): AudienceSubject {
  return {
    profileId: partial.profileId ?? "subject-1",
    role: partial.role,
    classIds: partial.classIds ?? new Set<string>(),
  };
}

const student = subject({ profileId: "student-1", role: "student" });
const teacher = subject({ profileId: "teacher-1", role: "teacher" });
const parent = subject({ profileId: "parent-1", role: "parent" });

describe("audienceCoversSubject", () => {
  it("treats an empty audience as reaching nobody", () => {
    expect(audienceCoversSubject([], student, "student")).toBe(false);
    expect(audienceCoversSubject([], teacher, "person")).toBe(false);
  });

  describe('"everyone"', () => {
    const everyone: FormAudienceTarget[] = [{ kind: "all" }];

    it("is students only on a student-scope form", () => {
      expect(audienceCoversSubject(everyone, student, "student")).toBe(true);
      expect(audienceCoversSubject(everyone, teacher, "student")).toBe(false);
      expect(audienceCoversSubject(everyone, parent, "student")).toBe(false);
    });

    it("is every member on a person-scope form", () => {
      expect(audienceCoversSubject(everyone, student, "person")).toBe(true);
      expect(audienceCoversSubject(everyone, teacher, "person")).toBe(true);
      expect(audienceCoversSubject(everyone, parent, "person")).toBe(true);
    });
  });

  describe("role targets", () => {
    it("matches only the named role", () => {
      const staffPolicy: FormAudienceTarget[] = [{ kind: "role", role: "teacher" }];
      expect(audienceCoversSubject(staffPolicy, teacher, "person")).toBe(true);
      expect(audienceCoversSubject(staffPolicy, student, "person")).toBe(false);
      expect(audienceCoversSubject(staffPolicy, parent, "person")).toBe(false);
    });

    it("does not widen with the scope toggle", () => {
      const studentsOnly: FormAudienceTarget[] = [{ kind: "role", role: "student" }];
      expect(audienceCoversSubject(studentsOnly, student, "person")).toBe(true);
      expect(audienceCoversSubject(studentsOnly, teacher, "person")).toBe(false);
    });
  });

  describe("class targets", () => {
    const balletA: FormAudienceTarget[] = [{ kind: "class", classId: "class-ballet-a" }];

    it("covers the enrolled dancer and not their sibling", () => {
      const enrolled = subject({ profileId: "kid-a", role: "student", classIds: new Set(["class-ballet-a"]) });
      const sibling = subject({ profileId: "kid-b", role: "student", classIds: new Set(["class-jazz"]) });
      expect(audienceCoversSubject(balletA, enrolled, "student")).toBe(true);
      expect(audienceCoversSubject(balletA, sibling, "student")).toBe(false);
    });
  });

  describe("individual targets", () => {
    it("matches on profile id, not role", () => {
      const named: FormAudienceTarget[] = [{ kind: "person", profileId: "teacher-1" }];
      expect(audienceCoversSubject(named, teacher, "person")).toBe(true);
      expect(audienceCoversSubject(named, student, "person")).toBe(false);
    });
  });

  it("ORs its targets together", () => {
    const mixed: FormAudienceTarget[] = [
      { kind: "role", role: "teacher" },
      { kind: "class", classId: "class-ballet-a" },
      { kind: "person", profileId: "parent-1" },
    ];
    const enrolled = subject({ profileId: "kid-a", role: "student", classIds: new Set(["class-ballet-a"]) });
    expect(audienceCoversSubject(mixed, teacher, "student")).toBe(true);
    expect(audienceCoversSubject(mixed, enrolled, "student")).toBe(true);
    expect(audienceCoversSubject(mixed, parent, "student")).toBe(true);
    expect(audienceCoversSubject(mixed, student, "student")).toBe(false);
  });
});

describe("/portal/forms is reachable by every role", () => {
  // Without this, middleware bounces each role back to its own prefix and the
  // signing screen is unreachable for everyone it was built for.
  const roles: Role[] = ["admin", "office", "teacher", "parent", "student"];

  it.each(roles)("lets %s through", (role) => {
    expect(canAccessPortalPath(role, "/portal/forms")).toBe(true);
  });

  it("still keeps roles out of each other's portals", () => {
    expect(canAccessPortalPath("teacher", "/portal/admin/forms")).toBe(false);
    expect(canAccessPortalPath("parent", "/portal/teacher")).toBe(false);
    expect(canAccessPortalPath("student", "/portal/admin")).toBe(false);
  });
});

describe("parseFormFields", () => {
  it("drops entries that could not be rendered", () => {
    const parsed = parseFormFields([
      { key: "ok", label: "Allergies", type: "textarea", required: true },
      { key: "no_label", type: "text" },
      { label: "no key", type: "text" },
      "nonsense",
      null,
    ]);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ key: "ok", type: "textarea", required: true });
  });

  it("falls back to text for an unknown field type", () => {
    expect(parseFormFields([{ key: "k", label: "L", type: "wysiwyg" }])[0].type).toBe("text");
  });

  it("returns an empty list for a non-array column", () => {
    expect(parseFormFields(null)).toEqual([]);
    expect(parseFormFields({ key: "k" })).toEqual([]);
  });
});

describe("fieldKeyFromLabel", () => {
  it("slugifies and de-duplicates", () => {
    const taken = new Set<string>();
    const first = fieldKeyFromLabel("Emergency contact", taken);
    taken.add(first);
    expect(first).toBe("emergency_contact");
    expect(fieldKeyFromLabel("Emergency contact!", taken)).toBe("emergency_contact_2");
  });

  it("never returns an empty key", () => {
    expect(fieldKeyFromLabel("???", new Set())).toBe("field");
  });
});
