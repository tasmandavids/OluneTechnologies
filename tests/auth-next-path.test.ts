import { describe, expect, it } from "vitest";
import { sanitizeNextPath } from "@/lib/auth/oauth";

// Everything that redirects a user after sign-in (the OAuth start, the OAuth
// callback, the email + password form, and middleware's /login?next= handling)
// funnels through sanitizeNextPath. A `next` that escapes this guard sends a
// just-authenticated user to another origin.
describe("sanitizeNextPath", () => {
  it("keeps ordinary same-origin paths", () => {
    expect(sanitizeNextPath("/portal/admin")).toBe("/portal/admin");
    expect(sanitizeNextPath("/join?studio=nzad")).toBe("/join?studio=nzad");
  });

  it("falls back when there is no next", () => {
    expect(sanitizeNextPath(null)).toBe("/portal");
    expect(sanitizeNextPath(undefined)).toBe("/portal");
    expect(sanitizeNextPath("")).toBe("/portal");
    expect(sanitizeNextPath(null, "/join")).toBe("/join");
  });

  it("rejects absolute URLs — including a stale localhost one", () => {
    expect(sanitizeNextPath("http://127.0.0.1:3000/portal/admin")).toBe("/portal");
    expect(sanitizeNextPath("https://evil.example/x")).toBe("/portal");
    expect(sanitizeNextPath("javascript:alert(1)")).toBe("/portal");
  });

  it("rejects protocol-relative paths, backslashes included", () => {
    expect(sanitizeNextPath("//evil.example/x")).toBe("/portal");
    // new URL("/\\evil.example/x", origin) resolves to https://evil.example/x —
    // a startsWith("//") check alone does not catch this.
    expect(sanitizeNextPath("/\\evil.example/x")).toBe("/portal");
    expect(sanitizeNextPath("\\\\evil.example/x")).toBe("/portal");
  });

  it("rejects control characters that could split a Location header", () => {
    expect(sanitizeNextPath("/portal\r\nSet-Cookie: a=b")).toBe("/portal");
    expect(sanitizeNextPath("/portal\u0000")).toBe("/portal");
  });

  it("is what new URL() needs: an accepted path never changes origin", () => {
    const base = "https://nzad.olune.co.nz/login";
    for (const candidate of [
      "/portal/admin",
      "http://127.0.0.1:3000/portal",
      "//evil.example/x",
      "/\\evil.example/x",
    ]) {
      const resolved = new URL(sanitizeNextPath(candidate), base);
      expect(resolved.origin).toBe("https://nzad.olune.co.nz");
    }
  });
});
