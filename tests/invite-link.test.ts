import { describe, expect, it } from "vitest";
import { buildTokenHashUrl } from "@/lib/auth/invite-link";

describe("buildTokenHashUrl (audit A-04)", () => {
  it("carries the token in the query string, not the fragment", () => {
    const url = new URL(buildTokenHashUrl("abc123", "invite"));
    expect(url.pathname).toBe("/auth/callback");
    expect(url.hash).toBe("");
    expect(url.searchParams.get("token_hash")).toBe("abc123");
    expect(url.searchParams.get("type")).toBe("invite");
    expect(url.searchParams.get("next")).toBe("/welcome");
  });
});
