// ============================================================================
//  /portal/admin/classes — Class roster + create/edit/delete.
//  Server component: fetches class_capacity view (enrolled counts) +
//  teacher list for the assignment dropdown.
// ============================================================================

import { requirePortalSession } from "@/lib/portal/session";
import { ClassesPageView } from "@/components/admin/classes/ClassesPageView";
import { getXeroSalesAccountOptions, getXeroItemOptions } from "@/app/portal/admin/accounting/actions";
import type { XeroAccountOption, XeroItemOption } from "@/lib/xero/chart-of-accounts";
import { loadStudioProducts } from "@/lib/billing/catalog";
import type { ClassProductOption } from "@/components/admin/classes/ClassEditPanel";

export type ClassRow = {
  id: string;
  name: string;
  discipline: string | null;
  level: string | null;
  room: string | null;
  dayOfWeek: number;
  startTime: string | null;
  endTime: string | null;
  capacity: number;
  priceCents: number;
  enrolled: number;
  teacherId: string | null;
  teacherName: string | null;
  recurringGroupId: string | null;
  /** Optional — the dashboard schedule board's ClassRow doesn't fetch these. */
  xeroAccountCode?: string | null;
  xeroItemCode?: string | null;
  productId?: string | null;
};

export type TeacherOption = {
  id: string;
  name: string | null;
  email: string | null;
};

export default async function ClassesPage() {
  const { supabase, studioId, role } = await requirePortalSession();
  const readOnly = role === "office";

  // Use class_capacity view for live enrolled counts
  const [capacityRes, teachersRes] = await Promise.all([
    supabase
      .from("class_capacity")
      .select(
        "id, name, discipline, level, room, day_of_week, start_time, end_time, capacity, enrolled, teacher_id",
      )
      .eq("studio_id", studioId ?? "")
      .order("day_of_week")
      .order("start_time"),

    supabase
      .from("profiles")
      .select("id, full_name, email")
      .eq("studio_id", studioId ?? "")
      .eq("role", "teacher")
      .order("full_name"),
  ]);

  const teacherIds = [
    ...new Set(
      (capacityRes.data ?? [])
        .map((c) => c.teacher_id)
        .filter(Boolean) as string[],
    ),
  ];
  const classIds = (capacityRes.data ?? []).map((c) => c.id as string);

  // Fetch teacher names, price/group data, and the live Xero chart of
  // accounts + item catalog in parallel — all depend on capacityRes but are
  // independent of each other.
  const [teacherNameRows, priceRows, xeroAccountsRes, xeroItemsRes] = await Promise.all([
    teacherIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", teacherIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
    classIds.length
      ? supabase.from("classes").select("id, price_cents, recurring_group_id, xero_account_code, xero_item_code, product_id").in("id", classIds)
      : Promise.resolve({
          data: [] as {
            id: string;
            price_cents: number | null;
            recurring_group_id: string | null;
            xero_account_code: string | null;
            xero_item_code: string | null;
            product_id: string | null;
          }[],
        }),
    getXeroSalesAccountOptions(),
    getXeroItemOptions(),
  ]);

  const teacherMap = new Map<string, string>();
  (teacherNameRows.data ?? []).forEach((t) => {
    if (t.full_name) teacherMap.set(t.id, t.full_name);
  });

  const priceMap = new Map<string, number>();
  const groupMap = new Map<string, string | null>();
  const xeroCodeMap = new Map<string, string | null>();
  const xeroItemMap = new Map<string, string | null>();
  const productMap = new Map<string, string | null>();
  (priceRows.data ?? []).forEach((r) => {
    productMap.set(r.id, (r.product_id as string | null) ?? null);
    priceMap.set(r.id, r.price_cents ?? 0);
    groupMap.set(r.id, (r.recurring_group_id as string | null) ?? null);
    xeroCodeMap.set(r.id, (r.xero_account_code as string | null) ?? null);
    xeroItemMap.set(r.id, (r.xero_item_code as string | null) ?? null);
  });

  // Tuition products only — a class bills against a term/recurring/session
  // price, not a costume fee or a studio-hire rate.
  const products: ClassProductOption[] = (await loadStudioProducts(supabase, studioId))
    .filter((p) => ["term", "recurring", "per_session", "one_off"].includes(p.pricingModel))
    .map((p) => ({
      id: p.id,
      name: p.name,
      code: p.code,
      unitAmountCents: p.unitAmountCents,
      accountCode: p.accountCode,
      itemCode: p.itemCode,
    }));

  const xeroAccounts: XeroAccountOption[] = xeroAccountsRes.ok ? xeroAccountsRes.data ?? [] : [];
  const xeroItems: XeroItemOption[] = xeroItemsRes.ok ? xeroItemsRes.data ?? [] : [];

  const classes: ClassRow[] = (capacityRes.data ?? []).map((c) => ({
    id:          c.id as string,
    name:        c.name as string,
    discipline:  c.discipline as string | null,
    level:       c.level as string | null,
    room:        c.room as string | null,
    dayOfWeek:   c.day_of_week as number,
    startTime:   c.start_time as string | null,
    endTime:     c.end_time as string | null,
    capacity:    Number(c.capacity ?? 0),
    priceCents:  priceMap.get(c.id as string) ?? 0,
    enrolled:    Number(c.enrolled ?? 0),
    teacherId:   c.teacher_id as string | null,
    teacherName: c.teacher_id ? (teacherMap.get(c.teacher_id as string) ?? null) : null,
    recurringGroupId: groupMap.get(c.id as string) ?? null,
    xeroAccountCode: xeroCodeMap.get(c.id as string) ?? null,
    xeroItemCode: xeroItemMap.get(c.id as string) ?? null,
    productId: productMap.get(c.id as string) ?? null,
  }));

  const teachers: TeacherOption[] = (teachersRes.data ?? []).map((t) => ({
    id:    t.id,
    name:  t.full_name,
    email: t.email,
  }));

  return (
    <ClassesPageView
      studioId={studioId}
      classes={classes}
      teachers={teachers}
      xeroAccounts={xeroAccounts}
      xeroItems={xeroItems}
      products={products}
      readOnly={readOnly}
    />
  );
}
