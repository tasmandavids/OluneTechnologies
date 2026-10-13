import { describe, expect, it } from "vitest";
import { canAccessPortalPath } from "@/lib/portal/office-access";

describe("canAccessPortalPath for students (audit F2a-02)", () => {
  it("lets students open the billing and forms pages their nav links to", () => {
    expect(canAccessPortalPath("student", "/portal/parent/billing")).toBe(true);
    expect(canAccessPortalPath("student", "/portal/parent/forms")).toBe(true);
    expect(canAccessPortalPath("student", "/portal/student/progress")).toBe(true);
  });

  it("keeps students out of the rest of the parent and admin portals", () => {
    expect(canAccessPortalPath("student", "/portal/parent/chat")).toBe(false);
    expect(canAccessPortalPath("student", "/portal/parent/billing-evil")).toBe(false);
    expect(canAccessPortalPath("student", "/portal/admin")).toBe(false);
  });
});
