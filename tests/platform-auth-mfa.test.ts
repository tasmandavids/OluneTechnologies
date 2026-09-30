import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const getAuthenticatorAssuranceLevel = vi.fn();
const operatorRow = vi.fn();
const adminOperatorRow = vi.fn();

function chain(maybeSingle: typeof operatorRow) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle,
  };
  return query;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser,
      mfa: { getAuthenticatorAssuranceLevel },
    },
    from: () => chain(operatorRow),
  }),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => chain(adminOperatorRow) }),
}));

const { requirePlatformOperator } = await import("@/lib/platform/auth");

beforeEach(() => {
  process.env.PLATFORM_OPERATOR_EMAILS = "operator@olune.test";
  getUser.mockReset();
  getAuthenticatorAssuranceLevel.mockReset();
  operatorRow.mockReset();
  adminOperatorRow.mockReset();
  operatorRow.mockResolvedValue({ data: { full_name: "Operator" }, error: null });
  adminOperatorRow.mockResolvedValue({ data: null, error: null });
});

afterEach(() => {
  delete process.env.PLATFORM_OPERATOR_EMAILS;
});

describe("platform operator MFA guard", () => {
  it("rejects signed-out requests before checking MFA", async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    await expect(requirePlatformOperator()).resolves.toMatchObject({
      ok: false,
      reason: "signed_out",
    });
    expect(getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
  });

  it("does not let the email allowlist bypass MFA", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "operator-1",
          email: "operator@olune.test",
          user_metadata: {},
        },
      },
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    await expect(requirePlatformOperator()).resolves.toMatchObject({
      ok: false,
      reason: "mfa_required",
    });
  });

  it("allows the layout to render enrollment while mutations remain locked", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "operator-1",
          email: "operator@olune.test",
          user_metadata: {},
        },
      },
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });

    await expect(
      requirePlatformOperator({ requireMfa: false }),
    ).resolves.toMatchObject({
      ok: true,
      userId: "operator-1",
      assuranceLevel: "aal1",
    });
    await expect(requirePlatformOperator()).resolves.toMatchObject({
      ok: false,
      reason: "mfa_required",
    });
  });

  it("grants platform access only after the session reaches AAL2", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "operator-1",
          email: "operator@olune.test",
          user_metadata: {},
        },
      },
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    await expect(requirePlatformOperator()).resolves.toMatchObject({
      ok: true,
      userId: "operator-1",
      assuranceLevel: "aal2",
    });
  });

  it("fails closed when assurance cannot be verified", async () => {
    getUser.mockResolvedValue({
      data: {
        user: {
          id: "operator-1",
          email: "operator@olune.test",
          user_metadata: {},
        },
      },
    });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: null,
      error: new Error("auth unavailable"),
    });

    await expect(requirePlatformOperator()).resolves.toMatchObject({
      ok: false,
      reason: "auth_error",
    });
  });
});
