import { describe, expect, it } from "vitest";
import { loadAccountingSetup, resolveAccountingProvider } from "@/lib/accounting/provider";
import type { IntegrationsQueryClient } from "@/lib/integrations/state";

// A studio's accounting choice is studios.accounting_provider, and it only
// counts while the system behind it exists. These pin the rules in
// lib/accounting/provider.ts that every Xero push, Books post and Money screen
// now depends on.

type Rows = Record<string, Record<string, unknown>[]>;

function fakeClient(rows: Rows): IntegrationsQueryClient {
  return {
    from: (table: string) => ({
      select: () => ({
        eq: async () => ({ data: rows[table] ?? [] }),
      }),
    }),
  } as unknown as IntegrationsQueryClient;
}

const XERO = { tenant_name: "Nova Dance Ltd", org_short_code: "!abc", sync_error: null };
const BOOKS = { jurisdiction: "NZ", base_currency: "NZD", last_synced_at: null };

describe("accounting choice", () => {
  it("is null when nothing is chosen or connected", async () => {
    const setup = await loadAccountingSetup(fakeClient({ studios: [{ accounting_provider: null }] }), "s");
    expect(setup.choice).toBeNull();
    expect(await resolveAccountingProvider(fakeClient({ studios: [{ accounting_provider: null }] }), "s")).toBeNull();
  });

  it("follows the recorded choice", async () => {
    const xero = await resolveAccountingProvider(
      fakeClient({ studios: [{ accounting_provider: "xero" }], xero_connections: [XERO] }),
      "s",
    );
    expect(xero).toMatchObject({ provider: "xero", accountLabel: "Nova Dance Ltd" });

    const books = await resolveAccountingProvider(
      fakeClient({ studios: [{ accounting_provider: "olune" }], ledger_settings: [BOOKS] }),
      "s",
    );
    expect(books).toMatchObject({ provider: "olune", accountLabel: "NZ · NZD" });
  });

  it("treats paused Books (rows kept, choice cleared) as not chosen", async () => {
    const client = fakeClient({ studios: [{ accounting_provider: null }], ledger_settings: [BOOKS] });
    const setup = await loadAccountingSetup(client, "s");
    expect(setup.choice).toBeNull();
    expect(setup.books).not.toBeNull();
    expect(await resolveAccountingProvider(client, "s")).toBeNull();
  });

  it("drops a Xero choice whose connection is gone, so the studio is asked again", async () => {
    const client = fakeClient({ studios: [{ accounting_provider: "xero" }] });
    expect((await loadAccountingSetup(client, "s")).choice).toBeNull();
  });

  it("never lets a leftover Xero row override a Books choice", async () => {
    const client = fakeClient({
      studios: [{ accounting_provider: "olune" }],
      ledger_settings: [BOOKS],
      xero_connections: [XERO],
    });
    expect((await resolveAccountingProvider(client, "s"))?.provider).toBe("olune");
  });

  it("still recognises a Xero studio from before the choice was recorded", async () => {
    const client = fakeClient({ studios: [{ accounting_provider: null }], xero_connections: [XERO] });
    expect((await loadAccountingSetup(client, "s")).choice).toBe("xero");
  });
});
