import type { Session } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSessionCompleteResponse,
  purgeAuthCookies,
  readSessionJsonFromRequest,
  requestHasAuthCookies,
  stripSessionFromRequest,
  supabaseAuthStorageKey,
} from "@/lib/supabase/auth-cookies";

const originalEnv = { ...process.env };

function makeRequest(cookieHeader: string, url = "https://app.olune.test/auth/callback") {
  return new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : undefined,
  });
}

function storageKey() {
  return supabaseAuthStorageKey();
}

function makeSession(): Session {
  return {
    access_token: "fresh-access-token",
    refresh_token: "fresh-refresh-token",
    expires_in: 3600,
    expires_at: 1_900_000_000,
    token_type: "bearer",
    user: {
      id: "user_1",
      aud: "authenticated",
      role: "authenticated",
      email: "student@example.com",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-01-01T00:00:00.000Z",
    },
  } as Session;
}

function decodeAuthCookie(value: string) {
  const encoded = value.replace(/^base64-/, "");
  return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<
    string,
    unknown
  >;
}

describe("Supabase auth cookie helpers", () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_SUPABASE_URL: "https://projref.supabase.co",
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prefers the unsuffixed session cookie over chunked auth cookies", () => {
    const key = storageKey();
    const request = makeRequest(`${key}=single-session; ${key}.0=chunk-a; ${key}.1=chunk-b`);

    expect(readSessionJsonFromRequest(request)).toBe("single-session");
  });

  it("reassembles chunked session cookies in order when no single cookie exists", () => {
    const key = storageKey();
    const request = makeRequest(`${key}.0=base64-part-a; ${key}.1=part-b; ${key}.2=part-c`);

    expect(readSessionJsonFromRequest(request)).toBe("base64-part-apart-bpart-c");
  });

  it("purges stale auth variants while preserving the PKCE verifier when requested", () => {
    const key = storageKey();
    const response = NextResponse.next();
    const request = makeRequest(
      [
        `${key}=stale-session`,
        `${key}.0=stale-chunk`,
        `${key}.7=late-stale-chunk`,
        `${key}-user=stale-user`,
        `${key}-code-verifier=pkce-verifier`,
        "unrelated=value",
      ].join("; "),
    );

    purgeAuthCookies(response, request, { keepVerifier: true });

    expect(response.cookies.get(key)?.value).toBe("");
    expect(response.cookies.get(`${key}.0`)?.value).toBe("");
    expect(response.cookies.get(`${key}.7`)?.value).toBe("");
    expect(response.cookies.get(`${key}-user`)?.value).toBe("");
    expect(response.cookies.get(`${key}-code-verifier`)).toBeUndefined();
    expect(response.cookies.get("unrelated")).toBeUndefined();
  });

  it("strips stale session cookies from callback requests without removing the verifier", () => {
    const key = storageKey();
    const request = makeRequest(
      [
        `${key}=stale-session`,
        `${key}.0=stale-chunk`,
        `${key}-user=stale-user`,
        `${key}-code-verifier=pkce-verifier`,
      ].join("; "),
    );

    stripSessionFromRequest(request);

    expect(readSessionJsonFromRequest(request)).toBeNull();
    expect(request.cookies.get(`${key}-user`)).toBeUndefined();
    expect(request.cookies.get(`${key}-code-verifier`)?.value).toBe("pkce-verifier");
    expect(requestHasAuthCookies(request)).toBe(true);
  });

  it("returns a no-store HTML session handoff that clears stale chunks and writes fresh tokens", async () => {
    const key = storageKey();
    const request = makeRequest(
      `${key}.0=stale-chunk; ${key}-user=stale-user; ${key}-code-verifier=pkce-verifier`,
    );

    const response = buildSessionCompleteResponse(
      request,
      "https://app.olune.test/portal",
      makeSession(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("Expires")).toBe("0");
    expect(response.headers.get("Pragma")).toBe("no-cache");

    const html = await response.text();
    expect(html).toContain("https://app.olune.test/portal");
    const freshCookie = response.cookies.get(key)?.value;
    expect(freshCookie).toMatch(/^base64-/);
    expect(decodeAuthCookie(freshCookie!)).toMatchObject({
      access_token: "fresh-access-token",
      refresh_token: "fresh-refresh-token",
      token_type: "bearer",
    });
    expect(response.cookies.get(`${key}.0`)?.value).toBe("");
    expect(response.cookies.get(`${key}-user`)?.value).toBe("");
    expect(response.cookies.get(`${key}-code-verifier`)?.value).toBe("");
  });
});
