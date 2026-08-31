// ============================================================================
//  Connect on Accounts v2, and the liability arrangement that rides on it.
//
//  The dangerous failure here is silent. A destination charge that carries
//  transfer_data but NOT on_behalf_of still succeeds, still settles to the
//  studio, and still looks right in the dashboard — while leaving Olune as
//  merchant of record, holding the chargebacks for classes it does not run.
//  Nothing fails; the money just moves with the liability in the wrong place.
//
//  So these tests guard the pairing rather than the happy path.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveDestinationCharge,
  chargesEnabledFrom,
  payoutsEnabledFrom,
  detailsSubmittedFrom,
  disabledReasonFrom,
  isChargeable,
  STUDIO_ACCOUNT_CONFIGURATIONS,
  STUDIO_ACCOUNT_DEFAULTS,
} from "@/lib/stripe/connect";

/** Minimal stand-in for the one query loadStudioStripeAccount makes. */
function supabaseReturning(row: Record<string, unknown> | null): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
    }),
  } as unknown as SupabaseClient;
}

const CHARGEABLE = {
  stripe_account_id: "acct_studio_123",
  charges_enabled: true,
};

function v2Account(over: Record<string, unknown> = {}) {
  return {
    configuration: {
      merchant: {
        capabilities: {
          card_payments: { status: "active", status_details: [] },
          stripe_balance: { payouts: { status: "active", status_details: [] } },
        },
      },
    },
    requirements: { entries: [] },
    ...over,
  } as never;
}

describe("resolveDestinationCharge", () => {
  it("returns transfer_data and on_behalf_of together, pointing at the same account", async () => {
    const out = await resolveDestinationCharge(supabaseReturning(CHARGEABLE), "studio-1");

    expect(out).toEqual({
      transfer_data: { destination: "acct_studio_123" },
      on_behalf_of: "acct_studio_123",
    });
  });

  it("never yields transfer_data without on_behalf_of", async () => {
    // The whole point. If a future edit splits these, the studio stops being
    // merchant of record and nothing else in the codebase notices.
    const out = (await resolveDestinationCharge(
      supabaseReturning(CHARGEABLE),
      "studio-1",
    )) as Record<string, unknown>;

    expect("transfer_data" in out).toBe("on_behalf_of" in out);
  });

  it("is empty for a studio that has not onboarded, so the charge stays on the platform", async () => {
    expect(await resolveDestinationCharge(supabaseReturning(null), "studio-1")).toEqual({});
  });

  it("is empty while the account exists but cannot yet take charges", async () => {
    const pending = { stripe_account_id: "acct_x", charges_enabled: false };

    expect(await resolveDestinationCharge(supabaseReturning(pending), "studio-1")).toEqual({});
    expect(isChargeable(pending as never)).toBe(false);
  });
});

describe("v2 status mapping onto the columns 0090 already has", () => {
  it("reads an active account as chargeable and payable", () => {
    const a = v2Account();

    expect(chargesEnabledFrom(a)).toBe(true);
    expect(payoutsEnabledFrom(a)).toBe(true);
    expect(detailsSubmittedFrom(a)).toBe(true);
    expect(disabledReasonFrom(a)).toBeNull();
  });

  it("reads a restricted account as not chargeable, and says why", () => {
    const a = v2Account({
      configuration: {
        merchant: {
          capabilities: {
            card_payments: {
              status: "restricted",
              status_details: [{ code: "requirements_past_due" }],
            },
            stripe_balance: { payouts: { status: "restricted", status_details: [] } },
          },
        },
      },
      requirements: {
        entries: [{ awaiting_action_from: "user", description: "configuration.merchant.mcc" }],
      },
    });

    expect(chargesEnabledFrom(a)).toBe(false);
    expect(payoutsEnabledFrom(a)).toBe(false);
    expect(detailsSubmittedFrom(a)).toBe(false);
    expect(disabledReasonFrom(a)).toBe("restricted: requirements_past_due");
  });

  it("counts the form as submitted once nothing awaits the user, even mid-review", () => {
    // v1's details_submitted meant "they finished the form". Stripe reviewing
    // afterwards is not the studio's problem and must not read as unsubmitted.
    const a = v2Account({
      requirements: { entries: [{ awaiting_action_from: "stripe", description: "under review" }] },
    });

    expect(detailsSubmittedFrom(a)).toBe(true);
  });

  it("survives an account fetched without the merchant configuration included", () => {
    expect(chargesEnabledFrom({} as never)).toBe(false);
    expect(payoutsEnabledFrom({} as never)).toBe(false);
    expect(disabledReasonFrom({} as never)).toBeNull();
  });
});

describe("the liability arrangement is not silently reversible", () => {
  it("puts fees and losses on the studio's own account", () => {
    // Changing either to "application" moves chargeback and negative-balance
    // liability back onto Olune. It is a deliberate business decision, made
    // once, and it cannot be changed without re-onboarding every studio — so
    // it should not be changeable by an inattentive edit.
    expect(STUDIO_ACCOUNT_DEFAULTS.responsibilities.fees_collector).toBe("stripe");
    expect(STUDIO_ACCOUNT_DEFAULTS.responsibilities.losses_collector).toBe("stripe");
  });

  it("onboards the merchant configuration, which is what makes that possible", () => {
    // Stripe rejects losses_collector: "stripe" for a recipient-only account.
    expect([...STUDIO_ACCOUNT_CONFIGURATIONS]).toEqual(["merchant"]);
  });
});

describe("every charge site pairs the two parameters", () => {
  const CHARGE_SITES = [
    "app/portal/admin/subscriptions/actions.ts",
    "app/portal/admin/billing/actions.ts",
    "app/portal/parent/billing/actions.ts",
    "app/portal/parent/enroll/actions.ts",
    "app/portal/parent/subscriptions/actions.ts",
    "app/api/payments/create-intent/route.ts",
    "app/api/shop/checkout/route.ts",
    "app/api/passes/purchase/route.ts",
    "app/api/events/purchase/route.ts",
  ];

  function source(rel: string): string {
    return readFileSync(fileURLToPath(new URL(`../${rel}`, import.meta.url)), "utf8");
  }

  it.each(CHARGE_SITES)("%s spreads the resolved pair rather than either half", (path) => {
    const src = source(path);

    expect(src).toContain("resolveDestinationCharge");
    // A literal `transfer_data:` here means someone has gone back to setting it
    // by hand, which is exactly how on_behalf_of gets dropped.
    expect(src).not.toMatch(/transfer_data:/);
  });

  it("covers every site that resolves a destination charge", () => {
    // Guards the list above from going stale: a tenth charge site added without
    // being listed here would otherwise never be checked.
    const all = CHARGE_SITES.map(source).join("");
    const used = (all.match(/resolveDestinationCharge/g) ?? []).length;

    expect(used).toBeGreaterThanOrEqual(CHARGE_SITES.length * 2); // import + call
  });
});
