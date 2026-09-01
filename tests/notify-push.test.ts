// ============================================================================
//  tests/notify-push.test.ts
//
//  sendPush is the only provider whose *failures* carry a decision: a ticket
//  marked `unregistered` causes the cron to permanently revoke a device row, so
//  misreading Expo's response either silences a parent for good (revoking a
//  live token) or gets the project rate-limited (never revoking a dead one).
//  These tests pin that classification.
//
//  `fetch` is stubbed — no network.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendPush } from "@/lib/notify/providers";

const TOKEN_A = "ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]";
const TOKEN_B = "ExponentPushToken[bbbbbbbbbbbbbbbbbbbbbb]";

const savedEnv = { ...process.env };
const realFetch = globalThis.fetch;

/** Stub `fetch` with a canned Expo response and capture what was sent. */
function stubExpo(
  respond: (body: unknown[]) => { status?: number; json?: unknown; text?: string },
) {
  const calls: unknown[][] = [];
  globalThis.fetch = vi.fn(async (_url: unknown, init?: { body?: string }) => {
    const sent = JSON.parse(init?.body ?? "[]") as unknown[];
    calls.push(sent);
    const r = respond(sent);
    return {
      ok: (r.status ?? 200) < 400,
      status: r.status ?? 200,
      json: async () => r.json ?? {},
      text: async () => r.text ?? "",
    };
  }) as unknown as typeof fetch;
  return calls;
}

/** Expo's success shape: one ticket per message, in order. */
const allOk = (sent: unknown[]) => ({
  json: { data: sent.map((_, i) => ({ status: "ok", id: `ticket-${i}` })) },
});

beforeEach(() => {
  process.env.EXPO_ACCESS_TOKEN = "expo_test_token";
});

