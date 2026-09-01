// ============================================================================
//  tests/tenant-search.test.ts
//
//  Studio lookup input handling. The sanitizer is the interesting half: its
//  output is interpolated into a PostgREST `or=(...)` filter, where a comma or
//  a dot does not fail to match — it changes which filter runs. These tests pin
//  that no filter grammar can survive a search term.
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  MIN_STUDIO_QUERY,
  isStudioSlug,
  sanitizeStudioQuery,
} from "@/lib/tenant-search";

describe("sanitizeStudioQuery", () => {
  it("passes an ordinary studio name through", () => {
    expect(sanitizeStudioQuery("Aurora Dance")).toBe("Aurora Dance");
  });

  it("keeps the punctuation real studio names contain", () => {
    expect(sanitizeStudioQuery("Ré's Dance & Co")).toBe("Ré's Dance & Co");
    expect(sanitizeStudioQuery("Te Awa-Nui")).toBe("Te Awa-Nui");
  });

  // The whole point: none of these may reach the filter string intact.
  it("strips every character that means something to a PostgREST filter", () => {
    expect(sanitizeStudioQuery("a,b")).toBe("a b");
    expect(sanitizeStudioQuery("a.ilike.b")).toBe("a ilike b");
    expect(sanitizeStudioQuery("x)or(status.eq.suspended")).toBe("x or status eq suspended");
    expect(sanitizeStudioQuery("aurora*")).toBe("aurora");
    expect(sanitizeStudioQuery("aurora%")).toBe("aurora");
    expect(sanitizeStudioQuery('a"b')).toBe("a b");
  });

  it("never returns a string containing filter grammar", () => {
    const nasty = ['a,b', 'a.b', 'a(b)', 'a*b', 'a%b', 'a"b', "a\\b", "a:b"];
    for (const input of nasty) {
      const out = sanitizeStudioQuery(input);
      if (out === null) continue;
      expect(out).not.toMatch(/[,.()*%"\\:]/);
    }
  });

  it("collapses runs of whitespace rather than leaving gaps behind", () => {
    expect(sanitizeStudioQuery("  Aurora   ,,,   Dance  ")).toBe("Aurora Dance");
  });

  it("rejects a query too short to narrow anything", () => {
    expect(sanitizeStudioQuery("")).toBeNull();
    expect(sanitizeStudioQuery("a")).toBeNull();
    expect(sanitizeStudioQuery("   ")).toBeNull();
    // Long enough before sanitizing, too short after.
    expect(sanitizeStudioQuery("...")).toBeNull();
    expect(sanitizeStudioQuery("ab")).toHaveLength(MIN_STUDIO_QUERY);
  });

  it("rejects non-strings rather than coercing them", () => {
    expect(sanitizeStudioQuery(null)).toBeNull();
    expect(sanitizeStudioQuery(undefined)).toBeNull();
    expect(sanitizeStudioQuery(42)).toBeNull();
    expect(sanitizeStudioQuery(["aurora"])).toBeNull();
  });

  it("bounds a pasted wall of text", () => {
    expect(sanitizeStudioQuery("x".repeat(500))).toHaveLength(60);
  });
});

describe("isStudioSlug", () => {
  it("accepts what a subdomain label can be", () => {
    expect(isStudioSlug("aurora")).toBe(true);
    expect(isStudioSlug("aurora-dance")).toBe(true);
    expect(isStudioSlug("studio2")).toBe(true);
  });

  it("rejects anything that could not be a subdomain", () => {
    expect(isStudioSlug("Aurora")).toBe(false); // slugs are lowercase
    expect(isStudioSlug("-aurora")).toBe(false);
    expect(isStudioSlug("aurora-")).toBe(false);
    expect(isStudioSlug("aurora dance")).toBe(false);
    expect(isStudioSlug("aurora.dance")).toBe(false);
    expect(isStudioSlug("")).toBe(false);
    expect(isStudioSlug(null)).toBe(false);
    expect(isStudioSlug(undefined)).toBe(false);
    expect(isStudioSlug("x".repeat(64))).toBe(false);
  });

  it("accepts a single-character slug", () => {
    expect(isStudioSlug("a")).toBe(true);
  });
});
