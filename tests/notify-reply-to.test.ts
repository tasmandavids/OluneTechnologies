import { describe, it, expect, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolveStudioReplyTo,
  createStudioReplyToResolver,
} from "@/lib/notify/reply-to";

/**
 * Minimal stand-in for the two chained queries the resolver makes: the branding
 * row, then the oldest admin. Counts round trips so the cache can be asserted.
 */
function fakeClient(opts: {
  contactEmail?: unknown;
  ownerEmail?: string | null;
}): { client: SupabaseClient; calls: () => number } {
  let calls = 0;
  const client = {
    from(table: string) {
      calls += 1;
      const row =
        table === "studio_branding"
          ? { site_settings: { contactEmail: opts.contactEmail } }
          : { email: opts.ownerEmail ?? null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "limit"]) {
        chain[m] = () => chain;
      }
      chain.maybeSingle = async () => ({ data: row });
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, calls: () => calls };
}

describe("resolveStudioReplyTo", () => {
  it("prefers the address the studio publishes on its own site", async () => {
    const { client } = fakeClient({
      contactEmail: "support@novadance.co.nz",
      ownerEmail: "owner@gmail.com",
    });
    expect(await resolveStudioReplyTo(client, "s1")).toBe("support@novadance.co.nz");
  });

  it("falls back to the owner — only 1 of 7 studios sets a contact email", async () => {
    const { client } = fakeClient({ contactEmail: undefined, ownerEmail: "owner@gmail.com" });
    expect(await resolveStudioReplyTo(client, "s1")).toBe("owner@gmail.com");
  });

  it("returns undefined rather than a non-routable address, so the global default applies", async () => {
    const { client } = fakeClient({
      contactEmail: "hello@studio.demo",
      ownerEmail: "owner@x.olune.local",
    });
    expect(await resolveStudioReplyTo(client, "s1")).toBeUndefined();
  });

  it("ignores a malformed or non-string contact email", async () => {
    for (const bad of [42, "", "   ", null, { a: 1 }]) {
      const { client } = fakeClient({ contactEmail: bad, ownerEmail: null });
      expect(await resolveStudioReplyTo(client, "s1")).toBeUndefined();
    }
  });
});

describe("createStudioReplyToResolver", () => {
  it("resolves a studio once no matter how many messages it sends", async () => {
    const { client, calls } = fakeClient({ contactEmail: "a@studio.co.nz" });
    const resolve = createStudioReplyToResolver(client);
    const all = await Promise.all([resolve("s1"), resolve("s1"), resolve("s1")]);
    expect(all).toEqual(["a@studio.co.nz", "a@studio.co.nz", "a@studio.co.nz"]);
    expect(calls()).toBe(1); // one branding lookup, not three
  });

  it("keeps studios separate", async () => {
    const { client, calls } = fakeClient({ contactEmail: "a@studio.co.nz" });
    const resolve = createStudioReplyToResolver(client);
    await Promise.all([resolve("s1"), resolve("s2")]);
    expect(calls()).toBe(2);
  });

  it("short-circuits a null studio without querying", async () => {
    const { client, calls } = fakeClient({ contactEmail: "a@studio.co.nz" });
    const resolve = createStudioReplyToResolver(client);
    expect(await resolve(null)).toBeUndefined();
    expect(await resolve(undefined)).toBeUndefined();
    expect(calls()).toBe(0);
  });
});

describe("sendEmail reply-to precedence", () => {
  const orig = { ...process.env };

  async function capture(replyTo: string | undefined, globalReply?: string) {
    process.env.RESEND_API_KEY = "re_test";
    process.env.RESEND_FROM = "Olune <noreply@olune.co.nz>";
    if (globalReply) process.env.RESEND_REPLY_TO = globalReply;
    else delete process.env.RESEND_REPLY_TO;

    let body: Record<string, unknown> = {};
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => {
      body = JSON.parse(init.body as string);
      return { ok: true, json: async () => ({ id: "1" }) } as unknown as Response;
    });
    const { sendEmail } = await import("@/lib/notify/providers");
    await sendEmail({ to: "p@gmail.com", subject: "s", html: "h", text: "t", replyTo });
    vi.unstubAllGlobals();
    process.env = { ...orig };
    return body;
  }

  it("uses the studio address over the platform default", async () => {
    const b = await capture("studio@novadance.co.nz", "support@olune.co.nz");
    expect(b.reply_to).toBe("studio@novadance.co.nz");
  });

  it("falls back to the platform default for Olune's own mail", async () => {
    const b = await capture(undefined, "support@olune.co.nz");
    expect(b.reply_to).toBe("support@olune.co.nz");
  });

  it("omits reply_to entirely when neither is set", async () => {
    const b = await capture(undefined, undefined);
    expect("reply_to" in b).toBe(false);
  });
});
