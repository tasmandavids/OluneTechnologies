import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalAppUrl,
  emailGoogleOAuthCallbackUrl,
  inviteRedirectUrl,
  xeroOAuthCallbackUrl,
} from "@/lib/app-url";

describe("canonicalAppUrl", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  it("prefers NEXT_PUBLIC_APP_URL when set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.olune.co.nz/";
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;
    expect(canonicalAppUrl()).toBe("https://www.olune.co.nz");
  });

  it("derives from NEXT_PUBLIC_ROOT_DOMAIN in production", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_ROOT_DOMAIN = "olune.co.nz";
    expect(canonicalAppUrl()).toBe("https://www.olune.co.nz");
  });

  it("adds https and www when APP_URL is a bare domain", () => {
    process.env.NEXT_PUBLIC_APP_URL = "olune.co.nz";
    expect(canonicalAppUrl()).toBe("https://www.olune.co.nz");
    expect(emailGoogleOAuthCallbackUrl()).toBe(
      "https://www.olune.co.nz/api/email/oauth/google/callback",
    );
  });
});

describe("inviteRedirectUrl", () => {
  const env = process.env;

  afterEach(() => {
    process.env = { ...env };
  });

  // The production value of NEXT_PUBLIC_APP_URL is stored without a scheme.
  // Five invite call sites used to interpolate it raw, producing a schemeless
  // string that Supabase will not accept as a redirect — which silently sent
  // families to the project's default Site URL instead of the invited page.
  it("produces an absolute URL from a schemeless APP_URL", () => {
    process.env.NEXT_PUBLIC_APP_URL = "olune.co.nz";

    const url = inviteRedirectUrl();

    expect(url).toBe("https://www.olune.co.nz/auth/callback?next=%2Fwelcome");
    expect(() => new URL(url)).not.toThrow();
    expect(new URL(url).protocol).toBe("https:");
  });

  it("round-trips the next path through searchParams the way /auth/callback reads it", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.olune.co.nz";

    const url = new URL(inviteRedirectUrl("/portal/parent"));

    expect(url.searchParams.get("next")).toBe("/portal/parent");
  });

  it("defaults to /welcome", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://www.olune.co.nz";

    expect(new URL(inviteRedirectUrl()).searchParams.get("next")).toBe("/welcome");
  });

  it("stays absolute in local dev when nothing is configured", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_ROOT_DOMAIN;

    expect(inviteRedirectUrl()).toBe("http://localhost:3000/auth/callback?next=%2Fwelcome");
  });
});
