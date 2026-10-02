// ============================================================================
//  Parent server actions must report failure, not swallow it.
//
//  reportAbsence, markNotificationRead, markAllNotificationsRead and
//  updateCostumeSize used to `throw new Error(...)` on a bad session and
//  `throw error` on a failed write. Two problems with that:
//
//    • Next.js sanitises an error thrown out of a server action in
//      production — the client receives a digest, never the message — so the
//      text could not reach the parent even in principle;
//    • none of the four call sites had a catch, and three of them ran their
//      "success" cleanup (close the modal, clear the field) unconditionally,
//      so a rejected write looked exactly like a saved one.
//
//  They return a result now. These tests pin that contract: a failing write
//  yields { ok: false } with a message, and never a thrown exception.
// ============================================================================

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@/lib/i18n/server", () => ({ getTranslations: async () => (key: string) => key }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/observability/report", () => ({ reportHandledError: mocks.report }));
vi.mock("@/lib/portal/require-module", () => ({ assertModule: async () => undefined }));

import { reportAbsence } from "@/app/portal/parent/absences/actions";
import { markNotificationRead, markAllNotificationsRead } from "@/app/portal/parent/notifications/actions";
import { updateCostumeSize } from "@/app/portal/parent/recital/actions";

const USER = { data: { user: { id: "user-1" } } };
const ABSENCE = { studentId: "s1", classId: "c1", absenceDate: "2026-03-01", reason: "sick", notes: "" };

/**
 * A `from()` chain whose terminal resolves to `{ error }`.
 *
 * Supabase's builder is awaitable at every link, and these actions stop at
 * different depths — `update().eq()` for a costume, `update().eq().eq()` for a
 * notification, `update().eq().is()` for the mark-all sweep. So each link is
 * both chainable and thenable rather than a fixed depth.
 */
function chain(error: unknown) {
  const terminal = { error };
  const link: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(terminal).then(resolve),
  };
  for (const m of ["select", "eq", "is", "update", "order", "limit"]) {
    link[m] = vi.fn(() => link);
  }
  link.insert = vi.fn(() => link);
  // the studio lookup is the one call that must return a row, not an error
  link.single = vi.fn(async () => ({ data: { studio_id: "studio-1" }, error: null }));
  return link;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue(USER);
  mocks.report.mockResolvedValue(undefined);
});

describe("parent actions surface a failed session instead of throwing", () => {
  beforeEach(() => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    mocks.from.mockImplementation(() => chain(null));
  });

  it("reportAbsence returns a result", async () => {
    await expect(reportAbsence(ABSENCE)).resolves.toEqual({ ok: false, error: "notSignedIn" });
  });
  it("markNotificationRead returns a result", async () => {
    await expect(markNotificationRead("n1")).resolves.toEqual({ ok: false, error: "notSignedIn" });
  });
  it("markAllNotificationsRead returns a result", async () => {
    await expect(markAllNotificationsRead()).resolves.toEqual({ ok: false, error: "notSignedIn" });
  });
  it("updateCostumeSize returns a result", async () => {
    await expect(updateCostumeSize("c1", "M", "")).resolves.toEqual({ ok: false, error: "notSignedIn" });
  });
});

describe("parent actions surface a failed write instead of swallowing it", () => {
  const dbError = { message: 'duplicate key value violates unique constraint "student_absences_pkey"' };

  it("reportAbsence reports to Sentry and returns a safe message", async () => {
    mocks.from.mockImplementation(() => chain(dbError));
    const res = await reportAbsence(ABSENCE);
    expect(res).toEqual({ ok: false, error: "couldNotSaveAbsence" });
    // the raw PostgrestError must not travel to the client …
    expect(JSON.stringify(res)).not.toContain("student_absences_pkey");
    // … but it must reach Sentry
    expect(mocks.report).toHaveBeenCalledTimes(1);
    expect(mocks.report.mock.calls[0][0]).toBe(dbError);
    expect(mocks.report.mock.calls[0][1]).toMatchObject({ route: "parent.absences.report" });
  });

  it("markNotificationRead no longer discards the update error", async () => {
    mocks.from.mockImplementation(() => chain(dbError));
    const res = await markNotificationRead("n1");
    expect(res).toEqual({ ok: false, error: "couldNotMarkRead" });
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it("updateCostumeSize reports and returns a safe message", async () => {
    mocks.from.mockImplementation(() => chain(dbError));
    const res = await updateCostumeSize("c1", "M", "");
    expect(res).toEqual({ ok: false, error: "couldNotSaveCostumeSize" });
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });
});

describe("parent actions report success on a clean write", () => {
  beforeEach(() => mocks.from.mockImplementation(() => chain(null)));

  it("reportAbsence", async () => {
    await expect(reportAbsence(ABSENCE)).resolves.toEqual({ ok: true });
    expect(mocks.report).not.toHaveBeenCalled();
  });
  it("markNotificationRead", async () => {
    await expect(markNotificationRead("n1")).resolves.toEqual({ ok: true });
  });
  it("markAllNotificationsRead", async () => {
    await expect(markAllNotificationsRead()).resolves.toEqual({ ok: true });
  });
  it("updateCostumeSize", async () => {
    await expect(updateCostumeSize("c1", "M", "")).resolves.toEqual({ ok: true });
  });
});
