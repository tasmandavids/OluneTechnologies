// ============================================================================
//  Regression guard: the email panes render UNTRUSTED HTML.
//
//  Both inboxes drop a raw message body into an iframe srcDoc. Anyone who can
//  email the studio controls that HTML, so the sandbox attribute is the only
//  thing standing between an inbound message and script execution against a
//  signed-in admin session.
//
//  The admin pane deliberately carries `allow-same-origin` so the parent frame
//  can measure the rendered height. That is safe ONLY while `allow-scripts` is
//  absent: the two together are explicitly specified as escaping the sandbox,
//  and the frame would then run attacker script on our own origin. This is a
//  one-token mistake for a future editor to make while chasing a layout bug,
//  and nothing else in the codebase would fail if they made it.
//
//  Asserted against the source text rather than a render, because the test
//  harness is node-only and cannot mount JSX.
// ============================================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function source(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../${relativePath}`, import.meta.url)), "utf8");
}

const PANES = [
  "components/admin/email/EmailInbox.tsx",
  "components/portal/parent/ParentEmailInbox.tsx",
];

describe("email iframe sandboxing", () => {
  it.each(PANES)("%s renders untrusted mail inside a sandboxed frame", (path) => {
    const src = source(path);

    expect(src).toContain("srcDoc");
    expect(src).toMatch(/sandbox=/);
  });

  it.each(PANES)("%s never combines allow-scripts with allow-same-origin", (path) => {
    const src = source(path);

    for (const [, value] of src.matchAll(/sandbox="([^"]*)"/g)) {
      const tokens = value.split(/\s+/).filter(Boolean);
      const escapesSandbox =
        tokens.includes("allow-scripts") && tokens.includes("allow-same-origin");

      expect(
        escapesSandbox,
        `sandbox="${value}" lets untrusted email HTML run script on our own origin`,
      ).toBe(false);
    }
  });

  it.each(PANES)("%s never drops the sandbox attribute entirely", (path) => {
    const src = source(path);

    // An iframe with srcDoc and no sandbox= at all is fully trusted.
    const frames = src.match(/<iframe\b[\s\S]*?\/>/g) ?? [];
    expect(frames.length).toBeGreaterThan(0);

    for (const frame of frames) {
      if (!frame.includes("srcDoc")) continue;
      expect(frame, "srcDoc iframe with no sandbox attribute").toMatch(/sandbox=/);
    }
  });
});
