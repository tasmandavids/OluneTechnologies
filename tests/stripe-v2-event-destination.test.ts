// ============================================================================
//  Accounts v2 status events — the handler, and its pairing with the Event
//  Destination that feeds it.
//
//  The failure mode here is silence in both directions. Subscribe the
//  destination to an event the handler ignores and nothing happens. Handle an
//  event the destination never sends and nothing happens. Either way a studio
//  that Stripe has restricted keeps looking chargeable to Olune, and the first
//  symptom is a parent's card being declined at a till.
//
//  So these tests hold the two lists together, and pin the behaviour that only
//  matters when something has already gone wrong.
// ============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const syncStripeAccountStatus = vi.fn();
const reportHandledMessage = vi.fn();

vi.mock("@/lib/stripe/connect", () => ({
  syncStripeAccountStatus: (...args: unknown[]) => syncStripeAccountStatus(...args),
}));
vi.mock("@/lib/observability/report", () => ({
  reportHandledMessage: (...args: unknown[]) => reportHandledMessage(...args),
  reportHandledError: vi.fn(),
}));

import {
  processStripeV2Event,
  V2_ACCOUNT_EVENT_TYPES,
  V2_DESTINATION_EVENT_TYPES,
} from "@/lib/webhooks/process-stripe-v2-event";
import { DESTINATION_EVENT_TYPES, DESTINATION_PARAMS } from "../scripts/setup-v2-event-destination.mjs";

