"use client";

// ============================================================================
//  ClassFormModal — centred glass dialog for creating and editing a class.
//
//  Replaces the right-hand slide-over. A class is two things at once, so the
//  dialog is two columns: what the studio runs (name, day, time, room,
//  capacity, teacher) on the left, what the studio sells on the right.
//
//  Creating a class always creates or links a catalogue product — there is no
//  "just type a price" path any more, because a class without a product has no
//  tax treatment and no ledger code, and that only ever surfaced later as a
//  failed invoice. Once the class exists, the money moves out of here: pricing,
//  GST and accounting codes are edited in Money → Products, and this dialog
//  keeps only the link plus a way out to that screen. Timing, teacher and
//  enrolment stay on the class, here and in the schedule board.
// ============================================================================

import { useEscToClose } from "@/lib/useEscToClose";
import { fadeLift, overlayFade } from "@/lib/motion";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  createClass,
  updateClass,
  createRecurringClasses,
  linkClassToSeries,
  type ClassBillingInput,
  type SeriesSelection,
} from "@/app/portal/admin/classes/actions";
import type { ClassRow, TeacherOption } from "@/app/portal/admin/classes/page";
import type { XeroAccountOption, XeroItemOption } from "@/lib/xero/chart-of-accounts";
import { CLASS_PRICING_MODELS, type ClassPricingModel } from "@/lib/billing/class-product";
import { formatMoney } from "@/lib/currency";

const PRODUCTS_HREF = "/portal/admin/money?tab=products";

const DISCIPLINE_KEYS = [
  "ballet", "jazz", "hipHop", "contemporary", "tap", "lyrical",
  "acro", "pointe", "musicalTheatre", "ballroom", "latin", "aerial", "other",
] as const;

const DISCIPLINE_VALUES: Record<(typeof DISCIPLINE_KEYS)[number], string> = {
  ballet: "Ballet",
  jazz: "Jazz",
  hipHop: "Hip-Hop",
  contemporary: "Contemporary",
  tap: "Tap",
  lyrical: "Lyrical",
  acro: "Acro",
  pointe: "Pointe",
  musicalTheatre: "Musical Theatre",
  ballroom: "Ballroom",
  latin: "Latin",
  aerial: "Aerial",
  other: "Other",
};

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
const DAY_SHORT_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function decodeSeriesChoice(value: string): SeriesSelection {
  if (value.startsWith("group:")) return { type: "group", groupId: value.slice(6) };
  if (value.startsWith("class:")) return { type: "class", classId: value.slice(6) };
  return { type: "none" };
}

/** Catalogue entries a class can bill against. */
export type ClassProductOption = {
  id: string;
  name: string;
  code: string;
  unitAmountCents: number;
  pricingModel: ClassPricingModel;
  accountCode: string | null;
  itemCode: string | null;
};

type BillingMode = "existing" | "new";

/**
 * How much of the money this dialog is allowed to touch.
 *
 *  choose          — creating (or fixing a class that never had a product):
 *                    pick an existing product or define a new one. Required.
 *  linked          — the class already has a product and the catalogue is
 *                    loaded: the link can move, the price cannot be typed.
 *  linked-readonly — the class has a product that isn't in the list offered
 *                    here: it was archived, or the caller didn't load the
 *                    catalogue at all. Billing is left exactly as it is rather
 *                    than being silently rewritten to something else.
 */
type BillingUiMode = "choose" | "linked" | "linked-readonly";

function resolveBillingUi(
  mode: "create" | "edit",
  editing: ClassRow | null,
  products: ClassProductOption[],
): BillingUiMode {
  if (mode === "create" || !editing?.productId) return "choose";
  return products.some((p) => p.id === editing.productId) ? "linked" : "linked-readonly";
}

