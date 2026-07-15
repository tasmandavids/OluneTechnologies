"use client";

import { useEscToClose } from "@/lib/useEscToClose";
import { panelSlide } from "@/lib/motion";
import { confirmDialog } from "@/lib/feedback";
import { useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  createProduct,
  updateProduct,
  adjustStock,
  toggleProductActive,
  deleteProduct,
  type ProductFormData,
} from "@/app/portal/admin/shop/actions";
import { refundSale } from "@/app/portal/admin/billing/refund-actions";
import { OptimizableImage } from "@/components/ui/OptimizableImage";

interface Product {
  id:          string;
  name:        string;
  description: string | null;
  price_cents: number;
  stock_qty:   number;
  sku:         string | null;
  category:    string | null;
  image_url:   string | null;
  active:      boolean;
  created_at:  string;
}

interface Order {
  id:                       string;
  total_cents:              number;
  status:                   string;
  created_at:               string;
  user_id:                  string;
  stripe_payment_intent_id: string | null;
  profiles: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
}

interface Props {
  products:     Product[];
  recentOrders: Order[];
}

const STATUS_BADGE: Record<string, string> = {
  pending:   "bg-yellow-500/10 text-yellow-600",
  paid:      "bg-green-500/10 text-green-600",
  cancelled: "bg-red-500/10 text-red-500",
  refunded:  "bg-gray-500/10 text-gray-500",
};

function formatPrice(cents: number) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(cents / 100);
}

const BLANK: ProductFormData = {
  name:        "",
  description: "",
  priceCents:  0,
  stockQty:    0,
  sku:         "",
  barcode:     "",
  imageUrl:    "",
  category:    "",
  active:      true,
};

function OrderRefundButton({ order, onDone }: { order: Order; onDone: (id: string) => void }) {
  const t = useTranslations("admin.shop.orders");
  const tShared = useTranslations("admin.shared");

  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  if (order.status !== "paid") return <span className="text-muted">{tShared("dash")}</span>;
  if (!order.stripe_payment_intent_id) {
    return <span className="text-[0.7rem] text-muted">{tShared("noCardPayment")}</span>;
  }

  const onClick = async () => {
    setErr(null);
    if (!(await confirmDialog({ title: t("refundConfirm", { amount: formatPrice(order.total_cents) }), destructive: true }))) {
      return;
    }
    startTransition(async () => {
      const res = await refundSale("order", order.id);
      if (res.ok) onDone(order.id);
      else setErr(res.error);
    });
  };

  return (
    <div className="flex flex-col items-start gap-0.5">
      <button
        onClick={onClick}
        disabled={pending}
        className="rounded-lg border border-[--hair] px-2.5 py-1 text-[0.7rem] font-semibold text-red-500 hover:bg-red-500/10 disabled:opacity-50"
      >
        {pending ? tShared("refunding") : tShared("refund")}
      </button>
      {err && <span className="text-[0.65rem] text-red-500">{err}</span>}
    </div>
  );
}