/** Records the update payload so the closed-account path can be asserted on. */
function supabaseFor(row: Record<string, unknown> | null) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }),
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return {
          eq: () => ({
            select: () => ({ maybeSingle: async () => ({ data: row ? { id: "row_1" } : null }) }),
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, updates };
}

function notification(type: string, accountId: string | null = "acct_studio_1") {
  return {
    id: "evt_1",
    type,
    related_object: accountId ? { id: accountId, type: "v2.core.account" } : null,
  };
}

beforeEach(() => {
  syncStripeAccountStatus.mockReset();
  reportHandledMessage.mockReset();
});

describe("event destination ↔ handler pairing", () => {
  it("subscribes to exactly the events the handler acts on", () => {
    // Sorted compare: the script is a separate file in a separate language
    // runtime, so ordering drift is not a defect but a missing name is.
    expect([...DESTINATION_EVENT_TYPES].sort()).toEqual([...V2_DESTINATION_EVENT_TYPES].sort());
  });

  it("subscribes only to the merchant configuration", () => {
    // Olune creates merchant-configured accounts only (see
    // STUDIO_ACCOUNT_CONFIGURATIONS). A customer/recipient event can never
    // fire for us, and subscribing to one would suggest otherwise.
    const wrongConfig = DESTINATION_EVENT_TYPES.filter(
      (t: string) => t.includes("configuration.customer") || t.includes("configuration.recipient"),
    );
    expect(wrongConfig).toEqual([]);
  });

  it("routes connected-account events to the destination, not just the platform's own", () => {
    // The one setting that decides whether any studio event arrives at all.
    // `@self` here would produce a healthy-looking destination that never
    // delivers, which is indistinguishable from "no studio has had a problem".
    expect(DESTINATION_PARAMS.events_from).toEqual(["@accounts"]);
    expect(DESTINATION_PARAMS.event_payload).toBe("thin");
  });
});

describe("processStripeV2Event", () => {
  it("re-reads the account when a merchant capability changes", async () => {
    syncStripeAccountStatus.mockResolvedValue({ charges_enabled: true, disabled_reason: null });
    const { client } = supabaseFor({ studio_id: "st_1", charges_enabled: true });

    const outcome = await processStripeV2Event(
      notification("v2.core.account[configuration.merchant].capability_status_updated"),
      client,
    );

    expect(outcome.handled).toBe(true);
    // Thin payloads carry no status — trusting the notification instead of
    // asking Stripe is the mistake this asserts against.
    expect(syncStripeAccountStatus).toHaveBeenCalledWith(client, "acct_studio_1");
  });

  it("reports when a studio that could charge no longer can", async () => {
    syncStripeAccountStatus.mockResolvedValue({
      charges_enabled: false,
      disabled_reason: "inactive: requirements.past_due",
    });
    const { client } = supabaseFor({ studio_id: "st_1", charges_enabled: true });

    await processStripeV2Event(
      notification("v2.core.account[configuration.merchant].capability_status_updated"),
      client,
    );

    expect(reportHandledMessage).toHaveBeenCalledOnce();
    const [, context] = reportHandledMessage.mock.calls[0];
    expect(context.tags.reason).toBe("charges-disabled");
    expect(context.extra.studioId).toBe("st_1");
  });

  it("stays quiet when a studio that could not charge still cannot", async () => {
    syncStripeAccountStatus.mockResolvedValue({ charges_enabled: false, disabled_reason: "pending" });
    const { client } = supabaseFor({ studio_id: "st_1", charges_enabled: false });

    await processStripeV2Event(notification("v2.core.account[requirements].updated"), client);

    // Mid-onboarding accounts emit these constantly. Alerting on them trains
    // everyone to ignore the alert that matters.
    expect(reportHandledMessage).not.toHaveBeenCalled();
  });

  it("marks a closed account unchargeable without asking Stripe", async () => {
    const { client, updates } = supabaseFor({ studio_id: "st_1", charges_enabled: true });

    const outcome = await processStripeV2Event(notification("v2.core.account.closed"), client);

    expect(outcome.handled).toBe(true);
    // A closed account may 404 on retrieve. Syncing would throw, Stripe would
    // retry, and the row would stay chargeable through every retry.
    expect(syncStripeAccountStatus).not.toHaveBeenCalled();
    expect(updates[0]).toMatchObject({ charges_enabled: false, payouts_enabled: false });
  });

  it("ignores accounts it does not track", async () => {
    const { client } = supabaseFor(null);

    const outcome = await processStripeV2Event(notification("v2.core.account.updated"), client);

    expect(outcome.handled).toBe(false);
    expect(syncStripeAccountStatus).not.toHaveBeenCalled();
  });

  it("ignores an unknown event type instead of throwing", async () => {
    const { client } = supabaseFor({ studio_id: "st_1", charges_enabled: true });

    // Stripe adds v2 event names over time. An unrecognised one must produce a
    // 200 and no work — throwing would make Stripe retry it forever.
    const outcome = await processStripeV2Event(notification("v2.core.account.person.created"), client);

    expect(outcome.handled).toBe(false);
    expect(syncStripeAccountStatus).not.toHaveBeenCalled();
  });

  it("acknowledges a ping without touching any account", async () => {
    const { client } = supabaseFor({ studio_id: "st_1", charges_enabled: true });

    const outcome = await processStripeV2Event(
      { id: "evt_ping", type: "v2.core.event_destination.ping" },
      client,
    );

    expect(outcome.handled).toBe(true);
    expect(syncStripeAccountStatus).not.toHaveBeenCalled();
  });

  it("refuses a related_object that is not an account", async () => {
    const { client } = supabaseFor({ studio_id: "st_1", charges_enabled: true });

    const outcome = await processStripeV2Event(
      { ...notification("v2.core.account.updated"), related_object: { id: "cus_123", type: "customer" } },
      client,
    );

    expect(outcome.handled).toBe(false);
    expect(syncStripeAccountStatus).not.toHaveBeenCalled();
  });

  it("acts on every account event type it claims to handle", async () => {
    // Guards the list itself: adding a name to V2_ACCOUNT_EVENT_TYPES without
    // a branch would leave a subscribed event silently doing nothing.
    for (const type of V2_ACCOUNT_EVENT_TYPES) {
      syncStripeAccountStatus.mockResolvedValue({ charges_enabled: true, disabled_reason: null });
      const { client } = supabaseFor({ studio_id: "st_1", charges_enabled: true });
      const outcome = await processStripeV2Event(notification(type), client);
      expect(outcome.handled, `${type} was subscribed but not handled`).toBe(true);
    }
  });
});