type FormState = {
  name: string;
  discipline: string;
  level: string;
  room: string;
  dayOfWeek: number;
  days: number[];
  startTime: string;
  endTime: string;
  capacity: number;
  teacherId: string;
  billingMode: BillingMode;
  productId: string;
  priceDollars: string;
  pricingModel: ClassPricingModel;
  productName: string;
  productCode: string;
  accountCode: string;
  itemCode: string;
};

function slugifyCode(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}

function initialForm(
  mode: "create" | "edit",
  editing: ClassRow | null,
  products: ClassProductOption[],
  defaultPricingModel: ClassPricingModel,
): FormState {
  const linked = editing?.productId
    ? products.find((p) => p.id === editing.productId) ?? null
    : null;

  const base = {
    billingMode: (linked || products.length > 0 ? "existing" : "new") as BillingMode,
    productId: linked?.id ?? "",
    priceDollars: "",
    pricingModel: defaultPricingModel,
    productName: "",
    productCode: "",
    accountCode: "",
    itemCode: "",
  };

  if (mode === "edit" && editing) {
    return {
      name: editing.name,
      discipline: editing.discipline ?? "",
      level: editing.level ?? "",
      room: editing.room ?? "",
      dayOfWeek: editing.dayOfWeek,
      days: [editing.dayOfWeek],
      startTime: editing.startTime?.slice(0, 5) ?? "",
      endTime: editing.endTime?.slice(0, 5) ?? "",
      capacity: editing.capacity,
      teacherId: editing.teacherId ?? "",
      ...base,
      // A class that predates the catalogue has no product to keep — the form
      // asks for one rather than letting it stay unpriced.
      billingMode: linked ? "existing" : base.billingMode,
      priceDollars: linked ? "" : (editing.priceCents / 100).toFixed(2),
      productName: linked ? "" : editing.name,
    };
  }

  return {
    name: "",
    discipline: "",
    level: "",
    room: "",
    dayOfWeek: 1,
    days: [1],
    startTime: "16:00",
    endTime: "17:00",
    capacity: 20,
    teacherId: "",
    ...base,
  };
}

// ─── field chrome ────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
      {children}
    </label>
  );
}

const CONTROL =
  "w-full rounded-lg border border-[--hair] bg-surface px-3 py-2 text-sm text-ink " +
  "placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-[--brand]";

function Input({
  value, onChange, type = "text", placeholder, min, max, step,
}: {
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      max={max}
      step={step}
      className={CONTROL}
    />
  );
}

function Select({
  value, onChange, children,
}: {
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={CONTROL}>
      {children}
    </select>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 text-[0.68rem] font-black uppercase tracking-[0.14em] text-muted">
      {children}
    </h3>
  );
}

