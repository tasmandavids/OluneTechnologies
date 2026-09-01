import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizedCron } from "@/lib/cron/auth";
import { reportHandledError } from "@/lib/observability/report";
import { runSubscriptionInvoicesForStudio, runTermInvoicesForStudio } from "@/lib/subscriptions/cron-run";
import { studioLocalYmd, studioLocalYmdOffset } from "@/lib/date/studio-date";

export const dynamic = "force-dynamic";

const localYmd = studioLocalYmd;

/** Local calendar date `ymd` minus `days`, as "YYYY-MM-DD". */
function subtractDays(ymd: string, days: number): string {
  return studioLocalYmdOffset(-days, undefined, new Date(`${ymd}T12:00:00Z`));
}

export async function GET(req: NextRequest) {
  if (!authorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let supabase;
  try {
    supabase = createAdminClient();
  } catch (e) {
    await reportHandledError(e, {
      route: "cron.subscription-invoices",
      tags: { reason: "admin-client" },
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Admin client unavailable" },
      { status: 500 },
    );
  }

  const { data: studios } = await supabase.from("studios").select("id, timezone, billing_period");
  const results: Record<string, unknown> = {};

  for (const studio of studios ?? []) {
    const tz = (studio.timezone as string | null) || "Pacific/Auckland";
    const ymd = localYmd(tz);
    const billingPeriod = (studio.billing_period as string | null) ?? "monthly";

    if (billingPeriod === "termly") {
      const { data: terms } = await supabase
        .from("studio_terms")
        .select("id, name, start_date, end_date, invoice_lead_days")
        .eq("studio_id", studio.id as string);

      const dueTerms = (terms ?? []).filter(
        (t) => subtractDays(t.start_date as string, t.invoice_lead_days as number) === ymd,
      );

      if (dueTerms.length === 0) {
        results[studio.id as string] = { skipped: true, reason: "no_term_due_today", localDate: ymd };
        continue;
      }

      const outcomes = [];
      for (const term of dueTerms) {
        const outcome = await runTermInvoicesForStudio(supabase, studio.id as string, {
          id: term.id as string,
          name: term.name as string,
          start_date: term.start_date as string,
          end_date: term.end_date as string,
        });
        outcomes.push({ termId: term.id, ...outcome });
      }
      results[studio.id as string] = { billingPeriod, localDate: ymd, terms: outcomes };
      continue;
    }

    const day = Number(ymd.slice(8, 10));
    if (day !== 1) {
      results[studio.id as string] = { skipped: true, reason: "not_first_of_month", localDate: ymd };
      continue;
    }

    const billingMonth = ymd.slice(0, 7);
    const outcome = await runSubscriptionInvoicesForStudio(supabase, studio.id as string, billingMonth);
    results[studio.id as string] = { billingMonth, ...outcome };
  }

  return NextResponse.json({ ok: true, results });
}
