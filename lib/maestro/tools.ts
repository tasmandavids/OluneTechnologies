// ============================================================================
//  Maestro tools — thin, typed wrappers over existing studio services. Each is
//  bound to the request's Supabase client + studioId, so RLS enforces tenant
//  isolation: a tool can only ever read the signed-in owner's studio.
//
//  All tools here are read-only. Email "drafting" is not a tool — the model
//  is instructed (see prompt.ts) to ground drafts in getParentDetail's real
//  contact info and financial facts, then present the draft as plain text
//  for the owner to copy/send themselves. Nothing in this file ever sends
//  anything or writes to the database.
// ============================================================================

import { tool } from "ai";
import { z } from "zod";
import { fetchAccountingSnapshot, fetchUpcomingBills } from "@/lib/xero/accounting-data";
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
  const redirectUri = xeroRedirectUri(origin);

  return {
    getFinancialSnapshot: tool({
      description:
        "Get the studio's current financial position from Xero: income and expenses " +
        "(month-to-date and year-to-date), net profit, and recent sales invoice activity. " +
        "Use this for any question about revenue, costs, profitability, or recent invoices.",
      inputSchema: z.object({}),
      execute: async () => {
        const snapshot = await fetchAccountingSnapshot(supabase, studioId, redirectUri);

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

    getUpcomingBills: tool({
      description:
        "Get supplier bills the studio owes (from Xero), soonest due date first, flagged " +
        "if overdue. Use this for any question about upcoming bills, what's owed, or cashflow " +
        "going out.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await fetchUpcomingBills(supabase, studioId, redirectUri);
        if (!result.configured || !result.connected) {
          return {
            available: false,
            reason: !result.configured
              ? "Xero is not configured for this platform."
              : "This studio has not connected its Xero account yet. Direct the owner to Accounting → Connect Xero.",
          };
        }
        return {
          available: true,
          currency: "cents",
          bills: result.bills,
          fetchWarning: result.fetchError,
        };
      },
    }),

    getBudgetForecast: tool({
      description:
        "Project the studio's finances forward. Combines currently active auto-pay (Stripe " +
        "subscription) recurring revenue with the recent average monthly expense trend from " +
        "Xero. Use this for any 'budget going forward', 'can we afford X', or cashflow-planning " +
        "question. IMPORTANT: this is an estimate with real limitations the tool result will " +
        "spell out — always relay those limitations to the owner, never present the projection " +
        "as certain.",
      inputSchema: z.object({
        months: z
          .number()
          .int()
          .min(1)
          .max(12)
          .default(3)
          .describe("How many months forward to project. Defaults to 3."),
      }),
      execute: async ({ months }) => {
        const [snapshot, subsResult] = await Promise.all([
          fetchAccountingSnapshot(supabase, studioId, redirectUri),
          supabase
            .from("subscriptions")
            .select("amount_cents, interval")
            .eq("studio_id", studioId)
            .eq("status", "active"),
        ]);

        const subs = subsResult.data ?? [];
        const recurringMonthlyIncomeCents = subs.reduce((sum, s) => {
          const monthly = s.interval === "year" ? s.amount_cents / 12 : s.amount_cents;
          return sum + monthly;
        }, 0);

        const series = snapshot.summary?.monthlySeries ?? [];
        const expensedMonths = series.filter((m) => m.expenseCents > 0);
        const avgMonthlyExpenseCents = expensedMonths.length
          ? Math.round(
              expensedMonths.reduce((sum, m) => sum + m.expenseCents, 0) / expensedMonths.length,
            )
          : 0;

        const projectedNetPerMonthCents = Math.round(recurringMonthlyIncomeCents) - avgMonthlyExpenseCents;

        return {
          available: true,
          currency: "cents",
          months,
          recurringMonthlyIncomeCents: Math.round(recurringMonthlyIncomeCents),
          activeAutoPaySubscriptions: subs.length,
          avgMonthlyExpenseCents,
          expenseTrendMonthsUsed: expensedMonths.length,
          projectedNetPerMonthCents,
          projectedTotalNetCents: projectedNetPerMonthCents * months,
          xeroConnected: snapshot.connected,
          limitations: [
            "Recurring income only counts active auto-pay (Stripe) subscriptions — it excludes " +
              "term invoices, one-off payments, shop sales, and event revenue, so real income is " +
              "likely higher than this figure.",
            expensedMonths.length < 3
              ? "Expense trend is based on fewer than 3 months of Xero history, so it may not be reliable."
              : "Expense trend is a simple average of recent months and won't reflect one-off or seasonal costs.",
            !snapshot.connected
              ? "Xero isn't connected, so the expense side of this projection is zero — treat it as income-only."
              : null,
          ].filter((x): x is string => x !== null),
        };
      },
    }),

    getStudioSnapshot: tool({
      description:
        "Get a top-line snapshot of how the studio is doing right now: active student count, " +
        "revenue collected this month, and classes scheduled today. Use this for general " +
        "'how are we doing' or 'give me an overview' questions.",
      inputSchema: z.object({}),
      execute: async () => {
        const startOfMonth = new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1,
        ).toISOString();
        const todayDow = new Date().getDay();

        const [studentsRes, paidRes, todayRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("id", { count: "exact", head: true })
            .eq("role", "student")
            .eq("studio_id", studioId),
          supabase
            .from("invoices")
            .select("amount_cents")
            .eq("studio_id", studioId)
            .eq("status", "paid")
            .gte("created_at", startOfMonth),
          supabase
            .from("classes")
            .select("id", { count: "exact", head: true })
            .eq("studio_id", studioId)
            .eq("day_of_week", todayDow),
        ]);

        const revenueThisMonthCents = (paidRes.data ?? []).reduce(
          (sum, r) => sum + (r.amount_cents ?? 0),
          0,
        );

        return {
          activeStudents: studentsRes.count ?? 0,
          revenueThisMonthCents,
          classesToday: todayRes.count ?? 0,
        };
      },
    }),

    findParent: tool({
      description:
        "Search for a parent/guardian in this studio by name or email. Returns matching " +
        "parents with their id — use the id with getParentDetail to see their family, classes, " +
        "and account balance. Always call this before getParentDetail unless you already have " +
        "the parent's id.",
      inputSchema: z.object({
        query: z.string().min(1).describe("Name or email to search for."),
      }),
      execute: async ({ query }) => {
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("studio_id", studioId)
          .eq("role", "parent")
          .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
          .limit(8);

        return {
          matches: (data ?? []).map((p) => ({
            id: p.id,
            name: p.full_name,
            email: p.email,
            phone: p.phone,
          })),
        };
      },
    }),

    getParentDetail: tool({
      description:
        "Get full detail on one parent/guardian: contact info, their children with active " +
        "classes and recent absences, outstanding invoice balance, most recent invoice, and " +
        "active auto-pay subscriptions. Use this to answer any specific question about a named " +
        "family, and as the source of truth when drafting an email to a parent — never invent " +
        "a parent's balance, classes, or contact details.",
      inputSchema: z.object({
        parentId: z.string().uuid().describe("The parent's profile id, from findParent."),
      }),
      execute: async ({ parentId }) => {
        const { data: parent } = await supabase
          .from("profiles")
          .select("id, full_name, email, phone")
          .eq("id", parentId)
          .eq("studio_id", studioId)
          .eq("role", "parent")
          .maybeSingle();

        if (!parent) {
          return { found: false, reason: "No parent with that id in this studio." };
        }

        const { data: guardianships } = await supabase
          .from("guardianships")
          .select("student_id, profiles!student_id(id, full_name)")
          .eq("guardian_id", parentId);

        const studentIds = (guardianships ?? []).map((g) => g.student_id);

        const [enrollmentsRes, absencesRes, invoicesRes, subsRes] = await Promise.all([
          studentIds.length
            ? supabase
                .from("enrollments")
                .select("student_id, status, classes(name, discipline, day_of_week, start_time)")
                .in("student_id", studentIds)
                .eq("status", "active")
            : Promise.resolve({ data: [] }),
          studentIds.length
            ? supabase
                .from("student_absences")
                .select("student_id, absence_date")
                .in("student_id", studentIds)
                .gte(
                  "absence_date",
                  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
                )
            : Promise.resolve({ data: [] }),
          supabase
            .from("invoices")
            .select("amount_cents, status, due_date, issued_at")
            .eq("payer_id", parentId)
            .eq("studio_id", studioId)
            .order("created_at", { ascending: false }),
          supabase
            .from("subscriptions")
            .select("plan_label, amount_cents, interval, status")
            .eq("payer_id", parentId)
            .eq("studio_id", studioId)
            .eq("status", "active"),
        ]);

        const enrollments = (enrollmentsRes.data ?? []) as unknown as {
          student_id: string;
          classes: { name: string; discipline: string | null; day_of_week: number | null; start_time: string | null } | null;
        }[];
        const absences = (absencesRes.data ?? []) as { student_id: string }[];

        const children = (guardianships ?? []).map((g) => {
          const studentProfile = (
            g as unknown as { profiles: { id: string; full_name: string | null } | null }
          ).profiles;
          return {
            id: g.student_id,
            name: studentProfile?.full_name ?? null,
            activeClasses: enrollments
              .filter((e) => e.student_id === g.student_id && e.classes)
              .map((e) => ({
                name: e.classes!.name,
                discipline: e.classes!.discipline,
                dayOfWeek: e.classes!.day_of_week,
                startTime: e.classes!.start_time,
              })),
            recentAbsences30d: absences.filter((a) => a.student_id === g.student_id).length,
          };
        });

        const invoices = invoicesRes.data ?? [];
        const outstandingBalanceCents = invoices
          .filter((i) => i.status === "sent" || i.status === "overdue")
          .reduce((sum, i) => sum + (i.amount_cents ?? 0), 0);
        const mostRecentInvoice = invoices[0]
          ? {
              amountCents: invoices[0].amount_cents,
              status: invoices[0].status,
              dueDate: invoices[0].due_date,
            }
          : null;

        return {
          found: true,
          currency: "cents",
          parent: { id: parent.id, name: parent.full_name, email: parent.email, phone: parent.phone },
          children,
          billing: {
            outstandingBalanceCents,
            mostRecentInvoice,
            activeSubscriptions: (subsRes.data ?? []).map((s) => ({
              planLabel: s.plan_label,
              amountCents: s.amount_cents,
              interval: s.interval,
            })),
          },
        };
      },
    }),

    getLeadsPipeline: tool({
      description:
        "Get the studio's enrolment leads pipeline: counts by stage (new, contacted, trial, " +
        "converted, lost) and the most recently added leads. Use this for any question about " +
        "trials, prospective families, or growth pipeline.",
      inputSchema: z.object({}),
      execute: async () => {
        const [statusRes, recentRes] = await Promise.all([
          supabase.from("leads").select("status").eq("studio_id", studioId),
          supabase
            .from("leads")
            .select("first_name, last_name, source, status, created_at")
            .eq("studio_id", studioId)
            .order("created_at", { ascending: false })
            .limit(5),
        ]);

        const byStatus: Record<string, number> = {
          new: 0,
          contacted: 0,
          trial: 0,
          converted: 0,
          lost: 0,
        };
        for (const row of statusRes.data ?? []) {
          if (row.status in byStatus) byStatus[row.status] += 1;
        }

        return {
          totalLeads: statusRes.data?.length ?? 0,
          byStatus,
          recentLeads: (recentRes.data ?? []).map((l) => ({
            name: [l.first_name, l.last_name].filter(Boolean).join(" "),
            source: l.source,
            status: l.status,
            createdAt: l.created_at,
          })),
        };
      },
    }),
  };
}

export type MaestroToolSet = ReturnType<typeof buildMaestroTools>;
