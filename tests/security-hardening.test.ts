import { describe, it, expect } from "vitest";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { authCookieDomain, withAuthCookieDomain } from "@/lib/auth/cookie-domain";
import { authorizedCron } from "@/lib/cron/auth";
import { NextRequest } from "next/server";

describe("checkRateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const key = rateLimitKey("test", `u-${Math.random()}`);
    expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 })).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 })).toBe(true);
    expect(checkRateLimit(key, { limit: 2, windowMs: 60_000 })).toBe(false);
  });
});

describe("authCookieDomain", () => {
  it("returns undefined for localhost", () => {
    const prev = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "localhost";
    expect(authCookieDomain()).toBeUndefined();
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = prev;
  });

  it("prefixes a leading dot for real domains", () => {
    const prev = process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "olune.app";
    expect(authCookieDomain()).toBe(".olune.app");
    expect(withAuthCookieDomain({ path: "/" }).domain).toBe(".olune.app");
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = prev;
  });
});

describe("authorizedCron", () => {
  it("rejects when CRON_SECRET is missing outside local dev", () => {
    const prevSecret = process.env.CRON_SECRET;
    const prevVercel = process.env.VERCEL_ENV;
    delete process.env.CRON_SECRET;
    process.env.VERCEL_ENV = "production";

    const req = new NextRequest("http://localhost/api/cron/notifications");
    // With VERCEL_ENV set and no secret, must fail closed regardless of NODE_ENV
    expect(authorizedCron(req)).toBe(false);

    process.env.CRON_SECRET = prevSecret;
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
  });

  it("accepts Bearer secret", () => {
    const prevSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "test-cron-secret";
    const req = new NextRequest("http://localhost/api/cron/notifications", {
      headers: { authorization: "Bearer test-cron-secret" },
    });
    expect(authorizedCron(req)).toBe(true);
    process.env.CRON_SECRET = prevSecret;
  });
});
