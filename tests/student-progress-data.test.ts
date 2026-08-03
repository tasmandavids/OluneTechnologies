import { describe, expect, it } from "vitest";
import { fetchStudentProgressBundle } from "@/lib/portal/student-progress-data";

type QueryResponse = {
  data?: unknown;
  error?: unknown;
};

class FakeQuery {
  constructor(
    private readonly result: QueryResponse,
    private readonly calls: string[],
  ) {}

  select(columns: string) {
    this.calls.push(`select:${columns.replace(/\s+/g, " ").trim()}`);
    return this;
  }

  eq(column: string, value: string) {
    this.calls.push(`eq:${column}:${value}`);
    return this;
  }

  order(column: string, options: { ascending: boolean }) {
    this.calls.push(`order:${column}:${options.ascending}`);
    return this;
  }

  limit(count: number) {
    this.calls.push(`limit:${count}`);
    return this;
  }

  single() {
    this.calls.push("single");
    return Promise.resolve(this.result);
  }

  then<TResult1 = QueryResponse, TResult2 = never>(
    onfulfilled?: ((value: QueryResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return Promise.resolve(this.result).then(onfulfilled, onrejected);
  }
}

function fakeSupabase(responses: Record<string, QueryResponse>) {
  const calls: string[] = [];

  return {
    calls,
    client: {
      from(table: string) {
        calls.push(`from:${table}`);
        return new FakeQuery(responses[table] ?? {}, calls);
      },
    },
  };
}

describe("fetchStudentProgressBundle", () => {
  it("aggregates active classes, progress entries, attendance and certificates", async () => {
    const { client, calls } = fakeSupabase({
      profiles: {
        data: {
          id: "student-1",
          full_name: "Ari Taylor",
          enrollments: [
            {
              status: "active",
              classes: { id: "class-1", name: "Jazz Juniors", level: "Beginner" },
            },
            {
              status: "waitlist",
              classes: { id: "class-2", name: "Tap Juniors", level: null },
            },
            {
              status: "active",
              classes: null,
            },
          ],
        },
      },
      student_progress: {
        data: [
          {
            id: "progress-1",
            notes: "Strong posture",
            level: "Intermediate",
            certifications: ["Bronze Jazz", "Bronze Jazz"],
            logged_at: "2026-06-20T10:00:00.000Z",
            instructor: { full_name: "Riley Coach" },
          },
          {
            id: "progress-2",
            notes: null,
            level: null,
            certifications: ["Stage Ready"],
            logged_at: "2026-06-10T10:00:00.000Z",
            instructor: null,
          },
          {
            id: "progress-3",
            notes: "No certificate yet",
            level: "Beginner",
            certifications: null,
            logged_at: "2026-06-01T10:00:00.000Z",
            instructor: { full_name: null },
          },
        ],
      },
      attendance: {
        data: [
          {
            id: "attendance-1",
            date: "2026-06-18",
            status: "present",
            classes: { name: "Jazz Juniors" },
          },
          {
            id: "attendance-2",
            date: "2026-06-11",
            status: "absent",
            classes: null,
          },
        ],
      },
    });

    const bundle = await fetchStudentProgressBundle(client as never, "student-1", 12);

    expect(bundle).toEqual({
      studentId: "student-1",
      studentName: "Ari Taylor",
      classes: [{ id: "class-1", name: "Jazz Juniors", level: "Beginner" }],
      entries: [
        {
          id: "progress-1",
          notes: "Strong posture",
          level: "Intermediate",
          certifications: ["Bronze Jazz", "Bronze Jazz"],
          loggedAt: "2026-06-20T10:00:00.000Z",
          instructorName: "Riley Coach",
        },
        {
          id: "progress-2",
          notes: null,
          level: null,
          certifications: ["Stage Ready"],
          loggedAt: "2026-06-10T10:00:00.000Z",
          instructorName: null,
        },
        {
          id: "progress-3",
          notes: "No certificate yet",
          level: "Beginner",
          certifications: [],
          loggedAt: "2026-06-01T10:00:00.000Z",
          instructorName: null,
        },
      ],
      attendance: [
        {
          id: "attendance-1",
          date: "2026-06-18",
          status: "present",
          className: "Jazz Juniors",
        },
      ],
      certificates: [
        {
          title: "Bronze Jazz",
          progressId: "progress-1",
          awardedAt: "2026-06-20T10:00:00.000Z",
          instructorName: "Riley Coach",
        },
        {
          title: "Stage Ready",
          progressId: "progress-2",
          awardedAt: "2026-06-10T10:00:00.000Z",
          instructorName: null,
        },
      ],
      latestLevel: "Intermediate",
    });
    expect(calls).toContain("eq:id:student-1");
    expect(calls.filter((call) => call === "eq:student_id:student-1")).toHaveLength(2);
    expect(calls).toContain("order:logged_at:false");
    expect(calls).toContain("order:date:false");
    expect(calls).toContain("limit:12");
  });

  it("returns null when the student lookup fails", async () => {
    const { client } = fakeSupabase({
      profiles: { data: null, error: { message: "not found" } },
      student_progress: { data: [] },
      attendance: { data: [] },
    });

    await expect(fetchStudentProgressBundle(client as never, "missing-student")).resolves.toBeNull();
  });
});