export function ShopManager({ products: initial, recentOrders: initialOrders }: Props) {
  const t = useTranslations("admin.shop");
  const tShared = useTranslations("admin.shared");
  const tCommon = useTranslations("common");
  const tStatus = useTranslations("admin.shared.status");

  const [products,   setProducts]   = useState(initial);
  const [orders,     setOrders]      = useState<Order[]>(initialOrders);
  const [activeTab,  setActiveTab]  = useState<"products" | "orders">("products");
  const [search,     setSearch]     = useState("");
  const [catFilter,  setCatFilter]  = useState("all");
  const [slideOpen,  setSlideOpen]  = useState(false);
  useEscToClose(closeSlide, slideOpen);
  const [editTarget, setEditTarget] = useState<Product | null>(null);
  const [form,       setForm]       = useState<ProductFormData>(BLANK);
  const [saving,     setSaving]     = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category).filter((c): c is string => c != null)))];

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q);
    const matchCat    = catFilter === "all" || p.category === catFilter;
    return matchSearch && matchCat;
  });

  function openCreate() {
    setEditTarget(null);
    setForm(BLANK);
    setError(null);
    setSlideOpen(true);
  }

  function openEdit(p: Product) {
    setEditTarget(p);
    setForm({
      name:        p.name,
      description: p.description ?? "",
      priceCents:  p.price_cents,
      stockQty:    p.stock_qty,
      sku:         p.sku ?? "",
      barcode:     "",
      imageUrl:    p.image_url ?? "",
      category:    p.category ?? "",
      active:      p.active,
    });
    setError(null);
    setSlideOpen(true);
  }

  function closeSlide() {
    setSlideOpen(false);
    setEditTarget(null);
    setError(null);
  }

  function field(k: keyof ProductFormData, v: string | number | boolean) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    const result = editTarget
      ? await updateProduct(editTarget.id, form)
      : await createProduct(form);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    closeSlide();
    window.location.reload();
  }

  async function handleToggle(p: Product) {
    await toggleProductActive(p.id, !p.active);
    setProducts((prev) => prev.map((x) => x.id === p.id ? { ...x, active: !x.active } : x));
  }

  async function handleAdjust(p: Product, delta: number) {
    const res = await adjustStock(p.id, delta);
    if (res.ok) {
      setProducts((prev) =>
        prev.map((x) => x.id === p.id ? { ...x, stock_qty: Math.max(0, x.stock_qty + delta) } : x)
      );
    }
  }

  async function handleDelete(p: Product) {
    if (!(await confirmDialog({ title: t("deleteConfirm", { name: p.name }), destructive: true }))) return;
    const res = await deleteProduct(p.id);
    if (res.ok) setProducts((prev) => prev.filter((x) => x.id !== p.id));
  }

  const markOrderRefunded = (id: string) =>
    setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: "refunded" } : o)));

  const formFields = [
    { label: t("form.productName"), key: "name" as const, type: "text", placeholder: t("form.productNamePlaceholder") },
    { label: t("form.category"), key: "category" as const, type: "text", placeholder: t("form.categoryPlaceholder") },
    { label: t("form.sku"), key: "sku" as const, type: "text", placeholder: t("form.skuPlaceholder") },
    { label: t("form.imageUrl"), key: "imageUrl" as const, type: "url", placeholder: t("form.imagePlaceholder") },
  ];

  return (
    <div className="h-full overflow-auto">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-black text-ink">{t("title")}</h1>
            <p className="text-sm text-muted">
              {tShared("activeProductsCount", { count: products.filter((p) => p.active).length })}
            </p>
          </div>
          <button
            onClick={openCreate}
            className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition-opacity"
          >
            {t("addProduct")}
          </button>
        </div>

        <div className="mb-6 flex gap-1 rounded-xl border border-[--hair] bg-base p-1 w-fit">
          {(["products", "orders"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {tab === "products"
                ? t("tabs.products", { count: products.length })
                : t("tabs.orders", { count: orders.length })}
            </button>
          ))}
        </div>

        {activeTab === "products" && (
          <>
            <div className="mb-5 flex flex-wrap gap-3">
              <input
                type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder={t("searchPlaceholder")}
                className="w-64 rounded-xl border border-[--hair] bg-surface px-4 py-2 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
              />
              <div className="flex gap-2">
                {categories.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCatFilter(c)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors capitalize ${
                      catFilter === c
                        ? "bg-brand text-white"
                        : "border border-[--hair] text-muted hover:text-ink"
                    }`}
                  >
                    {c === "all" ? t("allCategory") : c}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[--hair] py-16 text-center">
                <p className="text-3xl mb-3">🛍️</p>
                <p className="font-semibold text-ink">{t("empty.title")}</p>
                <p className="text-sm text-muted mt-1">{t("empty.description")}</p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => (
                  <div
                    key={p.id}
                    className={`rounded-2xl border border-[--hair] bg-surface p-4 transition-opacity ${!p.active ? "opacity-50" : ""}`}
                  >
                    <div className="relative mb-3 h-32 w-full overflow-hidden rounded-xl bg-base">
                      {p.image_url ? (
                        <OptimizableImage
                          src={p.image_url}
                          alt={p.name}
                          fill
                          sizes="128px"
                          className="object-cover"
                        />
                      ) : (
                        <span className="absolute inset-0 grid place-items-center text-4xl">📦</span>
                      )}
                    </div>

                    <p className="font-semibold text-ink truncate">{p.name}</p>
                    {p.category && (
                      <p className="text-xs text-muted capitalize">{p.category}</p>
                    )}
                    <p className="mt-1 text-lg font-black text-brand">{formatPrice(p.price_cents)}</p>

                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => handleAdjust(p, -1)}
                        className="h-6 w-6 rounded-md border border-[--hair] text-xs text-muted hover:text-ink"
                      >−</button>
                      <span className={`text-sm font-semibold ${p.stock_qty === 0 ? "text-red-500" : "text-ink"}`}>
                        {t("inStock", { count: p.stock_qty })}
                      </span>
                      <button
                        onClick={() => handleAdjust(p, 1)}
                        className="h-6 w-6 rounded-md border border-[--hair] text-xs text-muted hover:text-ink"
                      >+</button>
                    </div>

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => openEdit(p)}
                        className="flex-1 rounded-lg border border-[--hair] py-1 text-xs text-muted hover:text-ink"
                      >
                        {tCommon("edit")}
                      </button>
                      <button
                        onClick={() => handleToggle(p)}
                        className={`flex-1 rounded-lg py-1 text-xs font-medium ${
                          p.active
                            ? "border border-[--hair] text-muted hover:text-red-500"
                            : "bg-brand/10 text-brand hover:opacity-80"
                        }`}
                      >
                        {p.active ? t("deactivate") : t("activate")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {activeTab === "orders" && (
          <div className="rounded-2xl border border-[--hair] bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[--hair] bg-base">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{t("orders.table.customer")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{t("orders.table.total")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{t("orders.table.status")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted">{t("orders.table.date")}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted"></th>
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted">{t("orders.empty")}</td>
                  </tr>
                ) : (
                  orders.map((o) => {
                    const profile = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles;
                    const name = profile
                      ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || tShared("unknown")
                      : tShared("unknown");
                    return (
                      <tr key={o.id} className="border-b border-[--hair] last:border-0 hover:bg-base/50">
                        <td className="px-4 py-3 font-medium text-ink">{name}</td>
                        <td className="px-4 py-3 font-semibold text-ink">{formatPrice(o.total_cents)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold ${STATUS_BADGE[o.status] ?? ""}`}>
                            {(o.status === "paid" || o.status === "pending" || o.status === "cancelled" || o.status === "refunded")
                              ? tStatus(o.status)
                              : o.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted">
                          {new Date(o.created_at).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3">
                          <OrderRefundButton order={o} onDone={markOrderRefunded} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {slideOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={closeSlide}
            />
            <motion.div
              {...panelSlide}
              className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-surface shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-[--hair] px-6 py-4">
                <h2 className="font-semibold text-ink">
                  {editTarget ? t("form.editProduct") : t("form.newProduct")}
                </h2>
                <button onClick={closeSlide} className="text-muted hover:text-ink text-lg">✕</button>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
                {formFields.map(({ label, key, type, placeholder }) => (
                  <div key={key}>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">{label}</label>
                    <input
                      type={type} value={form[key] as string} onChange={(e) => field(key, e.target.value)}
                      placeholder={placeholder}
                      className="w-full rounded-xl border border-[--hair] bg-base px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                    />
                  </div>
                ))}

                <div>
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">{t("form.description")}</label>
                  <textarea
                    rows={3} value={form.description} onChange={(e) => field("description", e.target.value)}
                    placeholder={t("form.descriptionPlaceholder")}
                    className="w-full resize-none rounded-xl border border-[--hair] bg-base px-4 py-2.5 text-sm text-ink placeholder:text-muted focus:border-brand focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">{t("form.priceCents")}</label>
                    <input
                      type="number" min="0" step="100" value={form.priceCents}
                      onChange={(e) => field("priceCents", parseInt(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[--hair] bg-base px-4 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
                    />
                    <p className="mt-1 text-[0.65rem] text-muted">{formatPrice(form.priceCents as number)}</p>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted">{t("form.stockQty")}</label>
                    <input
                      type="number" min="0" value={form.stockQty}
                      onChange={(e) => field("stockQty", parseInt(e.target.value) || 0)}
                      className="w-full rounded-xl border border-[--hair] bg-base px-4 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => field("active", !form.active)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${form.active ? "bg-brand" : "bg-[--hair]"}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.active ? "translate-x-5" : "translate-x-0.5"}`} />
                  </button>
                  <span className="text-sm text-ink">{t("form.activeLabel")}</span>
                </div>

                {error && (
                  <p className="rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-500">{error}</p>
                )}
              </div>

              <div className="flex gap-3 border-t border-[--hair] px-6 py-4">
                <button onClick={closeSlide} className="flex-1 rounded-xl border border-[--hair] py-2 text-sm text-muted hover:text-ink">
                  {tCommon("cancel")}
                </button>
                <button
                  onClick={save} disabled={saving}
                  className="flex-1 rounded-xl bg-brand py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
                >
                  {saving
                    ? tShared("saving")
                    : editTarget
                      ? t("form.update")
                      : t("form.createProduct")}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
