// ============================================================================
//  Maestro tools — thin, typed wrappers over existing studio services. Each is
//  bound to the request's Supabase client + studioId, so RLS enforces tenant
//  isolation: a tool can only ever read the signed-in owner's studio.
//
//  Phase 1 ships read-only tools. Write/send tools (draft email, etc.) land in
//  a later phase and must return drafts for human approval, never auto-execute.
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { fetchAccountingSnapshot } from "@/lib/xero/accounting-data";
import { xeroRedirectUri } from "@/lib/xero/config";
import type { PortalSession } from "@/lib/portal/session";

type ToolContext = {
  session: PortalSession;
  /** App origin for building the Xero redirect URI (token refresh needs it). */
  origin: string;
};

/** Build the tool set for a single request, closed over the tenant context. */
export function buildMaestroTools({ session, origin }: ToolContext) {
  const { supabase, studioId } = session;

  return {
    getFinancialSnapshot: tool({
      description:
        "Get the studio's current financial position from Xero: income and expenses " +
        "(month-to-date and year-to-date), net profit, and recent invoice activity. " +
        "Use this for any question about revenue, costs, profitability, or recent invoices.",
      inputSchema: z.object({}),
      execute: async () => {
        const snapshot = await fetchAccountingSnapshot(
          supabase,
          studioId,
          xeroRedirectUri(origin),
        );

        if (!snapshot.configured) {
          return {
            available: false,
            reason:
              "Xero is not configured for this platform. The owner cannot see live " +
              "financials until Xero API credentials are set up.",
          };
        }
        if (!snapshot.connected) {
          return {
            available: false,
            reason:
              "This studio has not connected its Xero account yet. Direct the owner to " +
              "Accounting → Connect Xero.",
          };
        }

        const s = snapshot.summary;
        return {
          available: true,
          currency: "cents",
          organisation: snapshot.connection?.tenant_name ?? null,
          summary: s && {
            incomeMonthToDateCents: s.incomeMtdCents,
            expenseMonthToDateCents: s.expenseMtdCents,
            netMonthToDateCents: s.netMtdCents,
            incomeYearToDateCents: s.incomeYtdCents,
            expenseYearToDateCents: s.expenseYtdCents,
            netYearToDateCents: s.netYtdCents,
          },
          recentActivity: snapshot.activity,
          fetchWarning: snapshot.fetchError,
        };
      },
    }),
  };
}

export type MaestroToolSet = ReturnType<typeof buildMaestroTools>;
