import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  addProjectDomain,
  getProjectDomainStatus,
  isVercelDomainsConfigured,
  removeProjectDomain,
} from "@/lib/vercel/domains";

// ============================================================================
//  The domain client's whole job is to never throw and never overstate. These
//  tests pin the three behaviours the wizard depends on:
//    • unconfigured deployments degrade to a typed error, not an exception
//    • an already-claimed domain reads as success, a foreign claim does not
//    • an unreadable config is reported as misconfigured, never as live
// ============================================================================

type FetchCall = { url: string; init: RequestInit | undefined };

let calls: FetchCall[] = [];

/** Queue of responses, consumed in order by the stubbed fetch. */
function stubFetch(responses: Array<{ status: number; body?: unknown }>) {
  const queue = [...responses];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      const next = queue.shift() ?? { status: 500, body: {} };
      return {
        status: next.status,
        json: async () => next.body ?? {},
      } as Response;
    }),
  );
}

const ENV_KEYS = ["VERCEL_API_TOKEN", "VERCEL_PROJECT_ID", "VERCEL_TEAM_ID"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  calls = [];
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.VERCEL_API_TOKEN = "tok_test";
  process.env.VERCEL_PROJECT_ID = "prj_test";
  delete process.env.VERCEL_TEAM_ID;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("configuration", () => {
  it("reports configured when token and project are present", () => {
    expect(isVercelDomainsConfigured()).toBe(true);
  });

  it("reports unconfigured when the token is missing", () => {
    delete process.env.VERCEL_API_TOKEN;
    expect(isVercelDomainsConfigured()).toBe(false);
  });

  it("returns a typed error rather than throwing when unconfigured", async () => {
    delete process.env.VERCEL_PROJECT_ID;
    const res = await addProjectDomain("www.mystudio.co.nz");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not configured/i);
  });
});

describe("addProjectDomain", () => {
  it("claims a new hostname", async () => {
    stubFetch([{ status: 200, body: { name: "www.mystudio.co.nz", verified: true } }]);
    const res = await addProjectDomain("  HTTPS://WWW.MyStudio.co.nz/  ");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ alreadyRegistered: false, verified: true });

    // Domain is normalized before it reaches the API.
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ name: "www.mystudio.co.nz" });
    expect(calls[0].url).toContain("/v10/projects/prj_test/domains");
  });

  it("treats a domain already on this project as success", async () => {
    stubFetch([
      { status: 409, body: { error: { code: "domain_already_in_use_by_this_project" } } },
      { status: 200, body: { verified: true } }, // status re-read
      { status: 200, body: { misconfigured: false } },
    ]);
    const res = await addProjectDomain("www.mystudio.co.nz");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.alreadyRegistered).toBe(true);
  });

  it("surfaces a domain held by another project as a real error", async () => {
    stubFetch([{ status: 409, body: { error: { code: "domain_already_in_use" } } }]);
    const res = await addProjectDomain("www.mystudio.co.nz");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/different Vercel project/i);
  });

  it("does not throw when the network fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const res = await addProjectDomain("www.mystudio.co.nz");

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("ECONNRESET");
  });

  it("passes teamId when the project is team-owned", async () => {
    process.env.VERCEL_TEAM_ID = "team_abc";
    stubFetch([{ status: 200, body: { verified: false } }]);
    await addProjectDomain("www.mystudio.co.nz");

    expect(calls[0].url).toContain("teamId=team_abc");
  });
});

describe("removeProjectDomain", () => {
  it("treats a missing domain as already removed", async () => {
    stubFetch([{ status: 404, body: {} }]);
    expect((await removeProjectDomain("gone.example.com")).ok).toBe(true);
  });

  it("no-ops on an empty domain without calling the API", async () => {
    stubFetch([]);
    expect((await removeProjectDomain("")).ok).toBe(true);
    expect(calls).toHaveLength(0);
  });
});

describe("getProjectDomainStatus", () => {
  it("reports a live domain", async () => {
    stubFetch([
      { status: 200, body: { verified: true, verification: [] } },
      { status: 200, body: { misconfigured: false } },
    ]);
    const res = await getProjectDomainStatus("www.mystudio.co.nz");

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toMatchObject({ registered: true, verified: true, misconfigured: false });
    }
  });

  it("reports an unclaimed domain as unregistered rather than erroring", async () => {
    stubFetch([
      { status: 404, body: {} },
      { status: 404, body: {} },
    ]);
    const res = await getProjectDomainStatus("www.mystudio.co.nz");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.registered).toBe(false);
  });

  it("counts an unreadable config as misconfigured, never as live", async () => {
    stubFetch([
      { status: 200, body: { verified: true, verification: [] } },
      { status: 500, body: {} },
    ]);
    const res = await getProjectDomainStatus("www.mystudio.co.nz");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.misconfigured).toBe(true);
  });

  it("passes through ownership challenge records", async () => {
    const challenge = { type: "TXT", domain: "_vercel.mystudio.co.nz", value: "vc-domain-verify=x" };
    stubFetch([
      { status: 200, body: { verified: false, verification: [challenge] } },
      { status: 200, body: { misconfigured: true } },
    ]);
    const res = await getProjectDomainStatus("www.mystudio.co.nz");

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.verification).toEqual([challenge]);
  });
});
