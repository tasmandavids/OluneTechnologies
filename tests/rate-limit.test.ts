import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  checkRateLimit,
  checkRateLimitInProcess,
  clientIpKey,
  rateLimitKey,
  __resetInProcessBuckets,
} from "@/lib/rate-limit";
import { upstashConfigured } from "@/lib/redis/upstash";

// Sentry is a no-op without a DSN, but stubbing keeps the reporting path off
// the test's critical section entirely.
vi.mock("@/lib/observability/report", () => ({
  reportHandledError: vi.fn(async () => {}),
  reportHandledMessage: vi.fn(async () => {}),
}));

const UPSTASH_ENV = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
] as const;

function clearUpstashEnv() {
  for (const k of UPSTASH_ENV) delete process.env[k];
}

beforeEach(() => {
  __resetInProcessBuckets();
  clearUpstashEnv();
  vi.unstubAllGlobals();
});

afterEach(() => {
  clearUpstashEnv();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("in-process window", () => {
  it("allows exactly `limit` requests, then refuses", () => {
    const opts = { limit: 3, windowMs: 60_000 };
    expect(checkRateLimitInProcess("k", opts)).toBe(true);
    expect(checkRateLimitInProcess("k", opts)).toBe(true);
    expect(checkRateLimitInProcess("k", opts)).toBe(true);
    expect(checkRateLimitInProcess("k", opts)).toBe(false);
  });

  it("does not record a refused request, so being blocked never extends the block", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-02T00:00:00Z"));
    const opts = { limit: 1, windowMs: 10_000 };

    expect(checkRateLimitInProcess("k", opts)).toBe(true);
    // Hammer while blocked. If refusals were recorded, these would push the
    // window forward and the caller would still be blocked after it expires.
    for (let i = 0; i < 5; i++) {
      vi.advanceTimersByTime(1_000);
      expect(checkRateLimitInProcess("k", opts)).toBe(false);
    }

    // 10s after the one recorded hit, the window is clear again.
    vi.advanceTimersByTime(5_001);
    expect(checkRateLimitInProcess("k", opts)).toBe(true);
  });

  it("keeps separate keys separate", () => {
    const opts = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimitInProcess("a", opts)).toBe(true);
    expect(checkRateLimitInProcess("b", opts)).toBe(true);
    expect(checkRateLimitInProcess("a", opts)).toBe(false);
  });
});

describe("upstashConfigured", () => {
  it("is false with no credentials", () => {
    expect(upstashConfigured()).toBe(false);
  });

  it("accepts the Upstash naming", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
    expect(upstashConfigured()).toBe(true);
  });

  it("accepts the Vercel KV naming, so either provisioning route works", () => {
    process.env.KV_REST_API_URL = "https://x.kv.vercel-storage.com";
    process.env.KV_REST_API_TOKEN = "tok";
    expect(upstashConfigured()).toBe(true);
  });

  it("is false when only half a pair is present", () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    expect(upstashConfigured()).toBe(false);
  });
});

describe("shared window", () => {
  function stubFetch(impl: (url: string, init: RequestInit) => unknown) {
    const spy = vi.fn(async (url: unknown, init: unknown) => {
      const body = impl(String(url), init as RequestInit);
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as unknown as Response;
    });
    vi.stubGlobal("fetch", spy);
    return spy;
  }

  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://x.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "tok";
  });

  it("sends a well-formed EVAL and honours the verdict", async () => {
    const spy = stubFetch(() => ({ result: 1 }));

    await expect(checkRateLimit("scope:user", { limit: 5, windowMs: 60_000 })).resolves.toBe(true);

    expect(spy).toHaveBeenCalledTimes(1);
    const init = spy.mock.calls[0]![1] as RequestInit;
    const cmd = JSON.parse(String(init.body)) as string[];

    expect(cmd[0]).toBe("EVAL");
    expect(cmd[1]).toContain("ZREMRANGEBYSCORE");
    expect(cmd[2]).toBe("1");
    // Namespaced so the limiter can share a database with anything else.
    expect(cmd[3]).toBe("rl:scope:user");
    // now, windowMs, limit, member
    expect(cmd[5]).toBe("60000");
    expect(cmd[6]).toBe("5");
    expect(cmd[7]).toBeTruthy();

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("refuses when the script returns 0", async () => {
    stubFetch(() => ({ result: 0 }));
    await expect(checkRateLimit("k", { limit: 1, windowMs: 1_000 })).resolves.toBe(false);
  });

  it("gives each request a distinct member, or same-millisecond calls collide", async () => {
    const spy = stubFetch(() => ({ result: 1 }));
    await checkRateLimit("k", { limit: 5, windowMs: 1_000 });
    await checkRateLimit("k", { limit: 5, windowMs: 1_000 });

    const member = (i: number) =>
      (JSON.parse(String((spy.mock.calls[i]![1] as RequestInit).body)) as string[])[7];
    expect(member(0)).not.toBe(member(1));
  });

  it("falls back to the in-process window when Redis is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const opts = { limit: 2, windowMs: 60_000 };
    // Degraded, not absent: the local window still enforces something.
    await expect(checkRateLimit("k", opts)).resolves.toBe(true);
    await expect(checkRateLimit("k", opts)).resolves.toBe(true);
    await expect(checkRateLimit("k", opts)).resolves.toBe(false);
  });

  it("falls back on a Redis-level error in an otherwise-200 body", async () => {
    stubFetch(() => ({ error: "ERR unknown command" }));
    await expect(checkRateLimit("k", { limit: 1, windowMs: 60_000 })).resolves.toBe(true);
    await expect(checkRateLimit("k", { limit: 1, windowMs: 60_000 })).resolves.toBe(false);
  });

  it("falls back on a non-2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response),
    );
    await expect(checkRateLimit("k", { limit: 1, windowMs: 60_000 })).resolves.toBe(true);
  });

  it("bypasses Redis entirely when unconfigured", async () => {
    clearUpstashEnv();
    const spy = vi.fn();
    vi.stubGlobal("fetch", spy);

    await expect(checkRateLimit("k", { limit: 1, windowMs: 60_000 })).resolves.toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("key helpers", () => {
  it("scopes by id", () => {
    expect(rateLimitKey("enroll", "u1")).toBe("enroll:u1");
  });

  it("takes the FIRST x-forwarded-for entry — later ones are spoofable", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1, 10.0.0.2" });
    expect(clientIpKey("enrol-trial", headers)).toBe("enrol-trial:203.0.113.9");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(clientIpKey("s", new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("s:198.51.100.4");
    // Blunt, but the safe direction: throttle all anonymous callers together
    // rather than letting an unidentifiable one through unmetered.
    expect(clientIpKey("s", new Headers())).toBe("s:unknown");
  });
});
