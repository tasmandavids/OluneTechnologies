import { describe, it, expect } from "vitest";
import {
  studentHasActiveEnrollmentInProgrammeGroup,
  enrollmentBillableCents,
  batchEnrollmentBillableCents,
} from "@/lib/enrollment-billing";
import { makeSupabaseMock } from "./helpers/supabaseMock";

const enrollments = (rows: { id: string; classes: { id: string; recurring_group_id: string | null } }[]) => ({
  list: { data: rows },
});

const classRow = (recurringGroupId: string | null) => ({
  single: { data: { recurring_group_id: recurringGroupId } },
});

describe("studentHasActiveEnrollmentInProgrammeGroup", () => {
  it("returns false with no enrollments", async () => {
    const supabase = makeSupabaseMock({ enrollments: enrollments([]) });
    const r = await studentHasActiveEnrollmentInProgrammeGroup(supabase, "s1", "group-1");
    expect(r).toBe(false);
  });

  it("returns true when another day of the same linked series is active", async () => {
    const supabase = makeSupabaseMock({
      enrollments: enrollments([
        { id: "e1", classes: { id: "c-mon", recurring_group_id: "group-1" } },
      ]),
    });
    const r = await studentHasActiveEnrollmentInProgrammeGroup(supabase, "s1", "group-1");
    expect(r).toBe(true);
  });

  it("returns false for a different group id", async () => {
    const supabase = makeSupabaseMock({
      enrollments: enrollments([
        { id: "e1", classes: { id: "c-mon", recurring_group_id: "group-2" } },
      ]),
    });
    const r = await studentHasActiveEnrollmentInProgrammeGroup(supabase, "s1", "group-1");
    expect(r).toBe(false);
  });

  it("can exclude a class row from the match", async () => {
    const supabase = makeSupabaseMock({
      enrollments: enrollments([
        { id: "e1", classes: { id: "c-mon", recurring_group_id: "group-1" } },
      ]),
    });
    const r = await studentHasActiveEnrollmentInProgrammeGroup(supabase, "s1", "group-1", {
      excludeClassIds: ["c-mon"],
    });
    expect(r).toBe(false);
  });
});

describe("enrollmentBillableCents", () => {
  it("returns 0 for free classes", async () => {
    const supabase = makeSupabaseMock({ classes: classRow(null), enrollments: enrollments([]) });
    expect(await enrollmentBillableCents(supabase, "s1", "c1", 0)).toBe(0);
  });

  it("returns full price for a standalone class (no recurring_group_id)", async () => {
    const supabase = makeSupabaseMock({ classes: classRow(null), enrollments: enrollments([]) });
    expect(await enrollmentBillableCents(supabase, "s1", "c1", 12000)).toBe(12000);
  });

  it("bills a standalone class in full even if another active class shares its name — no name matching", async () => {
    // Regression test: two separately-created classes that happen to share a
    // label (e.g. both named "Intermediate") but were never linked via
    // recurring_group_id must each bill in full.
    const supabase = makeSupabaseMock({
      classes: classRow(null),
      enrollments: enrollments([
        { id: "e1", classes: { id: "c-other", recurring_group_id: null } },
      ]),
    });
    expect(await enrollmentBillableCents(supabase, "s1", "c1", 12000)).toBe(12000);
  });

  it("returns full price for the first day of a linked recurring series", async () => {
    const supabase = makeSupabaseMock({ classes: classRow("group-1"), enrollments: enrollments([]) });
    expect(await enrollmentBillableCents(supabase, "s1", "c1", 12000)).toBe(12000);
  });

  it("returns 0 for a second day already covered by the same linked series", async () => {
    const supabase = makeSupabaseMock({
      classes: classRow("group-1"),
      enrollments: enrollments([
        { id: "e1", classes: { id: "c-mon", recurring_group_id: "group-1" } },
      ]),
    });
    expect(await enrollmentBillableCents(supabase, "s1", "c-wed", 12000)).toBe(0);
  });
});

describe("batchEnrollmentBillableCents", () => {
  const classesList = (rows: { id: string; recurring_group_id: string | null }[]) => ({
    list: { data: rows },
  });

  it("bills only the first class of a linked series enrolled together in one batch, not zero and not both", async () => {
    // Regression test: EnrollModal's enrollAll() inserts every selected
    // class's `enrollments` row as active *before* billing runs, so by the
    // time charges are computed both series days are already active. A
    // naive per-class check (excluding only itself) finds the other day
    // active and zeroes both out. Batch billing must exclude all classes in
    // this batch from that check and bill exactly one representative.
    const supabase = makeSupabaseMock({
      classes: classesList([
        { id: "c-mon", recurring_group_id: "group-1" },
        { id: "c-wed", recurring_group_id: "group-1" },
      ]),
      // Both enrollments already active — inserted by enrollAll() before billing.
      enrollments: enrollments([
        { id: "e1", classes: { id: "c-mon", recurring_group_id: "group-1" } },
        { id: "e2", classes: { id: "c-wed", recurring_group_id: "group-1" } },
      ]),
    });

    const result = await batchEnrollmentBillableCents(supabase, "s1", [
      { classId: "c-mon", priceCents: 44500 },
      { classId: "c-wed", priceCents: 44500 },
    ]);

    expect(result.get("c-mon")).toBe(44500);
    expect(result.get("c-wed")).toBe(0);
  });

  it("bills a standalone class in the same batch independently of the series", async () => {
    const supabase = makeSupabaseMock({
      classes: classesList([
        { id: "c-mon", recurring_group_id: "group-1" },
        { id: "c-wed", recurring_group_id: "group-1" },
        { id: "c-adult", recurring_group_id: null },
      ]),
      enrollments: enrollments([
        { id: "e1", classes: { id: "c-mon", recurring_group_id: "group-1" } },
        { id: "e2", classes: { id: "c-wed", recurring_group_id: "group-1" } },
        { id: "e3", classes: { id: "c-adult", recurring_group_id: null } },
      ]),
    });

    const result = await batchEnrollmentBillableCents(supabase, "s1", [
      { classId: "c-mon", priceCents: 44500 },
      { classId: "c-wed", priceCents: 44500 },
      { classId: "c-adult", priceCents: 22000 },
    ]);

    expect(result.get("c-mon")).toBe(44500);
    expect(result.get("c-wed")).toBe(0);
    expect(result.get("c-adult")).toBe(22000);
  });

  it("bills 0 for every class in a series already fully covered by a prior, external enrollment", async () => {
    const supabase = makeSupabaseMock({
      classes: classesList([{ id: "c-wed", recurring_group_id: "group-1" }]),
      // c-mon is active from a prior, separate session — not part of this batch.
      enrollments: enrollments([
        { id: "e1", classes: { id: "c-mon", recurring_group_id: "group-1" } },
      ]),
    });

    const result = await batchEnrollmentBillableCents(supabase, "s1", [
      { classId: "c-wed", priceCents: 44500 },
    ]);

    expect(result.get("c-wed")).toBe(0);
  });
});
