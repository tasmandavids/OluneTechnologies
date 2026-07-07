// ============================================================================
//  Subscriptions tab — auto-pay subscription oversight + admin plans.
//  Server loader moved verbatim from the old /portal/admin/subscriptions page.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import SubscriptionsManager from "@/components/admin/subscriptions/SubscriptionsManager";
import { getTranslations } from "@/lib/i18n/server";
import type {
  ClassOption,
  ParentOption,
  ProductOption,
  SubscriptionRow,
} from "@/app/portal/admin/subscriptions/page";

export async function SubscriptionsTab() {
  const session = await requirePortalSession();
  const { supabase, studioId } = session;
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

  // Both lookups are independent — run in parallel.
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
    <SubscriptionsManager
      subscriptions={rows}
      parents={parents}
      classes={classes}
      products={products}
    />
  );
}
