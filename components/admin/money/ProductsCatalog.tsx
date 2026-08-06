"use client";

// ============================================================================
//  Money → Products — the studio's billing catalogue.
//
//  List on the left, slide-over editor on the right, following the
//  ClassesManager / ClassEditPanel pattern. There's no shared form library in
//  this repo, so the field chrome consts below are the same ones AdminSettings
//  uses — copied deliberately rather than abstracted, matching how every other
//  admin surface here is built.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";
import { formatMoney } from "@/lib/currency";
import { toast } from "@/lib/feedback";
import {
  MODEL_FIELDS,
  PRICING_MODELS,
  PRODUCT_CATEGORIES,
  RECURRING_INTERVALS,
  TAX_TREATMENTS,
  type BillingProduct,
  type LedgerProvider,
  type PriceTier,
  type PricingModel,
  type ProductCategory,
  type RecurringInterval,
  type TaxTreatment,
} from "@/lib/billing/types";
import { defaultUnitLabel, resolveTierPrice } from "@/lib/billing/pricing";
import { splitTax } from "@/lib/billing/tax";
import type { TuitionPricingModel } from "@/lib/billing/tuition-quote";
import {
  createProduct,
  saveProductComponents,
  saveProductLedgerCodes,
  saveProductTiers,
  setProductActive,
  setProductAutoApply,
  updateProduct,
  type ProductInput,
} from "@/app/portal/admin/money/product-actions";

const fieldClass =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm text-ink outline-none transition placeholder:text-muted focus:border-[--brand]";
const fieldStyle = { background: "var(--surface)", borderColor: "var(--hair)" } as const;

type CodeOption = { code: string; name: string };

type TaxSettings = { pricesIncludeTax: boolean; gstRegistered: boolean; gstNumber: string | null };

type TierDraft = { minQuantity: string; unitDollars: string };
type ComponentDraft = { componentProductId: string; quantity: string };
type LedgerDraft = { provider: LedgerProvider; accountCode: string; itemCode: string; taxCode: string };

type Draft = {
  id: string | null;
  name: string;
  code: string;
  description: string;
  category: ProductCategory;
  pricingModel: PricingModel;
  priceDollars: string;
  unitLabel: string;
  minUnits: string;
  incrementUnits: string;
  creditCount: string;
  creditExpiryDays: string;
  recurringInterval: RecurringInterval;
  recurringIntervalCount: string;
  termId: string;
  taxTreatment: TaxTreatment;
  taxRatePct: string;
  accountCode: string;
  itemCode: string;
  tiers: TierDraft[];
  /**
   * Percent-off tiers saved before the editor went price-only. They're shown
   * read-only and carried straight back into the save payload: saveProductTiers
   * deletes every tier before re-inserting, so a tier the editor doesn't render
   * is a tier the next save destroys.
   */
  legacyPercentTiers: PriceTier[];
  components: ComponentDraft[];
  /** package only: fire this combo when a family's basket satisfies it. */
  autoApply: boolean;
  ledger: LedgerDraft[];
};

const OTHER_LEDGERS: LedgerProvider[] = ["quickbooks", "myob"];

function emptyDraft(): Draft {
  return {
    id: null,
    name: "",
    code: "",
    description: "",
    category: "tuition",
    pricingModel: "one_off",
    priceDollars: "",
    unitLabel: "",
    minUnits: "",
    incrementUnits: "",
    creditCount: "",
    creditExpiryDays: "",
    recurringInterval: "month",
    recurringIntervalCount: "1",
    termId: "",
    taxTreatment: "standard",
    taxRatePct: "15",
    accountCode: "",
    itemCode: "",
    tiers: [],
    legacyPercentTiers: [],
    components: [],
    autoApply: false,
    ledger: [],
  };
}

