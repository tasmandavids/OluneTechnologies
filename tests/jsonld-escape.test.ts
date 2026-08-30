// ============================================================================
//  The JSON-LD payload is embedded in a <script> tag via dangerouslySetInnerHTML
//  and carries studio-admin free text (studio name, tagline, contact details).
//  JSON.stringify alone does not escape `<`, so these cases are the difference
//  between structured data and stored XSS on a studio's public homepage.
// ============================================================================

import { describe, it, expect } from "vitest";
import { escapeJsonForScript } from "@/lib/seo/json-ld";

describe("escapeJsonForScript", () => {
  it("does not let a studio name close the script tag", () => {
    const out = escapeJsonForScript({
      name: '</script><script>alert(document.cookie)</script>',
    });

    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("\\u003c");
  });

  it("escapes every angle bracket and ampersand, wherever it appears", () => {
    const out = escapeJsonForScript({ description: "Ballet & Jazz <5yrs>" });

    expect(out).not.toMatch(/[<>&]/);
    expect(out).toContain("\\u0026");
  });

  it("escapes the JS line terminators that are legal inside JSON", () => {
    const out = escapeJsonForScript({ tagline: "line\u2028break\u2029here" });

    expect(out).not.toMatch(/[\u2028\u2029]/);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
  });

  it("still parses back to the original object — escaping must not corrupt the data", () => {
    const data = {
      "@type": "ExerciseGym",
      name: "Ampersand & <Co> Dance",
      tagline: "sharp\u2028edges",
      email: "hi@studio.co.nz",
    };

    expect(JSON.parse(escapeJsonForScript(data))).toEqual(data);
  });

  it("leaves an ordinary payload byte-identical to JSON.stringify", () => {
    const data = { "@type": "ExerciseGym", name: "Northland Dance Academy" };

    expect(escapeJsonForScript(data)).toBe(JSON.stringify(data));
  });
});