/** Inner card on the glass surface — solid, so form fields stay readable. */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-[--hair] p-4 ${className}`}
      style={{ background: "color-mix(in srgb, var(--surface) 72%, transparent)" }}
    >
      {children}
    </div>
  );
}

// ─── billing section ─────────────────────────────────────────────────────────

function BillingSection({
  form,
  set,
  products,
  xeroAccounts,
  xeroItems,
  pricesIncludeTax,
  billingMode,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, val: FormState[K]) => void;
  products: ClassProductOption[];
  xeroAccounts: XeroAccountOption[];
  xeroItems: XeroItemOption[];
  pricesIncludeTax: boolean;
  /** See resolveBillingUi — how much of the money is editable from here. */
  billingMode: BillingUiMode;
}) {
  const t = useTranslations("admin.classes.form");
  const selected = products.find((p) => p.id === form.productId) ?? null;

  return (
    <Card>
      <SectionTitle>{t("sectionBilling")}</SectionTitle>

      {billingMode === "linked-readonly" ? (
        <p className="text-[0.7rem] leading-relaxed text-muted">{t("billingEditNotice")}</p>
      ) : billingMode === "linked" ? (
        <>
          <Label>{t("billedAs")}</Label>
          <Select value={form.productId} onChange={(v) => set("productId", v)}>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} — {formatMoney(product.unitAmountCents)}
              </option>
            ))}
          </Select>
          {selected && (
            <p className="mt-2 text-xs text-muted">
              {t("productSummary", {
                price: formatMoney(selected.unitAmountCents),
                model: t(`models.${selected.pricingModel}`),
                code: selected.code,
              })}
            </p>
          )}
          <p className="mt-3 text-[0.7rem] leading-relaxed text-muted">{t("billingEditNotice")}</p>
        </>
      ) : (
        <>
          {products.length > 0 && (
            <div className="mb-3 flex gap-1.5 rounded-xl border border-[--hair] p-1">
              {(["existing", "new"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => set("billingMode", mode)}
                  className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    form.billingMode === mode ? "text-white" : "text-muted hover:text-ink"
                  }`}
                  style={form.billingMode === mode ? { background: "var(--brand)" } : undefined}
                >
                  {mode === "existing" ? t("billingModeExisting") : t("billingModeNew")}
                </button>
              ))}
            </div>
          )}

          {form.billingMode === "existing" && products.length > 0 ? (
            <>
              <Label>{t("product")}</Label>
              <Select value={form.productId} onChange={(v) => set("productId", v)}>
                <option value="">{t("chooseProduct")}</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} — {formatMoney(product.unitAmountCents)}
                  </option>
                ))}
              </Select>
              {selected && (
                <p className="mt-2 text-xs text-muted">
                  {t("productSummary", {
                    price: formatMoney(selected.unitAmountCents),
                    model: t(`models.${selected.pricingModel}`),
                    code: selected.code,
                  })}
                </p>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>
                    {pricesIncludeTax ? t("priceInclusive") : t("priceExclusive")}
                  </Label>
                  <Input
                    type="number"
                    value={form.priceDollars}
                    onChange={(v) => set("priceDollars", v)}
                    min={0}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <Label>{t("pricingModel")}</Label>
                  <Select
                    value={form.pricingModel}
                    onChange={(v) => set("pricingModel", v as ClassPricingModel)}
                  >
                    {CLASS_PRICING_MODELS.map((model) => (
                      <option key={model} value={model}>{t(`models.${model}`)}</option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* SKU and ledger coding are bookkeeping detail — sensible
                  defaults are derived from the class name and the studio's
                  connected ledger, so most studios never open this. */}
              <details className="mt-3 rounded-xl border border-[--hair]">
                <summary className="cursor-pointer select-none px-3 py-2 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                  {t("productAdvanced")}
                </summary>
                <div className="space-y-3 px-3 pb-3">
                  <div>
                    <Label>{t("productName")}</Label>
                    <Input
                      value={form.productName}
                      onChange={(v) => set("productName", v)}
                      placeholder={form.name || t("productNamePlaceholder")}
                    />
                  </div>
                  <div>
                    <Label>{t("productCode")}</Label>
                    <Input
                      value={form.productCode}
                      onChange={(v) => set("productCode", v.toUpperCase())}
                      placeholder={slugifyCode(form.productName || form.name) || "CLASS"}
                    />
                  </div>
                  {xeroAccounts.length > 0 && (
                    <div>
                      <Label>{t("xeroAccountCode")}</Label>
                      <Select value={form.accountCode} onChange={(v) => set("accountCode", v)}>
                        <option value="">{t("xeroAccountCodeDefault")}</option>
                        {xeroAccounts.map((acct) => (
                          <option key={acct.code} value={acct.code}>
                            {acct.code} — {acct.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                  {xeroItems.length > 0 && (
                    <div>
                      <Label>{t("xeroItemCode")}</Label>
                      <Select value={form.itemCode} onChange={(v) => set("itemCode", v)}>
                        <option value="">{t("xeroItemCodeNone")}</option>
                        {xeroItems.map((item) => (
                          <option key={item.code} value={item.code}>
                            {item.code} — {item.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}
                </div>
              </details>

              <p className="mt-3 text-[0.7rem] leading-relaxed text-muted">{t("billingNewHint")}</p>
            </>
          )}
        </>
      )}

      <Link
        href={PRODUCTS_HREF}
        className="mt-3 inline-block text-xs font-semibold text-[--brand] hover:underline"
      >
        {t("manageProducts")}
      </Link>
    </Card>
  );
}

// ─── modal ───────────────────────────────────────────────────────────────────

export function ClassFormModal({
  mode,
  editing,
  teachers,
  allClasses = [],
  xeroAccounts = [],
  xeroItems = [],
  products = [],
  defaultPricingModel = "recurring",
  pricesIncludeTax = true,
  onClose,
}: {
  mode: "create" | "edit";
  editing: ClassRow | null;
  teachers: TeacherOption[];
  allClasses?: ClassRow[];
  xeroAccounts?: XeroAccountOption[];
  xeroItems?: XeroItemOption[];
  products?: ClassProductOption[];
  defaultPricingModel?: ClassPricingModel;
  pricesIncludeTax?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations("admin.classes.form");
  useEscToClose(onClose);
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const [form, setForm] = useState<FormState>(() =>
    initialForm(mode, editing, products, defaultPricingModel),
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Once the class has a product the price, GST treatment and ledger codes are
  // the product's — this dialog only ever shows or moves the link.
  const billingUi = resolveBillingUi(mode, editing, products);

  // Group the studio's other classes so an existing class can be attached to
  // an existing series (or paired with a standalone class to start one)
  // instead of being recreated via the multi-day picker.
  const otherClasses = editing ? allClasses.filter((c) => c.id !== editing.id) : allClasses;
  const seriesGroupMap = new Map<string, ClassRow[]>();
  const standaloneClasses: ClassRow[] = [];
  otherClasses.forEach((c) => {
    if (c.recurringGroupId) {
      const members = seriesGroupMap.get(c.recurringGroupId) ?? [];
      members.push(c);
      seriesGroupMap.set(c.recurringGroupId, members);
    } else {
      standaloneClasses.push(c);
    }
  });
  const seriesGroups = Array.from(seriesGroupMap.entries()).map(([groupId, members]) => ({
    groupId,
    label: t("seriesOptionGroupLabel", { name: members[0].name, count: members.length }),
  }));

  const [seriesChoice, setSeriesChoice] = useState<string>(() =>
    editing?.recurringGroupId && seriesGroupMap.has(editing.recurringGroupId)
      ? `group:${editing.recurringGroupId}`
      : "none",
  );
  const [seriesPending, startSeriesTransition] = useTransition();
  const [seriesError, setSeriesError] = useState<string | null>(null);

  const linkSeries = () => {
    if (!editing) return;
    setSeriesError(null);
    const selection = decodeSeriesChoice(seriesChoice);
    startSeriesTransition(async () => {
      const result = await linkClassToSeries(editing.id, selection);
      if (!result.ok) {
        setSeriesError(result.error);
        return;
      }
      onClose();
    });
  };

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const toggleDay = (day: number) =>
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day].sort((a, b) => a - b),
    }));

  /**
   * The billing half of the payload. `undefined` means "leave the class's
   * existing link alone"; an `error` is shown instead of submitting.
   */
  function buildBilling(): ClassBillingInput | undefined | { error: string } {
    if (billingUi === "linked-readonly") return undefined;

    if (form.billingMode === "existing" || billingUi === "linked") {
      if (!form.productId) return { error: t("errors.needProduct") };
      return { mode: "existing", productId: form.productId };
    }

    const price = Number.parseFloat(form.priceDollars);
    if (!Number.isFinite(price) || price < 0) return { error: t("errors.needPrice") };

    return {
      mode: "new",
      name: form.productName.trim() || form.name.trim(),
      code: form.productCode.trim() || undefined,
      priceCents: Math.round(price * 100),
      pricingModel: form.pricingModel,
      accountCode: form.accountCode || undefined,
      itemCode: form.itemCode || undefined,
    };
  }

  const submit = () => {
    setError(null);

    if (mode === "create" && form.days.length === 0) {
      setError(t("pickDayError"));
      return;
    }

    const billing = buildBilling();
    if (billing && "error" in billing) {
      setError(billing.error);
      return;
    }

    const base = {
      name: form.name,
      discipline: form.discipline,
      level: form.level,
      room: form.room,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      capacity: form.capacity,
      teacherId: form.teacherId || undefined,
      billing,
    };

    startTransition(async () => {
      let result;
      if (mode === "edit" && editing) {
        result = await updateClass(editing.id, { ...base, dayOfWeek: form.dayOfWeek });
      } else if (form.days.length > 1) {
        result = await createRecurringClasses({ ...base, days: form.days });
      } else {
        result = await createClass({ ...base, dayOfWeek: form.days[0] });
      }

      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-black/45 backdrop-blur-sm"
        {...overlayFade}
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-label={mode === "create" ? t("newClass") : t("editClass")}
          className="pointer-events-auto flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[26px] border"
          style={{
            background:
              "linear-gradient(148deg, var(--refract), transparent 42%), color-mix(in srgb, var(--glass) 60%, var(--surface))",
            borderColor: "var(--edge)",
            backdropFilter: "blur(var(--blur-lg)) saturate(1.85)",
            WebkitBackdropFilter: "blur(var(--blur-lg)) saturate(1.85)",
            boxShadow:
              "var(--shadow), inset 0 1px 0 var(--sheen), inset 0 -1px 0 var(--sheen2), inset 1px 0 0 var(--sheen2)",
          }}
          {...fadeLift}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[--hair] px-6 py-4">
            <div>
              <h2 className="font-black text-ink">
                {mode === "create" ? t("newClass") : t("editClass")}
              </h2>
              <p className="mt-0.5 text-xs text-muted">
                {mode === "create" ? t("newClassSubtitle") : t("editClassSubtitle")}
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-muted transition-colors hover:text-ink"
              aria-label={tShared("close")}
            >
              ✕
            </button>
          </div>

          <div className="grid flex-1 gap-4 overflow-y-auto px-6 py-5 md:grid-cols-[1.1fr_1fr]">
            {/* ─── what the studio runs ─── */}
            <Card>
              <SectionTitle>{t("sectionDetails")}</SectionTitle>

              <div className="space-y-4">
                <div>
                  <Label>{t("className")}</Label>
                  <Input
                    value={form.name}
                    onChange={(v) => set("name", v)}
                    placeholder={t("classNamePlaceholder")}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("discipline")}</Label>
                    <Select value={form.discipline} onChange={(v) => set("discipline", v)}>
                      <option value="">{tShared("none")}</option>
                      {DISCIPLINE_KEYS.map((key) => (
                        <option key={key} value={DISCIPLINE_VALUES[key]}>
                          {tShared(`disciplines.${key}`)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label>{t("level")}</Label>
                    <Input
                      value={form.level}
                      onChange={(v) => set("level", v)}
                      placeholder={t("levelPlaceholder")}
                    />
                  </div>
                </div>

                <div>
                  <Label>{t("room")}</Label>
                  <Input
                    value={form.room}
                    onChange={(v) => set("room", v)}
                    placeholder={t("roomPlaceholder")}
                  />
                </div>

                {mode === "edit" ? (
                  <div>
                    <Label>{t("dayOfWeek")}</Label>
                    <Select value={form.dayOfWeek} onChange={(v) => set("dayOfWeek", Number(v))}>
                      {DAY_KEYS.map((key, i) => (
                        <option key={key} value={i}>{tCommon(`days.${key}`)}</option>
                      ))}
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label>{t("daysOfWeek")}</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {DAY_SHORT_KEYS.map((key, i) => {
                        const active = form.days.includes(i);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => toggleDay(i)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                              active
                                ? "text-white"
                                : "border border-[--hair] text-muted hover:text-ink"
                            }`}
                            style={active ? { background: "var(--brand)" } : undefined}
                          >
                            {tCommon(`days.${key}`)}
                          </button>
                        );
                      })}
                    </div>
                    {form.days.length > 1 && (
                      <p className="mt-1.5 text-[0.68rem] text-muted">
                        {t("recurringHint", { count: form.days.length })}
                      </p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("startTime")}</Label>
                    <Input type="time" value={form.startTime} onChange={(v) => set("startTime", v)} />
                  </div>
                  <div>
                    <Label>{t("endTime")}</Label>
                    <Input type="time" value={form.endTime} onChange={(v) => set("endTime", v)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>{t("capacity")}</Label>
                    <Input
                      type="number"
                      value={form.capacity}
                      onChange={(v) => set("capacity", Number(v))}
                      min={1}
                      max={500}
                    />
                  </div>
                  <div>
                    <Label>{t("teacher")}</Label>
                    <Select value={form.teacherId} onChange={(v) => set("teacherId", v)}>
                      <option value="">{tShared("unassignedOption")}</option>
                      {teachers.map((teacher) => (
                        <option key={teacher.id} value={teacher.id}>
                          {teacher.name ?? teacher.email}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
              </div>
            </Card>

            {/* ─── what the studio sells ─── */}
            <div className="space-y-4">
              <BillingSection
                form={form}
                set={set}
                products={products}
                xeroAccounts={xeroAccounts}
                xeroItems={xeroItems}
                pricesIncludeTax={pricesIncludeTax}
                billingMode={billingUi}
              />

              {mode === "edit" && editing && (
                <Card>
                  <SectionTitle>{t("seriesLabel")}</SectionTitle>
                  <p className="mb-2 text-[0.7rem] leading-relaxed text-muted">{t("seriesHint")}</p>
                  <Select value={seriesChoice} onChange={setSeriesChoice}>
                    <option value="none">{t("seriesNoneOption")}</option>
                    {seriesGroups.length > 0 && (
                      <optgroup label={t("seriesExistingGroup")}>
                        {seriesGroups.map((g) => (
                          <option key={g.groupId} value={`group:${g.groupId}`}>
                            {g.label}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {standaloneClasses.length > 0 && (
                      <optgroup label={t("seriesStandaloneGroup")}>
                        {standaloneClasses.map((c) => (
                          <option key={c.id} value={`class:${c.id}`}>
                            {c.name} — {tCommon(`days.${DAY_SHORT_KEYS[c.dayOfWeek]}`)}
                            {c.startTime ? ` ${c.startTime.slice(0, 5)}` : ""}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </Select>
                  {seriesError && (
                    <p className="mt-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
                      {seriesError}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={linkSeries}
                    disabled={seriesPending}
                    className="mt-3 w-full rounded-lg border border-[--hair] py-2 text-xs font-bold text-ink
                               transition-colors hover:bg-[--hair] disabled:opacity-50"
                  >
                    {seriesPending ? t("seriesLinking") : t("seriesLinkButton")}
                  </button>
                </Card>
              )}
            </div>
          </div>

          {error && (
            <p className="mx-6 mb-3 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-xs text-red-400">
              {error}
            </p>
          )}

          <div className="flex gap-3 border-t border-[--hair] px-6 py-4">
            <button
              onClick={onClose}
              className="flex-1 rounded-xl border border-[--hair] py-2.5 text-sm text-muted
                         transition-colors hover:text-ink"
            >
              {tCommon("cancel")}
            </button>
            <button
              onClick={submit}
              disabled={pending || !form.name}
              className="flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-opacity
                         disabled:opacity-50"
              style={{ background: "var(--brand)" }}
            >
              {pending ? tShared("saving") : mode === "create" ? t("createClass") : t("saveChanges")}
            </button>
          </div>
        </motion.div>
      </div>
    </>
  );
}
