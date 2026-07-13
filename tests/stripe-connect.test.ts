import { describe, expect, it } from "vitest";
import { isChargeable, type StripeConnectAccountRow } from "@/lib/stripe/connect";

function accountRow(overrides: Partial<StripeConnectAccountRow> = {}): StripeConnectAccountRow {
  return {
    id: "row-1",
    studio_id: "studio-1",
    stripe_account_id: "acct_123",
    charges_enabled: false,
    payouts_enabled: false,
    details_submitted: false,
    disabled_reason: null,
    connected_by: null,
    onboarding_started_at: null,
    onboarding_completed_at: null,
    last_synced_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("isChargeable", () => {
  it("is false when the studio has never started onboarding", () => {
    expect(isChargeable(null)).toBe(false);
  });

  it("is false while onboarding is incomplete, even with a row present", () => {
    expect(isChargeable(accountRow({ charges_enabled: false }))).toBe(false);
  });

  it("is true only once Stripe reports charges_enabled", () => {
    expect(isChargeable(accountRow({ charges_enabled: true }))).toBe(true);
  });

  it("stays false if details are submitted but Stripe hasn't enabled charges yet", () => {
    expect(isChargeable(accountRow({ details_submitted: true, charges_enabled: false }))).toBe(false);
  });
});
