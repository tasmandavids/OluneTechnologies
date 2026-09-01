import { describe, it, expect } from "vitest";
import {
  dedupeParentsByEmail,
  isGhostEmail,
  isSendableParentEmail,
  plaintextToHtml,
  renderMassParentEmail,
  isNonRoutableEmail,} from "@/lib/parents/mass-email";

describe("isGhostEmail / isSendableParentEmail", () => {
  it("treats missing and olune.local addresses as ghost", () => {
    expect(isGhostEmail(null)).toBe(true);
    expect(isGhostEmail("")).toBe(true);
    expect(isGhostEmail("abc@parents.olune.local")).toBe(true);
    expect(isSendableParentEmail("abc@parents.olune.local")).toBe(false);
  });

  it("accepts real emails", () => {
    expect(isGhostEmail("sarah@example.com")).toBe(false);
    expect(isSendableParentEmail("sarah@example.com")).toBe(true);
  });
});

describe("plaintextToHtml", () => {
  it("escapes HTML and preserves line breaks", () => {
    expect(plaintextToHtml("Hi <b>x</b>\nBye")).toBe("Hi &lt;b&gt;x&lt;/b&gt;<br>\nBye");
  });
});

describe("renderMassParentEmail", () => {
  it("renders greeting, body, and studio signature", () => {
    const e = renderMassParentEmail({
      studioName: "North Shore Ballet",
      subject: "Show rehearsal",
      body: "Rehearsal is Saturday at 10am.",
      parentName: "Sarah",
    });
    expect(e.subject).toBe("Show rehearsal");
    expect(e.html).toContain("Hi Sarah");
    expect(e.html).toContain("Rehearsal is Saturday at 10am.");
    expect(e.html).toContain("North Shore Ballet");
    expect(e.text).toContain("— North Shore Ballet");
  });

  it("escapes HTML injection in name and body", () => {
    const e = renderMassParentEmail({
      studioName: "<Studio>",
      subject: "Hello",
      body: "<script>alert(1)</script>",
      parentName: "<img>",
    });
    expect(e.html).not.toContain("<script>");
    expect(e.html).toContain("&lt;script&gt;");
    expect(e.html).toContain("&lt;img&gt;");
    expect(e.html).toContain("&lt;Studio&gt;");
  });
});

describe("dedupeParentsByEmail", () => {
  it("skips ghosts and dedupes case-insensitively", () => {
    const out = dedupeParentsByEmail([
      { id: "1", email: "A@ex.com", full_name: "A" },
      { id: "2", email: "a@ex.com", full_name: "Dup" },
      { id: "3", email: "x@parents.olune.local", full_name: "Ghost" },
      { id: "4", email: null, full_name: "None" },
      { id: "5", email: "b@ex.com", full_name: "B" },
    ]);
    expect(out.map((p) => p.id)).toEqual(["1", "5"]);
  });
});

// Turning email on made these live: a studio full of seeded @auroradance.demo
// parents is one "email everyone" click away from a ~50% hard-bounce rate on a
// sending domain with no reputation yet.
describe("non-routable recipients", () => {
  it("rejects the seeded demo domain, which is undelegated in the DNS root", () => {
    expect(isNonRoutableEmail("s.poppy@auroradance.demo")).toBe(true);
    expect(isSendableParentEmail("s.poppy@auroradance.demo")).toBe(false);
  });

  it("rejects RFC-reserved TLDs that can never accept mail", () => {
    for (const e of [
      "a@foo.test",
      "a@foo.example",
      "a@foo.invalid",
      "a@foo.localhost",
      "a@studio.local",
    ]) {
      expect(isNonRoutableEmail(e), e).toBe(true);
    }
  });

  it("still accepts real addresses, including the NZ TLDs the product targets", () => {
    for (const e of [
      "parent@gmail.com",
      "parent@xtra.co.nz",
      "parent@novadance.co.nz",
      "parent@studio.kiwi",
      "parent@olune.app",
    ]) {
      expect(isNonRoutableEmail(e), e).toBe(false);
      expect(isSendableParentEmail(e), e).toBe(true);
    }
  });

  it("treats malformed addresses as non-routable rather than sending them", () => {
    for (const e of ["", "  ", "no-at-sign", "@nolocal.com", "a@nodot", null, undefined]) {
      expect(isNonRoutableEmail(e as string | null | undefined)).toBe(true);
    }
  });

  it("keeps demo parents out of a mass-email recipient list entirely", () => {
    const kept = dedupeParentsByEmail([
      { id: "1", email: "real@gmail.com", full_name: "Real" },
      { id: "2", email: "s.poppy@auroradance.demo", full_name: "Seed" },
      { id: "3", email: "ghost@x.olune.local", full_name: "Ghost" },
    ]);
    expect(kept.map((p) => p.email)).toEqual(["real@gmail.com"]);
  });
});
