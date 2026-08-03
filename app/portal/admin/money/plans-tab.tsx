// ============================================================================
//  Plans tab (Money) — term instalment plans + auto-pay subscriptions, the
//  two recurring/instalment billing arrangements the app supports. Both
//  loaders are copied verbatim from the old billing sub-tabs (payment-plans
//  and subscriptions); types still live at their original page.tsx files
//  until the old routes are retired.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { getTranslations } from "@/lib/i18n/server";
import { TermPaymentPlansManager } from "@/components/admin/payment-plans/TermPaymentPlansManager";
import SubscriptionsManager from "@/components/admin/subscriptions/SubscriptionsManager";
import type {
  PayerOption,
  TermPlan,
  UnpaidInvoice,
} from "@/app/portal/admin/payment-plans/page";
import type {
  ClassOption,
  ParentOption,
  ProductOption,
  SubscriptionRow,
} from "@/app/portal/admin/subscriptions/page";

async function PaymentPlansSection() {
  const { supabase, studioId } = await requirePortalSession();

  const [plansRes, payersRes, invoicesRes] = await Promise.all([
    supabase
      .from("term_payment_plans")
      .select(`
        id, payer_id, total_cents, installment_count, installment_amounts,
        installments_paid, amount_paid_cents, next_due_date, status, created_at,
        payer:profiles!payer_id ( full_name )
      `)
      .eq("studio_id", studioId)
      .order("created_at", { ascending: false })
      .limit(100),

    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("studio_id", studioId)
      .eq("role", "parent")
      .order("full_name"),

    supabase
      .from("invoices")
      .select("id, invoice_number, amount_cents, payer_id, description")
      .eq("studio_id", studioId)
      .in("status", ["sent", "overdue"])
      .is("term_payment_plan_id", null)
      .order("issued_at", { ascending: false })
      .limit(200),
  ]);

  const plans: TermPlan[] = (plansRes.data ?? []).map((p) => {
    const payer = p.payer as unknown as { full_name: string | null } | null;
    return {
      id: p.id,
      payerId: p.payer_id,
      payerName: payer?.full_name ?? null,
      totalCents: p.total_cents,
      installmentCount: p.installment_count,
      installmentAmounts: p.installment_amounts as number[],
      installmentsPaid: p.installments_paid,
      amountPaidCents: p.amount_paid_cents,
      nextDueDate: p.next_due_date ?? null,
      status: p.status as TermPlan["status"],
      createdAt: p.created_at,
    };
  });

  const payers: PayerOption[] = (payersRes.data ?? []).map((p) => ({
    id: p.id, name: p.full_name ?? "Parent", email: p.email ?? null,
  }));

  const unpaidInvoices: UnpaidInvoice[] = (invoicesRes.data ?? []).map((i) => ({
    id: i.id,
    invoiceNumber: i.invoice_number,
    amountCents: i.amount_cents,
    payerId: i.payer_id,
    description: i.description ?? null,
  }));

  return <TermPaymentPlansManager plans={plans} payers={payers} unpaidInvoices={unpaidInvoices} />;
}

async function SubscriptionsSection() {
  const { supabase, studioId } = await requirePortalSession();
  const tCommon = await getTranslations("common");

  const [subsRes, parentsRes, classesRes, productsRes, guardianshipsRes] = await Promise.all([
    supabase
      .from("subscriptions")
      .select(
        "id, stripe_subscription_id, plan_label, amount_cents, monthly_amount_cents, billing_interval, interval, status, current_period_end, cancel_at_period_end, admin_created, payer_id, student_id, class_id",
      )
      .eq("studio_id", studioId ?? "")
      .order("created_at", { ascending: false }),

    supabase
      .from("profiles")
      .select("id, full_name")
      .eq("studio_id", studioId ?? "")
      .eq("role", "parent")
      .order("full_name"),

    supabase
      .from("classes")
      .select("id, name, price_cents")
      .eq("studio_id", studioId ?? "")
      .order("name"),

    supabase
      .from("products")
      .select("id, name, price_cents")
      .eq("studio_id", studioId ?? "")
      .eq("active", true)
      .order("name"),

    supabase
      .from("guardianships")
      .select("guardian_id, student:profiles!student_id ( id, full_name )")
      .eq("studio_id", studioId ?? ""),
  ]);

  const profileIds = [
    ...new Set(
      (subsRes.data ?? [])
        .flatMap((s) => [s.payer_id, s.student_id])
        .filter(Boolean) as string[],
    ),
  ];
  const classIds = [
    ...new Set((subsRes.data ?? []).map((s) => s.class_id).filter(Boolean) as string[]),
  ];

  const [profileRows, classRows] = await Promise.all([
    profileIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", profileIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    classIds.length
      ? supabase.from("classes").select("id, name").in("id", classIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);

  const nameMap = new Map<string, string>();
  (profileRows.data ?? []).forEach((p) => p.full_name && nameMap.set(p.id, p.full_name));

  const classMap = new Map<string, string>();
  (classRows.data ?? []).forEach((c) => classMap.set(c.id, c.name));

  const studentsByParent = new Map<string, { id: string; name: string }[]>();
  for (const row of guardianshipsRes.data ?? []) {
    const guardianId = row.guardian_id as string;
    const raw = row.student as unknown;
    const student = (Array.isArray(raw) ? raw[0] : raw) as { id: string; full_name: string | null } | null;
    if (!student?.id) continue;
    const list = studentsByParent.get(guardianId) ?? [];
    list.push({ id: student.id, name: student.full_name ?? tCommon("student") });
    studentsByParent.set(guardianId, list);
  }

  const rows: SubscriptionRow[] = (subsRes.data ?? []).map((s) => ({
    id: s.id as string,
    stripeSubscriptionId: s.stripe_subscription_id as string | null,
    planLabel: s.plan_label as string | null,
    amountCents: Number(s.amount_cents ?? 0),
    monthlyAmountCents: Number(s.monthly_amount_cents ?? s.amount_cents ?? 0),
    billingInterval: (s.billing_interval as string) ?? (s.interval as string) ?? "month",
    interval: (s.interval as string) ?? "month",
    status: (s.status as string) ?? "incomplete",
    currentPeriodEnd: s.current_period_end as string | null,
    cancelAtPeriodEnd: Boolean(s.cancel_at_period_end),
    adminCreated: Boolean(s.admin_created),
    payerName: s.payer_id ? nameMap.get(s.payer_id as string) ?? null : null,
    studentName: s.student_id ? nameMap.get(s.student_id as string) ?? null : null,
    className: s.class_id ? classMap.get(s.class_id as string) ?? null : null,
  }));

  const parents: ParentOption[] = (parentsRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: (p.full_name as string | null) ?? tCommon("parent"),
    students: studentsByParent.get(p.id as string) ?? [],
  }));

  const classes: ClassOption[] = (classesRes.data ?? []).map((c) => ({
    id: c.id as string,
    name: c.name as string,
    priceCents: Number(c.price_cents ?? 0),
  }));

  const products: ProductOption[] = (productsRes.data ?? []).map((p) => ({
    id: p.id as string,
    name: p.name as string,
    priceCents: Number(p.price_cents ?? 0),
  }));

  return (
    <SubscriptionsManager subscriptions={rows} parents={parents} classes={classes} products={products} />
  );
}

export async function PlansTab() {
  return (
    <div>
      <PaymentPlansSection />
      <hr className="mx-auto max-w-6xl border-[--hair]" />
      <SubscriptionsSection />
    </div>
  );
}
