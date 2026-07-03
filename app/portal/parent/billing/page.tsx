// ============================================================================
//  /portal/parent/billing — Invoices, payment history, auto-pay, and Stripe portal.
// ============================================================================

import { createClient } from "@/lib/supabase/server";
import { ParentBillingHub } from "@/components/portal/parent/ParentBillingHub";
import type { AutoPayItem } from "@/components/portal/parent/AutoPaySetup";
import { getAccountBillingSummary } from "@/app/portal/parent/billing/actions";
import { normalizeClassName } from "@/lib/enrollment-billing";

export default async function ParentBillingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [invoicesRes, paymentsRes, ordersRes, guardianshipsRes, subscriptionsRes] =
    await Promise.all([
      supabase
        .from("invoices")
        .select(`
          id, invoice_number, amount_cents, status, due_date, issued_at, paid_at,
          profiles!student_id ( full_name )
        `)
        .eq("payer_id", user!.id)
        .order("issued_at", { ascending: false })
        .limit(50),

      supabase
        .from("payments")
        .select("id, amount_cents, status, created_at, invoice_id, invoices(invoice_number)")
        .eq("payer_id", user!.id)
        .eq("status", "succeeded")
        .order("created_at", { ascending: false })
        .limit(50),

      supabase
        .from("orders")
        .select("id, total_cents, status, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(20),

      supabase
        .from("guardianships")
        .select(`
          student_id,
          profiles!student_id (
            full_name,
            enrollments (
              id,
              status,
              classes ( id, name, price_cents )
            )
          )
        `)
        .eq("guardian_id", user!.id),

      supabase
        .from("subscriptions")
        .select("class_id, student_id, status, stripe_subscription_id, cancel_at_period_end")
        .eq("payer_id", user!.id),
    ]);

  const invoices = (invoicesRes.data ?? []).map((inv) => {
    const student = inv.profiles as unknown as { full_name: string | null } | null;
    return {
      id: inv.id as string,
      invoiceNumber: inv.invoice_number as number,
      amountCents: inv.amount_cents as number,
      status: inv.status as string,
      dueDate: inv.due_date as string | null,
      issuedAt: inv.issued_at as string | null,
      paidAt: inv.paid_at as string | null,
      studentName: student?.full_name ?? null,
    };
  });

  const payments = (paymentsRes.data ?? []).map((p) => {
    const invoice = p.invoices as unknown as { invoice_number: number } | null;
    return {
      id: p.id as string,
      amountCents: p.amount_cents as number,
      status: p.status as string,
      createdAt: p.created_at as string,
      invoiceId: p.invoice_id as string | null,
      invoiceNumber: invoice?.invoice_number ?? null,
    };
  });

  const orders = (ordersRes.data ?? []).map((o) => ({
    id: o.id as string,
    totalCents: o.total_cents as number,
    status: o.status as string,
    createdAt: o.created_at as string,
  }));

  type SubRow = {
    class_id: string | null;
    student_id: string | null;
    status: string;
    stripe_subscription_id: string | null;
    cancel_at_period_end: boolean | null;
  };

  const subByKey = new Map<string, SubRow>(
    ((subscriptionsRes.data ?? []) as SubRow[]).map((s) => [
      `${s.student_id}:${s.class_id}`,
      s,
    ]),
  );

  // A programme (e.g. "Intermediate") can run on multiple days as separate
  // class rows, but the family pays once per programme — mirrors the "pay
  // once per programme name" rule in lib/enrollment-billing.ts. Without this
  // dedup, each day would show its own "set up auto-pay" card and a parent
  // could accidentally create two live subscriptions for one programme.
  const autoPayByProgramme = new Map<string, AutoPayItem>();
  for (const g of guardianshipsRes.data ?? []) {
    const profile = g.profiles as unknown as {
      full_name: string | null;
      enrollments: {
        status: string;
        classes: { id: string; name: string; price_cents: number } | null;
      }[];
    } | null;

    for (const enr of profile?.enrollments ?? []) {
      if (enr.status !== "active" || !enr.classes) continue;
      const cls = enr.classes;
      if ((cls.price_cents ?? 0) <= 0) continue;

      const sub = subByKey.get(`${g.student_id}:${cls.id}`);
      const active =
        sub && ["active", "trialing", "past_due", "incomplete"].includes(sub.status);

      const item: AutoPayItem = {
        studentId: g.student_id as string,
        studentName: profile?.full_name ?? null,
        classId: cls.id,
        className: cls.name,
        priceCents: cls.price_cents ?? 0,
        subscriptionId: active ? (sub!.stripe_subscription_id ?? null) : null,
        status: active ? sub!.status : null,
        cancelAtPeriodEnd: active ? (sub!.cancel_at_period_end ?? false) : false,
      };

      const key = `${g.student_id}:${normalizeClassName(cls.name)}`;
      const existing = autoPayByProgramme.get(key);
      // Prefer the day that already has a live subscription as the
      // representative card; otherwise keep the first day seen.
      if (!existing || (item.subscriptionId && !existing.subscriptionId)) {
        autoPayByProgramme.set(key, item);
      }
    }
  }
  const autoPayItems: AutoPayItem[] = Array.from(autoPayByProgramme.values());

  const stripeConfigured = !!process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  const accountSummaryRes = await getAccountBillingSummary();
  const accountSummary = accountSummaryRes.ok ? accountSummaryRes.data : null;

  return (
    <ParentBillingHub
      invoices={invoices}
      payments={payments}
      orders={orders}
      autoPayItems={autoPayItems}
      stripeConfigured={stripeConfigured}
      accountSummary={accountSummary}
    />
  );
}
