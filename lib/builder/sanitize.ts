// ============================================================================
//  lib/builder/sanitize.ts — HTML sanitizer for `embed` nodes.
//
//  Once a builder document is published, an `embed` node's raw HTML is served to
//  ANONYMOUS visitors. Even though the author is an authenticated admin, that is
//  a stored-XSS surface (a compromised admin, or an admin pasting hostile
//  third-party "embed" code). This parses the markup with `sanitize-html` (a
//  real allow-list DOM-aware sanitizer, not a regex pass) so malformed/nested
//  tags, encoded attributes, and handler-name tricks can't slip through, while
//  preserving benign markup and allowlisted embed iframes (YouTube, Vimeo, Maps…).
// ============================================================================

import sanitizeHtmlLib from "sanitize-html";

/** Hosts whose <iframe src> is allowed to survive sanitization. */
const ALLOWED_IFRAME_HOSTS = [
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
  "player.vimeo.com",
  "vimeo.com",
  "google.com",
  "maps.google.com",
  "open.spotify.com",
  "w.soundcloud.com",
  "embed.music.apple.com",
  "calendly.com",
  "form.typeform.com",
  "docs.google.com",
];

function hostAllowed(src: string | undefined): boolean {
  if (!src) return false;
  try {
    const host = new URL(src, "https://placeholder.invalid").hostname.replace(/^www\./, "");
    return ALLOWED_IFRAME_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// `style` is deliberately excluded: sanitize-html doesn't filter the CSS it
// contains (confirmed — `<style>body{background:url(javascript:...)}</style>`
// passes through untouched), so allowing the tag would reopen a CSS-injection
// hole. h1/h2/span are already in the library defaults; listed here only for
// documentation.
const ALLOWED_TAGS = [...sanitizeHtmlLib.defaults.allowedTags, "iframe", "img", "h1", "h2", "span"];

export function sanitizeEmbedHtml(html: string | undefined | null): string {
  if (!html) return "";

  return sanitizeHtmlLib(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      "*": ["class", "id", "title", "aria-*", "data-*"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "loading"],
      iframe: ["src", "width", "height", "frameborder", "allow", "allowfullscreen", "loading", "title"],
    },
    // Only http(s) survive in any URL attribute — kills javascript:, vbscript:,
    // data:text/html, etc. outright rather than trying to pattern-match them.
    allowedSchemes: ["http", "https"],
    allowProtocolRelative: false,
    // We enforce our own iframe host allowlist (with subdomain matching)
    // rather than the library's exact-hostname list.
    exclusiveFilter: (frame) => frame.tag === "iframe" && !hostAllowed(frame.attribs.src),
  });
}