function draftFromProduct(product: BillingProduct): Draft {
  return {
    id: product.id,
    name: product.name,
    code: product.code,
    description: product.description ?? "",
    category: product.category,
    pricingModel: product.pricingModel,
    priceDollars: (product.unitAmountCents / 100).toFixed(2),
    unitLabel: product.unitLabel ?? "",
    minUnits: product.minUnits != null ? String(product.minUnits) : "",
    incrementUnits: product.incrementUnits != null ? String(product.incrementUnits) : "",
    creditCount: product.creditCount != null ? String(product.creditCount) : "",
    creditExpiryDays: product.creditExpiryDays != null ? String(product.creditExpiryDays) : "",
    recurringInterval: product.recurringInterval ?? "month",
    recurringIntervalCount: String(product.recurringIntervalCount ?? 1),
    termId: product.termId ?? "",
    taxTreatment: product.taxTreatment,
    taxRatePct: (product.taxRateBp / 100).toString(),
    accountCode: product.accountCode ?? "",
    itemCode: product.itemCode ?? "",
    // A tier states a price or a discount, never both (0105 check constraint).
    // Price tiers are editable; the discount ones survive untouched.
    tiers: product.tiers
      .filter((t) => t.unitAmountCents != null)
      .map((t) => ({
        minQuantity: String(t.minQuantity),
        unitDollars: (t.unitAmountCents! / 100).toFixed(2),
      })),
    legacyPercentTiers: product.tiers.filter((t) => t.discountBp != null),
    components: product.components.map((c) => ({
      componentProductId: c.componentProductId,
      quantity: String(c.quantity),
    })),
    autoApply: product.autoApply,
    ledger: OTHER_LEDGERS.map((provider) => {
      const existing = product.ledgerCodes.find((l) => l.provider === provider);
      return {
        provider,
        accountCode: existing?.accountCode ?? "",
        itemCode: existing?.itemCode ?? "",
        taxCode: existing?.taxCode ?? "",
      };
    }),
  };
}

function slugifyCode(name: string): string {
  return name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);
}

