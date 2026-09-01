// ============================================================================
//  tests/device-registration.test.ts
//
//  The door checks on /api/devices: what counts as an Expo push token, and how
//  a bearer credential is read off a request. Both are pure, and both are the
//  kind of thing that fails silently — a token that looks fine, is stored, and
//  only fails at Expo hours later when a parent misses a notification.
// ============================================================================

import { describe, it, expect } from "vitest";
import { boundedText, isDevicePlatform, isExpoPushToken } from "@/lib/notify/push-token";
import { bearerToken } from "@/lib/api/caller";

const req = (headers: Record<string, string>) =>
  ({ headers: new Headers(headers) }) as unknown as Parameters<typeof bearerToken>[0];

describe("isExpoPushToken", () => {
  it("accepts the token shape current SDKs return", () => {
    expect(isExpoPushToken("ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]")).toBe(true);
  });

  // Older projects still hold these and Expo still accepts them; rejecting the
  // spelling would strand those installs.
  it("accepts the older ExpoPushToken spelling", () => {
    expect(isExpoPushToken("ExpoPushToken[yyyyyyyyyyyyyyyyyyyyyy]")).toBe(true);
  });

  it("tolerates surrounding whitespace", () => {
    expect(isExpoPushToken("  ExponentPushToken[abc]  ")).toBe(true);
  });

  it("rejects the things a broken client actually sends", () => {
    expect(isExpoPushToken("")).toBe(false);
    expect(isExpoPushToken("   ")).toBe(false);
    expect(isExpoPushToken("null")).toBe(false);
    expect(isExpoPushToken("undefined")).toBe(false);
    // A raw FCM/APNs token — plausible-looking, and useless to Expo's API.
    expect(isExpoPushToken("dGhpcyBpcyBub3QgYW4gZXhwbyB0b2tlbg")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[]")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[abc")).toBe(false);
    expect(isExpoPushToken("prefixExponentPushToken[abc]")).toBe(false);
    expect(isExpoPushToken("ExponentPushToken[abc]suffix")).toBe(false);
    // Embedded whitespace would break the JSON payload Expo is sent.
    expect(isExpoPushToken("ExponentPushToken[a b]")).toBe(false);
  });

  it("rejects non-strings rather than coercing them", () => {
    expect(isExpoPushToken(undefined)).toBe(false);
    expect(isExpoPushToken(null)).toBe(false);
    expect(isExpoPushToken(42)).toBe(false);
    expect(isExpoPushToken({ token: "ExponentPushToken[abc]" })).toBe(false);
    expect(isExpoPushToken(["ExponentPushToken[abc]"])).toBe(false);
  });
});

describe("isDevicePlatform", () => {
  it("accepts exactly the two the schema allows", () => {
    expect(isDevicePlatform("ios")).toBe(true);
    expect(isDevicePlatform("android")).toBe(true);
  });

  it("rejects everything else, including near-misses", () => {
    expect(isDevicePlatform("iOS")).toBe(false);
    expect(isDevicePlatform("web")).toBe(false);
    expect(isDevicePlatform("")).toBe(false);
    expect(isDevicePlatform(undefined)).toBe(false);
  });
});

describe("boundedText", () => {
  it("trims and passes through a normal value", () => {
    expect(boundedText("  iPhone 16 Pro  ")).toBe("iPhone 16 Pro");
  });

  // The RPC coalesces optional fields so a launch that omits one doesn't erase
  // what an earlier one recorded — which only works if blank becomes null.
  it("turns blank into null so it cannot overwrite a real value", () => {
    expect(boundedText("")).toBeNull();
    expect(boundedText("   ")).toBeNull();
  });

  it("returns null for non-strings", () => {
    expect(boundedText(undefined)).toBeNull();
    expect(boundedText(null)).toBeNull();
    expect(boundedText(123)).toBeNull();
  });

  it("truncates to the column's budget", () => {
    expect(boundedText("x".repeat(500))).toHaveLength(120);
    expect(boundedText("x".repeat(500), 40)).toHaveLength(40);
  });
});

describe("bearerToken", () => {
  it("reads the token out of a well-formed header", () => {
    expect(bearerToken(req({ authorization: "Bearer abc.def.ghi" }))).toBe("abc.def.ghi");
  });

  it("is case-insensitive about the scheme", () => {
    expect(bearerToken(req({ authorization: "bearer abc" }))).toBe("abc");
    expect(bearerToken(req({ authorization: "BEARER abc" }))).toBe("abc");
  });

  it("returns null when there is no bearer credential to read", () => {
    expect(bearerToken(req({}))).toBeNull();
    expect(bearerToken(req({ authorization: "" }))).toBeNull();
    expect(bearerToken(req({ authorization: "Bearer" }))).toBeNull();
    expect(bearerToken(req({ authorization: "Bearer    " }))).toBeNull();
    // A different scheme is not ours to interpret.
    expect(bearerToken(req({ authorization: "Basic dXNlcjpwYXNz" }))).toBeNull();
  });

  it("does not mistake a token containing spaces for an empty one", () => {
    expect(bearerToken(req({ authorization: "Bearer  padded  " }))).toBe("padded");
  });
});
