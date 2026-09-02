import { describe, it, expect } from "vitest";
import { sentryIngestOrigin } from "@/lib/observability/dsn";
import {
  REDACTED,
  redactHeaders,
  redactQueryString,
  redactUrl,
  scrubEvent,
} from "@/lib/observability/scrub";

describe("sentryIngestOrigin", () => {
  it("reduces a DSN to the origin the browser SDK posts to", () => {
    // The public key is credentials, not part of the origin — a CSP entry
    // carrying it would be both wrong and a secret in a response header.
    expect(sentryIngestOrigin("https://abc123@o4509.ingest.us.sentry.io/4510")).toBe(
      "https://o4509.ingest.us.sentry.io",
    );
  });

  it("keeps a non-default port", () => {
    expect(sentryIngestOrigin("https://k@sentry.internal:9000/2")).toBe("https://sentry.internal:9000");
  });

  it("returns null when Sentry isn't configured", () => {
    // The CSP then carries no Sentry host at all, which is correct: nothing
    // is going to try to reach one.
    expect(sentryIngestOrigin(undefined)).toBeNull();
    expect(sentryIngestOrigin("")).toBeNull();
    expect(sentryIngestOrigin(null)).toBeNull();
  });

  it("returns null rather than throwing on a malformed DSN", () => {
    // A typo'd DSN must not take the build down with it.
    expect(sentryIngestOrigin("not-a-url")).toBeNull();
    expect(sentryIngestOrigin("javascript:alert(1)")).toBeNull();
    expect(sentryIngestOrigin("file:///etc/passwd")).toBeNull();
  });
});

describe("redactQueryString", () => {
  it("redacts sensitive values and leaves the rest legible", () => {
    expect(redactQueryString("studioId=abc&secret=hunter2&page=2")).toBe(
      `studioId=abc&secret=${REDACTED}&page=2`,
    );
  });

  it("matches on substrings, so provider-specific names are covered too", () => {
    const out = redactQueryString("access_token=x&stripe_signature=y&reset_code=z");
    expect(out).not.toContain("x");
    expect(out).not.toContain("y");
    expect(out).not.toContain("z");
  });

  it("redacts contact details — these identify a family", () => {
    expect(redactQueryString("email=parent@example.com&phone=0211234567")).toBe(
      `email=${REDACTED}&phone=${REDACTED}`,
    );
  });

  it("leaves valueless flags alone", () => {
    expect(redactQueryString("debug&page=1")).toBe("debug&page=1");
  });
});

describe("redactUrl", () => {
  it("keeps the path — that's the part that says where it broke", () => {
    expect(redactUrl("https://olune.app/api/cron/notifications?secret=abc&limit=50")).toBe(
      `https://olune.app/api/cron/notifications?secret=${REDACTED}&limit=50`,
    );
  });

  it("preserves the fragment", () => {
    expect(redactUrl("https://olune.app/p?token=t#section")).toBe(
      `https://olune.app/p?token=${REDACTED}#section`,
    );
  });

  it("passes through a URL with no query", () => {
    expect(redactUrl("https://olune.app/portal/admin")).toBe("https://olune.app/portal/admin");
    expect(redactUrl("")).toBe("");
  });
});

describe("redactHeaders", () => {
  it("strips auth-bearing headers and keeps the diagnostic ones", () => {
    expect(
      redactHeaders({
        "Content-Type": "application/json",
        Authorization: "Bearer supersecret",
        Cookie: "sb-access-token=abc",
        "stripe-signature": "t=1,v1=deadbeef",
      }),
    ).toEqual({
      "Content-Type": "application/json",
      Authorization: REDACTED,
      Cookie: REDACTED,
      "stripe-signature": REDACTED,
    });
  });
});

describe("scrubEvent", () => {
  it("removes the request body outright", () => {
    // An enrollment POST body carries a child's name, birth date and medical
    // notes. There is no version of it we want in a third-party tool.
    const event = scrubEvent({
      request: {
        url: "https://olune.app/api/enrol",
        data: { childName: "Ana", medicalNotes: "asthma" },
        cookies: { "sb-access-token": "abc" },
      },
    });

    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
  });

  it("redacts the request URL and headers in place", () => {
    const event = scrubEvent({
      request: {
        url: "https://olune.app/api/cron/sweep-unpaid?secret=abc",
        headers: { Authorization: "Bearer x", "User-Agent": "vercel-cron/1.0" },
      },
    });

    expect(event.request?.url).toBe(`https://olune.app/api/cron/sweep-unpaid?secret=${REDACTED}`);
    expect(event.request?.headers).toEqual({
      Authorization: REDACTED,
      "User-Agent": "vercel-cron/1.0",
    });
  });

  it("drops a non-string query_string rather than guessing at its shape", () => {
    const event = scrubEvent({
      request: { query_string: [["secret", "abc"]] as unknown },
    });
    expect(event.request?.query_string).toBeUndefined();
  });

  it("redacts breadcrumb URLs — a logged fetch leaks just as well", () => {
    const event = scrubEvent({
      breadcrumbs: [
        { data: { url: "https://api.example.com/x?api_key=abc", method: "GET" } },
        { data: undefined },
        {},
      ],
    });

    expect(event.breadcrumbs?.[0]?.data?.url).toBe(`https://api.example.com/x?api_key=${REDACTED}`);
    expect(event.breadcrumbs?.[0]?.data?.method).toBe("GET");
  });

  it("handles an event with nothing to scrub", () => {
    expect(scrubEvent({})).toEqual({});
  });
});
