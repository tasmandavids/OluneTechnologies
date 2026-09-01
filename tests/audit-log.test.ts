// ============================================================================
//  The tenant audit trail's write path (SOC2-02).
//
//  Two properties are load-bearing and neither is obvious from reading the
//  call sites:
//
//   1. logAuditEvent never throws. It is called after the action it records has
//      already succeeded, so a throw would turn "student deleted, log failed"
//      into "delete failed" for an admin who would then delete again.
//   2. A failed write is still reported somewhere. Swallowing an audit failure
//      *silently* produces the one thing an examination probes for — an action
//      with no record — so the failure seam has to stay wired.
//
//  The row-shape test is the boring one that matters most: audit_events (0126)
//  grants insert to service_role alone, so a column rename here fails at
//  runtime in production and nowhere else.
// ============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const insert = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ insert }) }),
}));

const { logAuditEvent, setAuditFailureHandler, toAuditRow } = await import("@/lib/audit/log");
const { AUDIT_ACTION_KEYS, auditSeverity, highSeverityActions } = await import(
  "@/lib/audit/events"
);

beforeEach(() => {
  insert.mockReset();
  insert.mockResolvedValue({ error: null });
});

afterEach(() => {
  setAuditFailureHandler((entry, error) => {
    console.error(`[audit] failed to record ${entry.action}`, error);
  });
});

describe("logAuditEvent", () => {
  it("writes the columns 0126 declares", () => {
    const row = toAuditRow({
      studioId: "studio-1",
      actorId: "actor-1",
      actorEmail: "admin@example.test",
      actorRole: "admin",
      action: "student.deleted",
      targetType: "profile",
      targetId: "student-1",
      metadata: { fullName: "A Student" },
    });

    expect(row).toEqual({
      studio_id: "studio-1",
      actor_id: "actor-1",
      actor_email: "admin@example.test",
      actor_role: "admin",
      action: "student.deleted",
      target_type: "profile",
      target_id: "student-1",
      metadata: { fullName: "A Student" },
    });
  });

  it("defaults the optional columns rather than writing undefined", () => {
    // undefined serialises to missing, not null, and a NOT NULL metadata column
    // rejects the row — so the defaults here are what keep a minimal entry valid.
    const row = toAuditRow({
      studioId: null,
      actorId: null,
      action: "data.exported",
    });

    expect(row.metadata).toEqual({});
    expect(row.actor_email).toBeNull();
    expect(row.actor_role).toBeNull();
    expect(row.target_type).toBeNull();
    expect(row.target_id).toBeNull();
  });

  it("records the entry", async () => {
    await logAuditEvent({
      studioId: "studio-1",
      actorId: "actor-1",
      action: "member.role_changed",
    });

    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert.mock.calls[0]?.[0]).toMatchObject({
      action: "member.role_changed",
      studio_id: "studio-1",
    });
  });

  it("does not throw when the insert returns an error", async () => {
    const failures: string[] = [];
    setAuditFailureHandler((entry) => failures.push(entry.action));
    insert.mockResolvedValue({ error: { message: "permission denied" } });

    await expect(
      logAuditEvent({ studioId: "s", actorId: "a", action: "student.deleted" }),
    ).resolves.toBeUndefined();

    expect(failures).toEqual(["student.deleted"]);
  });

  it("does not throw when the client cannot be built at all", async () => {
    // The everyday case: SUPABASE_SERVICE_ROLE_KEY unset in local dev and in
    // preview builds without secrets.
    const failures: string[] = [];
    setAuditFailureHandler((entry) => failures.push(entry.action));
    insert.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
    });

    await expect(
      logAuditEvent({ studioId: "s", actorId: "a", action: "parent.deleted" }),
    ).resolves.toBeUndefined();

    expect(failures).toEqual(["parent.deleted"]);
  });
});

describe("audit action catalogue", () => {
  it("names every action <subject>.<past tense>", () => {
    for (const action of AUDIT_ACTION_KEYS) {
      expect(action, `${action} should be dotted`).toMatch(/^[a-z]+\.[a-z_]+$/);
    }
  });

  it("classifies the actions an auditor scans first as high severity", () => {
    // Permission moves, erasures, money, and bulk reads of personal data. If a
    // future edit downgrades one of these, the log still records it but stops
    // surfacing it, which is the failure that looks like success.
    const high = highSeverityActions();
    for (const action of [
      "member.role_changed",
      "member.removed",
      "student.deleted",
      "student.bulk_deleted",
      "parent.deleted",
      "data.exported",
      "payment.refunded",
      "invoice.voided",
      "integration.connected",
    ] as const) {
      expect(high, `${action} should be high severity`).toContain(action);
    }
  });

  it("gives every catalogued action a severity", () => {
    for (const action of AUDIT_ACTION_KEYS) {
      expect(["notable", "high"]).toContain(auditSeverity(action));
    }
  });
});
