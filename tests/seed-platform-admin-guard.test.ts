// ============================================================================
//  scripts/seed-platform-admin.mjs creates a cross-tenant superuser — a
//  platform_operators row with permissions ["*"], which reads every studio's
//  data.
//
//  It used to run from CI on every merge to main, against the linked production
//  project, with the password hardcoded in the script and published in
//  TEST_ACCOUNTS.md, resetting that password on each run. The guard under test
//  is what stops that shape from coming back: the CI refusal in particular
//  means re-adding a `run:` step to a workflow fails loudly instead of silently
//  reprovisioning the account.
//
//  These are the conditions, not the wording. If a refusal here starts passing,
//  the exposure is open again.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  seedRefusal,
  MIN_PASSWORD_LENGTH,
  BURNED_PASSWORDS,
} from "../scripts/seed-platform-admin.mjs";

/** A caller who has done everything right. */
const VALID = {
  ALLOW_PLATFORM_ADMIN_SEED: "1",
  PLATFORM_ADMIN_PASSWORD: "x".repeat(MIN_PASSWORD_LENGTH),
};

describe("seed-platform-admin guard", () => {
  it("permits a local run that opts in with a strong password", () => {
    expect(seedRefusal({ ...VALID })).toBeNull();
  });

  it("refuses to run from CI even when everything else is satisfied", () => {
    // The single most important case: GitHub Actions sets CI=true, so a step
    // re-added to a workflow cannot reprovision the account.
    expect(seedRefusal({ ...VALID, CI: "true" })).toMatch(/CI/);
  });

  it("refuses without an explicit opt-in", () => {
    const { ALLOW_PLATFORM_ADMIN_SEED: _omitted, ...rest } = VALID;
    expect(seedRefusal(rest)).toMatch(/ALLOW_PLATFORM_ADMIN_SEED/);
  });

  it("does not treat any other opt-in value as consent", () => {
    for (const value of ["0", "true", "yes", "", "01"]) {
      expect(
        seedRefusal({ ...VALID, ALLOW_PLATFORM_ADMIN_SEED: value }),
        `ALLOW_PLATFORM_ADMIN_SEED=${JSON.stringify(value)} should not opt in`,
      ).toMatch(/ALLOW_PLATFORM_ADMIN_SEED/);
    }
  });

  it("has no default password", () => {
    const { PLATFORM_ADMIN_PASSWORD: _omitted, ...rest } = VALID;
    expect(seedRefusal(rest)).toMatch(/PLATFORM_ADMIN_PASSWORD/);
  });

  it("refuses a password shorter than the minimum", () => {
    const short = "x".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(seedRefusal({ ...VALID, PLATFORM_ADMIN_PASSWORD: short })).toMatch(
      new RegExp(String(MIN_PASSWORD_LENGTH)),
    );
  });

  it("names the burned password as burned, rather than merely too short", () => {
    // Every burned value is also under the length minimum, so if the length
    // check runs first this branch is unreachable and whoever retries the old
    // password is told to pick a longer one — advice that leads them straight
    // back to it. Assert the specific message, not just that it refused.
    for (const burned of BURNED_PASSWORDS) {
      expect(burned.length).toBeLessThan(MIN_PASSWORD_LENGTH);

      for (const cased of [burned, burned.toUpperCase()]) {
        expect(
          seedRefusal({ ...VALID, PLATFORM_ADMIN_PASSWORD: cased }),
          `${cased} should be refused as burned`,
        ).toMatch(/burned/i);
      }
    }
  });

  it("still carries testadmin123, the credential that was published", () => {
    expect(BURNED_PASSWORDS.has("testadmin123")).toBe(true);
  });

  it("requires a password long enough not to be worth guessing", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(16);
  });
});