function toInput(draft: Draft): ProductInput | null {
  const price = Number.parseFloat(draft.priceDollars);
  if (!draft.name.trim() || !draft.code.trim()) return null;
  if (!Number.isFinite(price) || price < 0) return null;

  const taxPct = Number.parseFloat(draft.taxRatePct);
  const optionalNumber = (raw: string) => {
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  return {
    name: draft.name.trim(),
    code: draft.code.trim(),
    description: draft.description.trim() || undefined,
    category: draft.category,
    pricingModel: draft.pricingModel,
    unitAmountCents: Math.round(price * 100),
    unitLabel: draft.unitLabel.trim() || undefined,
    minUnits: optionalNumber(draft.minUnits),
    incrementUnits: optionalNumber(draft.incrementUnits),
    creditCount: optionalNumber(draft.creditCount),
    creditExpiryDays: optionalNumber(draft.creditExpiryDays),
    recurringInterval: draft.recurringInterval,
    recurringIntervalCount: Math.max(1, Math.round(optionalNumber(draft.recurringIntervalCount) ?? 1)),
    termId: draft.termId || undefined,
    taxTreatment: draft.taxTreatment,
    taxRateBp: Number.isFinite(taxPct) ? Math.round(taxPct * 100) : 1500,
    accountCode: draft.accountCode.trim() || undefined,
    itemCode: draft.itemCode.trim() || undefined,
    sortOrder: 0,
  };
}

export function ProductsCatalog({
  products,
  taxSettings,
  terms,
  accountOptions,
  itemOptions,
  ledgerName,
  otherLedgersConnected,
  tuitionModel,
}: {
  products: BillingProduct[];
  taxSettings: TaxSettings;
  terms: { id: string; name: string }[];
  accountOptions: CodeOption[] | null;
  itemOptions: CodeOption[] | null;
  ledgerName: string | null;
  otherLedgersConnected: boolean;
  tuitionModel: TuitionPricingModel;
}) {
  const t = useTranslations("admin.money.products");
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products.filter((p) => {
      // The rate card has its own editor above; it isn't a product a studio
      // sells, it's the studio's pricing model.
      if (p.pricingModel === "hours_ladder") return false;
      if (!showArchived && !p.active) return false;
      if (!query) return true;
      return (
        p.name.toLowerCase().includes(query) ||
        p.code.toLowerCase().includes(query) ||
        (p.description ?? "").toLowerCase().includes(query)
      );
    });
  }, [products, search, showArchived]);

  const grouped = useMemo(() => {
    const map = new Map<ProductCategory, BillingProduct[]>();
    for (const product of visible) {
      const list = map.get(product.category) ?? [];
      list.push(product);
      map.set(product.category, list);
    }
    return [...map.entries()];
  }, [visible]);

  const packageCandidates = products.filter(
    (p) => p.pricingModel !== "package" && p.pricingModel !== "hours_ladder" && p.active,
  );

  function update(patch: Partial<Draft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function save() {
    if (!draft) return;
    const input = toInput(draft);
    if (!input) {
      toast.error(t("errors.incomplete"));
      return;
    }

    startTransition(async () => {
      let productId: string;

      if (draft.id) {
        const result = await updateProduct(draft.id, input);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        productId = draft.id;
      } else {
        const result = await createProduct(input);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        productId = result.productId;
      }

      // Tiers, package contents and per-ledger overrides live in their own
      // tables, so they save alongside rather than inside the product write.
      const priceTiers = draft.tiers
        .map((tier) => {
          const minQuantity = Number.parseFloat(tier.minQuantity);
          if (!Number.isFinite(minQuantity) || minQuantity <= 0) return null;
          const price = Number.parseFloat(tier.unitDollars);
          if (!Number.isFinite(price) || price < 0) return null;
          return { minQuantity, unitAmountCents: Math.round(price * 100) };
        })
        .filter((tier): tier is NonNullable<typeof tier> => tier !== null);

      // saveProductTiers replaces the whole set, so anything the editor no
      // longer renders has to be re-submitted or it's gone.
      const tierResult = await saveProductTiers(productId, [
        ...priceTiers,
        ...draft.legacyPercentTiers.map((tier) => ({
          minQuantity: tier.minQuantity,
          discountBp: tier.discountBp!,
        })),
      ]);
      if (!tierResult.ok) {
        toast.error(tierResult.error);
        return;
      }

      if (draft.pricingModel === "package") {
        const components = draft.components
          .map((component) => {
            const quantity = Number.parseFloat(component.quantity);
            if (!component.componentProductId || !Number.isFinite(quantity) || quantity <= 0) {
              return null;
            }
            return { componentProductId: component.componentProductId, quantity };
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);

        const componentResult = await saveProductComponents(productId, components);
        if (!componentResult.ok) {
          toast.error(componentResult.error);
          return;
        }

        const autoApplyResult = await setProductAutoApply(productId, draft.autoApply);
        if (!autoApplyResult.ok) {
          toast.error(autoApplyResult.error);
          return;
        }
      }

      if (otherLedgersConnected) {
        const ledgerResult = await saveProductLedgerCodes(
          productId,
          draft.ledger.map((l) => ({
            provider: l.provider,
            accountCode: l.accountCode.trim() || undefined,
            itemCode: l.itemCode.trim() || undefined,
            taxCode: l.taxCode.trim() || undefined,
          })),
        );
        if (!ledgerResult.ok) {
          toast.error(ledgerResult.error);
          return;
        }
      }

      toast.success(draft.id ? t("saved") : t("created"));
      setDraft(null);
      location.reload();
    });
  }

  function toggleArchive(product: BillingProduct) {
    startTransition(async () => {
      const result = await setProductActive(product.id, !product.active);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      location.reload();
    });
  }

  const fields = draft ? MODEL_FIELDS[draft.pricingModel] : null;

  /**
   * What this combo would save a family, live as the studio types it.
   *
   * A combo priced at or above what it replaces never fires (matchCombos
   * refuses it), so the studio has to find that out here rather than from a
   * parent who wasn't given the discount.
   */
  const comboSavingsCents = useMemo(() => {
    if (!draft || draft.pricingModel !== "package") return null;

    const priceCents = Math.round(Number.parseFloat(draft.priceDollars) * 100);
    if (!Number.isFinite(priceCents)) return null;

    let partsCents = 0;
    for (const component of draft.components) {
      const child = products.find((p) => p.id === component.componentProductId);
      const quantity = Number.parseFloat(component.quantity);
      if (!child || !Number.isFinite(quantity) || quantity <= 0) return null;
      partsCents += child.unitAmountCents * quantity;
    }

    return partsCents > 0 ? partsCents - priceCents : null;
  }, [draft, products]);

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-ink">{t("title")}</h2>
          <p className="mt-0.5 text-sm text-muted">{t("subtitle")}</p>
        </div>
        <button
          onClick={() => setDraft(emptyDraft())}
          className="btn-brand rounded-xl px-4 py-2 text-sm font-semibold"
        >
          {t("newProduct")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className={`${fieldClass} max-w-xs`}
          style={fieldStyle}
        />
        <label className="flex items-center gap-2 text-xs font-medium text-muted">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          {t("showArchived")}
        </label>
      </div>

      {products.length === 0 ? (
        <GlassPanel className="!p-12 text-center">
          <p className="text-sm font-semibold text-ink">{t("empty.title")}</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">{t("empty.body")}</p>
          <div className="mt-5 flex justify-center gap-2">
            <StarterCatalogButton label={t("empty.seed")} pendingLabel={t("empty.seeding")} />
            <button
              onClick={() => setDraft(emptyDraft())}
              className="rounded-xl border px-4 py-2 text-sm font-semibold text-ink"
              style={{ borderColor: "var(--hair)" }}
            >
              {t("empty.manual")}
            </button>
          </div>
        </GlassPanel>
      ) : (
        grouped.map(([category, items]) => (
          <GlassPanel key={category} className="!p-0 overflow-hidden">
            <p className="border-b px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted"
               style={{ borderColor: "var(--hair)" }}>
              {t(`categories.${category}`)}
            </p>
            {/* These prices stop driving enrolment under an hours ladder, but
                they still drive casual and drop-in bookings — so they're worth
                keeping accurate, and must not be zeroed. */}
            {tuitionModel === "hours" && category === "tuition" && (
              <p className="border-b px-5 py-2 text-xs text-muted"
                 style={{ borderColor: "var(--hair)", background: "var(--t3)" }}>
                {t("hoursModeNote")}
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <tbody>
                  {items.map((product) => (
                    <ProductRow
                      key={product.id}
                      product={product}
                      taxSettings={taxSettings}
                      ledgerName={ledgerName}
                      onEdit={() => setDraft(draftFromProduct(product))}
                      onToggleArchive={() => toggleArchive(product)}
                      labels={{
                        archive: t("archive"),
                        restore: t("restore"),
                        noCode: t("noCode"),
                        archived: t("archived"),
                        taxIncl: t("tax.inclusiveBadge"),
                        taxExcl: t("tax.exclusiveBadge"),
                        zeroRated: t("tax.zeroRatedBadge"),
                        exempt: t("tax.exemptBadge"),
                      }}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        ))
      )}

      {draft && fields && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setDraft(null)} />
          <div
            className="flex w-full max-w-md flex-col shadow-xl"
            style={{ background: "var(--surface)" }}
          >
            <div
              className="flex items-center justify-between border-b p-5"
              style={{ borderColor: "var(--hair)" }}
            >
              <h3 className="font-semibold text-ink">
                {draft.id ? t("editTitle") : t("newTitle")}
              </h3>
              <button onClick={() => setDraft(null)} className="text-xl leading-none text-muted">
                ×
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-5">
              <Section title={t("sections.basics")}>
                <Field label={t("fields.name")}>
                  <input
                    value={draft.name}
                    onChange={(e) =>
                      update({
                        name: e.target.value,
                        // Auto-fill the SKU while it's untouched, so most
                        // studios never have to think about codes at all.
                        code:
                          !draft.id && (draft.code === "" || draft.code === slugifyCode(draft.name))
                            ? slugifyCode(e.target.value)
                            : draft.code,
                      })
                    }
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </Field>
                <Field label={t("fields.code")} hint={t("hints.code")}>
                  <input
                    value={draft.code}
                    onChange={(e) => update({ code: e.target.value.toUpperCase() })}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </Field>
                <Field label={t("fields.category")}>
                  <select
                    value={draft.category}
                    onChange={(e) => update({ category: e.target.value as ProductCategory })}
                    className={fieldClass}
                    style={fieldStyle}
                  >
                    {PRODUCT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {t(`categories.${c}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("fields.description")}>
                  <input
                    value={draft.description}
                    onChange={(e) => update({ description: e.target.value })}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </Field>
              </Section>

              <Section title={t("sections.pricing")}>
                <Field label={t("fields.pricingModel")}>
                  <select
                    value={draft.pricingModel}
                    onChange={(e) => update({ pricingModel: e.target.value as PricingModel })}
                    className={fieldClass}
                    style={fieldStyle}
                  >
                    {PRICING_MODELS.map((m) => (
                      <option key={m} value={m}>
                        {t(`models.${m}`)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label={
                    taxSettings.pricesIncludeTax
                      ? t("fields.priceInclusive")
                      : t("fields.priceExclusive")
                  }
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.priceDollars}
                    onChange={(e) => update({ priceDollars: e.target.value })}
                    className={fieldClass}
                    style={fieldStyle}
                  />
                </Field>

                {fields.units && (
                  <div className="grid grid-cols-3 gap-2">
                    <Field label={t("fields.unitLabel")}>
                      <input
                        value={draft.unitLabel}
                        onChange={(e) => update({ unitLabel: e.target.value })}
                        placeholder="hour"
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </Field>
                    <Field label={t("fields.minUnits")}>
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={draft.minUnits}
                        onChange={(e) => update({ minUnits: e.target.value })}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </Field>
                    <Field label={t("fields.incrementUnits")}>
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={draft.incrementUnits}
                        onChange={(e) => update({ incrementUnits: e.target.value })}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </Field>
                  </div>
                )}

                {fields.credits && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("fields.creditCount")}>
                      <input
                        type="number"
                        min="1"
                        value={draft.creditCount}
                        onChange={(e) => update({ creditCount: e.target.value })}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </Field>
                    <Field label={t("fields.creditExpiryDays")}>
                      <input
                        type="number"
                        min="1"
                        value={draft.creditExpiryDays}
                        onChange={(e) => update({ creditExpiryDays: e.target.value })}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </Field>
                  </div>
                )}

                {fields.recurrence && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label={t("fields.recurringInterval")}>
                      <select
                        value={draft.recurringInterval}
                        onChange={(e) =>
                          update({ recurringInterval: e.target.value as RecurringInterval })
                        }
                        className={fieldClass}
                        style={fieldStyle}
                      >
                        {RECURRING_INTERVALS.map((i) => (
                          <option key={i} value={i}>
                            {t(`intervals.${i}`)}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t("fields.recurringIntervalCount")}>
                      <input
                        type="number"
                        min="1"
                        value={draft.recurringIntervalCount}
                        onChange={(e) => update({ recurringIntervalCount: e.target.value })}
                        className={fieldClass}
                        style={fieldStyle}
                      />
                    </Field>
                  </div>
                )}

                {fields.term && (
                  <Field label={t("fields.term")} hint={t("hints.term")}>
                    <select
                      value={draft.termId}
                      onChange={(e) => update({ termId: e.target.value })}
                      className={fieldClass}
                      style={fieldStyle}
                    >
                      <option value="">{t("fields.anyTerm")}</option>
                      {terms.map((term) => (
                        <option key={term.id} value={term.id}>
                          {term.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}

                {fields.components && (
                  <Field label={t("fields.included")} hint={t("hints.package")}>
                    <div className="space-y-2">
                      {draft.components.map((component, idx) => (
                        <div key={idx} className="flex gap-2">
                          <select
                            value={component.componentProductId}
                            onChange={(e) =>
                              update({
                                components: draft.components.map((c, i) =>
                                  i === idx ? { ...c, componentProductId: e.target.value } : c,
                                ),
                              })
                            }
                            className={`${fieldClass} flex-1`}
                            style={fieldStyle}
                          >
                            <option value="">{t("fields.chooseProduct")}</option>
                            {packageCandidates.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={component.quantity}
                            onChange={(e) =>
                              update({
                                components: draft.components.map((c, i) =>
                                  i === idx ? { ...c, quantity: e.target.value } : c,
                                ),
                              })
                            }
                            className={`${fieldClass} w-20`}
                            style={fieldStyle}
                          />
                          <button
                            onClick={() =>
                              update({ components: draft.components.filter((_, i) => i !== idx) })
                            }
                            className="text-sm text-muted"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() =>
                          update({
                            components: [
                              ...draft.components,
                              { componentProductId: "", quantity: "1" },
                            ],
                          })
                        }
                        className="text-xs font-semibold text-[--brand]"
                      >
                        {t("fields.addIncluded")}
                      </button>

                      {/* The combo trigger. Without it a package is something a
                          studio picks by name; with it, a family selecting
                          these classes is quoted the combo price instead of
                          each class's own. */}
                      <label className="flex items-start gap-2 pt-1 text-sm text-ink">
                        <input
                          type="checkbox"
                          checked={draft.autoApply}
                          onChange={(e) => update({ autoApply: e.target.checked })}
                          className="mt-1"
                        />
                        <span>
                          {t("fields.autoApply")}
                          <span className="mt-0.5 block text-xs text-muted">
                            {t("hints.autoApply")}
                          </span>
                        </span>
                      </label>

                      {draft.autoApply && comboSavingsCents != null && (
                        <p
                          className={`text-xs ${comboSavingsCents > 0 ? "text-muted" : "text-amber-600"}`}
                        >
                          {comboSavingsCents > 0
                            ? t("hints.comboSaves", { amount: formatMoney(comboSavingsCents) })
                            : t("hints.comboNeverFires")}
                        </p>
                      )}
                    </div>
                  </Field>
                )}
              </Section>

              {/* Volume tiers price one product bought several times. Under an
                  hours ladder or a combo the total comes from elsewhere, so
                  showing them would be offering a lever that does nothing. */}
              {tuitionModel === "per_class" && (
              <Section title={t("sections.volume")} hint={t("hints.volume")}>
                {draft.legacyPercentTiers.map((tier) => (
                  <div
                    key={tier.id}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted"
                    style={{ background: "var(--t3)" }}
                  >
                    <span className="flex-1">
                      {t("tiers.legacyPercent", {
                        from: tier.minQuantity,
                        percent: (tier.discountBp ?? 0) / 100,
                      })}
                    </span>
                    <button
                      onClick={() =>
                        update({
                          legacyPercentTiers: draft.legacyPercentTiers.filter(
                            (lt) => lt.id !== tier.id,
                          ),
                        })
                      }
                      className="text-sm text-muted"
                      aria-label={t("tiers.remove")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {draft.tiers.map((tier, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <span className="text-xs text-muted">{t("tiers.from")}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={tier.minQuantity}
                      onChange={(e) =>
                        update({
                          tiers: draft.tiers.map((tr, i) =>
                            i === idx ? { ...tr, minQuantity: e.target.value } : tr,
                          ),
                        })
                      }
                      className={`${fieldClass} w-20`}
                      style={fieldStyle}
                    />
                    <span className="text-xs text-muted">{t("tiers.priceEach")}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={tier.unitDollars}
                      onChange={(e) =>
                        update({
                          tiers: draft.tiers.map((tr, i) =>
                            i === idx ? { ...tr, unitDollars: e.target.value } : tr,
                          ),
                        })
                      }
                      className={`${fieldClass} flex-1`}
                      style={fieldStyle}
                    />
                    <button
                      onClick={() => update({ tiers: draft.tiers.filter((_, i) => i !== idx) })}
                      className="text-sm text-muted"
                      aria-label={t("tiers.remove")}
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update({
                      tiers: [...draft.tiers, { minQuantity: "2", unitDollars: "" }],
                    })
                  }
                  className="text-xs font-semibold text-[--brand]"
                >
                  {t("tiers.add")}
                </button>
              </Section>
              )}

              <Section title={t("sections.tax")}>
                {!taxSettings.gstRegistered && (
                  <p className="rounded-lg px-3 py-2 text-xs text-muted" style={{ background: "var(--t3)" }}>
                    {t("tax.notRegistered")}
                  </p>
                )}
                <Field label={t("fields.taxTreatment")}>
                  <select
                    value={draft.taxTreatment}
                    onChange={(e) => update({ taxTreatment: e.target.value as TaxTreatment })}
                    className={fieldClass}
                    style={fieldStyle}
                  >
                    {TAX_TREATMENTS.map((treatment) => (
                      <option key={treatment} value={treatment}>
                        {t(`tax.${treatment}`)}
                      </option>
                    ))}
                  </select>
                </Field>
                {draft.taxTreatment === "standard" && (
                  <Field label={t("fields.taxRate")}>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={draft.taxRatePct}
                      onChange={(e) => update({ taxRatePct: e.target.value })}
                      className={fieldClass}
                      style={fieldStyle}
                    />
                  </Field>
                )}
                <TaxPreview draft={draft} taxSettings={taxSettings} labels={{
                  subtotal: t("tax.subtotal"),
                  tax: t("tax.tax"),
                  total: t("tax.total"),
                }} />
              </Section>

              <Section
                title={t("sections.accounting")}
                hint={ledgerName ? t("hints.accountingConnected", { ledger: ledgerName }) : t("hints.accountingOffline")}
              >
                <Field label={t("fields.accountCode")}>
                  <CodeInput
                    value={draft.accountCode}
                    options={accountOptions}
                    placeholder="200"
                    onChange={(value) => update({ accountCode: value })}
                    freeTextLabel={t("fields.customCode")}
                  />
                </Field>
                <Field label={t("fields.itemCode")} hint={t("hints.itemCode")}>
                  <CodeInput
                    value={draft.itemCode}
                    options={itemOptions}
                    placeholder={draft.code}
                    onChange={(value) => update({ itemCode: value })}
                    freeTextLabel={t("fields.customCode")}
                  />
                </Field>

                {otherLedgersConnected && (
                  <details className="rounded-xl border p-3" style={{ borderColor: "var(--hair)" }}>
                    <summary className="cursor-pointer text-xs font-semibold text-ink">
                      {t("fields.otherLedgers")}
                    </summary>
                    <div className="mt-3 space-y-3">
                      {draft.ledger.map((entry, idx) => (
                        <div key={entry.provider} className="space-y-1">
                          <p className="text-xs font-semibold text-muted">
                            {t(`ledgers.${entry.provider}`)}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <input
                              value={entry.accountCode}
                              placeholder={t("fields.accountCode")}
                              onChange={(e) =>
                                update({
                                  ledger: draft.ledger.map((l, i) =>
                                    i === idx ? { ...l, accountCode: e.target.value } : l,
                                  ),
                                })
                              }
                              className={fieldClass}
                              style={fieldStyle}
                            />
                            <input
                              value={entry.itemCode}
                              placeholder={t("fields.itemCode")}
                              onChange={(e) =>
                                update({
                                  ledger: draft.ledger.map((l, i) =>
                                    i === idx ? { ...l, itemCode: e.target.value } : l,
                                  ),
                                })
                              }
                              className={fieldClass}
                              style={fieldStyle}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </Section>
            </div>

            <div className="flex gap-3 border-t p-5" style={{ borderColor: "var(--hair)" }}>
              <button
                onClick={() => setDraft(null)}
                className="flex-1 rounded-xl border py-2 text-sm"
                style={{ borderColor: "var(--hair)" }}
              >
                {t("cancel")}
              </button>
              <button
                onClick={save}
                disabled={pending}
                className="btn-brand flex-1 rounded-xl py-2 text-sm font-semibold disabled:opacity-50"
              >
                {pending ? t("saving") : t("save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

function ProductRow({
  product,
  taxSettings,
  ledgerName,
  onEdit,
  onToggleArchive,
  labels,
}: {
  product: BillingProduct;
  taxSettings: TaxSettings;
  ledgerName: string | null;
  onEdit: () => void;
  onToggleArchive: () => void;
  labels: Record<string, string>;
}) {
  const unit = defaultUnitLabel(product);
  const taxBadge = !taxSettings.gstRegistered
    ? labels.exempt
    : product.taxTreatment === "zero_rated"
      ? labels.zeroRated
      : product.taxTreatment === "exempt"
        ? labels.exempt
        : taxSettings.pricesIncludeTax
          ? labels.taxIncl
          : labels.taxExcl;

  // Amber when a ledger is connected but this product has no revenue account —
  // that's the case that silently posts to the studio's catch-all.
  const missingCode = Boolean(ledgerName) && !product.accountCode;

  return (
    <tr className="border-b last:border-0" style={{ borderColor: "var(--hair)" }}>
      <td className="px-5 py-3">
        <button onClick={onEdit} className="text-left">
          <span className="text-sm font-medium text-ink">{product.name}</span>
          <span className="ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold text-muted"
                style={{ background: "var(--t3)" }}>
            {product.code}
          </span>
          {!product.active && (
            <span className="ml-2 text-[10px] font-semibold uppercase text-muted">
              {labels.archived}
            </span>
          )}
        </button>
        {product.description && (
          <p className="mt-0.5 text-xs text-muted">{product.description}</p>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-sm text-ink">
        {formatMoney(product.unitAmountCents)}
        {unit ? <span className="text-muted"> / {unit}</span> : null}
        {product.tiers.length > 0 && (
          <span className="ml-2 text-[10px] text-muted">
            ↓ {formatMoney(resolveTierPrice(product, product.tiers.at(-1)!.minQuantity))}
          </span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-xs text-muted">{taxBadge}</td>
      <td className="whitespace-nowrap px-3 py-3 text-xs">
        <span className={missingCode ? "text-amber-600" : "text-muted"}>
          {product.accountCode ?? labels.noCode}
          {product.itemCode ? ` · ${product.itemCode}` : ""}
        </span>
      </td>
      <td className="whitespace-nowrap px-5 py-3 text-right">
        <button onClick={onToggleArchive} className="text-xs font-semibold text-muted">
          {product.active ? labels.archive : labels.restore}
        </button>
      </td>
    </tr>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</p>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {children}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted">{hint}</span>}
    </label>
  );
}

/**
 * A dropdown when the ledger gave us a live list, a plain text box otherwise.
 * "Something else" keeps free entry available even with a list, because a
 * bookkeeper may be about to create the code on their side.
 */
function CodeInput({
  value,
  options,
  placeholder,
  onChange,
  freeTextLabel,
}: {
  value: string;
  options: CodeOption[] | null;
  placeholder: string;
  onChange: (value: string) => void;
  freeTextLabel: string;
}) {
  const known = options?.some((o) => o.code === value) ?? false;
  const [freeText, setFreeText] = useState(!known && value !== "");

  if (!options || freeText) {
    return (
      <div className="space-y-1">
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={fieldClass}
          style={fieldStyle}
        />
        {options && (
          <button onClick={() => setFreeText(false)} className="text-[11px] text-[--brand]">
            ↩
          </button>
        )}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === "__free__") {
          setFreeText(true);
          return;
        }
        onChange(e.target.value);
      }}
      className={fieldClass}
      style={fieldStyle}
    >
      <option value="">—</option>
      {options.map((option) => (
        <option key={option.code} value={option.code}>
          {option.code} · {option.name}
        </option>
      ))}
      <option value="__free__">{freeTextLabel}</option>
    </select>
  );
}

/** Live GST split at the entered price, so the number means something. */
function TaxPreview({
  draft,
  taxSettings,
  labels,
}: {
  draft: Draft;
  taxSettings: TaxSettings;
  labels: { subtotal: string; tax: string; total: string };
}) {
  const price = Number.parseFloat(draft.priceDollars);
  if (!Number.isFinite(price) || price <= 0) return null;

  const rate = Number.parseFloat(draft.taxRatePct);
  const split = splitTax(Math.round(price * 100), {
    inclusive: taxSettings.pricesIncludeTax,
    taxRateBp: Number.isFinite(rate) ? Math.round(rate * 100) : 1500,
    treatment: draft.taxTreatment,
    registered: taxSettings.gstRegistered,
  });

  return (
    <div className="rounded-lg px-3 py-2 text-xs text-muted" style={{ background: "var(--t3)" }}>
      {labels.subtotal} {formatMoney(split.subtotalCents)} · {labels.tax}{" "}
      {formatMoney(split.taxCents)} · {labels.total}{" "}
      <span className="font-semibold text-ink">{formatMoney(split.totalCents)}</span>
    </div>
  );
}

function StarterCatalogButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { seedStarterCatalog } = await import("@/app/portal/admin/money/product-actions");
          const result = await seedStarterCatalog();
          if (!result.ok) {
            toast.error(result.error);
            return;
          }
          location.reload();
        })
      }
      className="btn-brand rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
    >
      {pending ? pendingLabel : label}
    </button>
  );
}