afterEach(() => {
  process.env = { ...savedEnv };
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("sendPush — configuration gate", () => {
  it("skips without an Expo access token instead of throwing", async () => {
    delete process.env.EXPO_ACCESS_TOKEN;
    const calls = stubExpo(allOk);
    const r = await sendPush({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(r.skipped).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it("makes no request when there are no tokens", async () => {
    const calls = stubExpo(allOk);
    const r = await sendPush({ tokens: [], title: "t", body: "b" });
    expect(r).toEqual({ skipped: false, tickets: [] });
    expect(calls).toHaveLength(0);
  });

  it("drops blank tokens before sending", async () => {
    const calls = stubExpo(allOk);
    await sendPush({ tokens: ["", "   ", TOKEN_A], title: "t", body: "b" });
    expect(calls[0]).toHaveLength(1);
  });
});

describe("sendPush — success", () => {
  it("returns one ok ticket per token and carries the Expo receipt id", async () => {
    stubExpo(allOk);
    const r = await sendPush({ tokens: [TOKEN_A, TOKEN_B], title: "t", body: "b" });
    expect(r.skipped).toBe(false);
    expect(r.tickets).toHaveLength(2);
    expect(r.tickets?.every((t) => t.ok)).toBe(true);
    expect(r.tickets?.[0]).toMatchObject({ token: TOKEN_A, ok: true, id: "ticket-0" });
  });

  it("sends title, body, data and the Android channel through to Expo", async () => {
    const calls = stubExpo(allOk);
    await sendPush({
      tokens: [TOKEN_A],
      title: "Ruby checked in",
      body: "Jazz Elite, Studio 2",
      data: { link: "/portal/parent" },
      channelId: "checkins",
    });
    expect(calls[0][0]).toMatchObject({
      to: TOKEN_A,
      title: "Ruby checked in",
      body: "Jazz Elite, Studio 2",
      data: { link: "/portal/parent" },
      sound: "default",
      channelId: "checkins",
    });
  });

  it("omits channelId entirely when none is given", async () => {
    const calls = stubExpo(allOk);
    await sendPush({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(calls[0][0]).not.toHaveProperty("channelId");
  });
});

describe("sendPush — dead tokens are terminal, not retryable", () => {
  it("marks DeviceNotRegistered as unregistered and never retryable", async () => {
    stubExpo(() => ({
      json: {
        data: [
          {
            status: "error",
            message: '"ExponentPushToken[aaa]" is not a registered push notification recipient',
            details: { error: "DeviceNotRegistered" },
          },
        ],
      },
    }));
    const r = await sendPush({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(r.tickets?.[0]).toMatchObject({ ok: false, unregistered: true, retryable: false });
  });

  it("treats a malformed token as unregistered even with no details.error", async () => {
    stubExpo(() => ({
      json: {
        data: [{ status: "error", message: '"not-a-token" is not a valid Expo push token' }],
      },
    }));
    const r = await sendPush({ tokens: ["not-a-token"], title: "t", body: "b" });
    expect(r.tickets?.[0]).toMatchObject({ ok: false, unregistered: true, retryable: false });
  });

  // The asymmetry that matters: retrying a live token costs one request;
  // revoking one silences a parent permanently. Unknown errors retry.
  it("treats an unrecognised Expo error as retryable, not as a dead device", async () => {
    stubExpo(() => ({
      json: { data: [{ status: "error", message: "Message rate exceeded" }] },
    }));
    const r = await sendPush({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(r.tickets?.[0]).toMatchObject({ ok: false, unregistered: false, retryable: true });
  });

  it("classifies each token independently within one batch", async () => {
    stubExpo(() => ({
      json: {
        data: [
          { status: "ok", id: "ticket-0" },
          { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
        ],
      },
    }));
    const r = await sendPush({ tokens: [TOKEN_A, TOKEN_B], title: "t", body: "b" });
    expect(r.tickets?.[0]).toMatchObject({ token: TOKEN_A, ok: true });
    expect(r.tickets?.[1]).toMatchObject({ token: TOKEN_B, ok: false, unregistered: true });
  });
});

describe("sendPush — transport failures", () => {
  it("retries a 5xx but not a 4xx that will fail identically next time", async () => {
    stubExpo(() => ({ status: 503, text: "upstream unavailable" }));
    const server = await sendPush({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(server.tickets?.[0]).toMatchObject({ ok: false, retryable: true, unregistered: false });

    stubExpo(() => ({ status: 400, text: "malformed" }));
    const client = await sendPush({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(client.tickets?.[0]).toMatchObject({ ok: false, retryable: false });
  });

  it("retries a 429 — throttling is the one 4xx worth waiting out", async () => {
    stubExpo(() => ({ status: 429, text: "slow down" }));
    const r = await sendPush({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(r.tickets?.[0]).toMatchObject({ ok: false, retryable: true });
  });

  it("marks every token in a failed batch, not just the first", async () => {
    stubExpo(() => ({ status: 503, text: "down" }));
    const r = await sendPush({ tokens: [TOKEN_A, TOKEN_B], title: "t", body: "b" });
    expect(r.tickets).toHaveLength(2);
    expect(r.tickets?.every((t) => !t.ok)).toBe(true);
  });

  it("turns a thrown fetch into retryable tickets rather than propagating", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("socket hang up");
    }) as unknown as typeof fetch;
    const r = await sendPush({ tokens: [TOKEN_A], title: "t", body: "b" });
    expect(r.tickets?.[0]).toMatchObject({ ok: false, retryable: true, unregistered: false });
  });

  // Guessing "delivered" here would hide a real Expo outage behind a green run.
  it("does not assume success when Expo returns fewer tickets than messages", async () => {
    stubExpo(() => ({ json: { data: [{ status: "ok", id: "ticket-0" }] } }));
    const r = await sendPush({ tokens: [TOKEN_A, TOKEN_B], title: "t", body: "b" });
    expect(r.tickets?.[0]).toMatchObject({ ok: true });
    expect(r.tickets?.[1]).toMatchObject({ ok: false, retryable: true, unregistered: false });
  });
});

describe("sendPush — batching", () => {
  it("splits above Expo's 100-message limit and keeps every ticket", async () => {
    const tokens = Array.from({ length: 250 }, (_, i) => `ExponentPushToken[${i}]`);
    const calls = stubExpo(allOk);
    const r = await sendPush({ tokens, title: "t", body: "b" });
    expect(calls.map((c) => c.length)).toEqual([100, 100, 50]);
    expect(r.tickets).toHaveLength(250);
    expect(r.tickets?.every((t) => t.ok)).toBe(true);
  });

  it("keeps tickets aligned to their token across batch boundaries", async () => {
    const tokens = Array.from({ length: 150 }, (_, i) => `ExponentPushToken[${i}]`);
    stubExpo(allOk);
    const r = await sendPush({ tokens, title: "t", body: "b" });
    expect(r.tickets?.[0].token).toBe("ExponentPushToken[0]");
    expect(r.tickets?.[100].token).toBe("ExponentPushToken[100]");
    expect(r.tickets?.[149].token).toBe("ExponentPushToken[149]");
  });
});
