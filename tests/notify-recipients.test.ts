import { describe, expect, it } from "vitest";
import { recipientsForStudents } from "@/lib/notify/recipients";

describe("recipientsForStudents (audit E-04)", () => {
  it("sends a child's notifications to their guardians", () => {
    const m = recipientsForStudents(["kid", "adult"], [
      { student_id: "kid", guardian_id: "mum" },
      { student_id: "kid", guardian_id: "dad" },
    ]);
    expect(m.get("kid")).toEqual(["mum", "dad"]);
    expect(m.get("adult")).toEqual(["adult"]);
  });
});
