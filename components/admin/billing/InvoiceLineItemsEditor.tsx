"use client";

import { formatMoney } from "@/lib/currency";

export type EditableLineItem = {
  description: string;
  quantity: string;
  unitDollars: string;
  /** Set when the line was picked from the catalogue rather than typed. */
  productId?: string;
};

/** The catalogue entries offered in the per-line picker. */
export type LineProductOption = {
  id: string;
  name: string;
  code: string;
  unitAmountCents: number;
  unitLabel: string | null;
};

export function emptyLineItem(): EditableLineItem {
  return { description: "", quantity: "1", unitDollars: "" };
}

export function fromInvoiceLineItems(
  lineItems: { description: string; quantity: number; unitCents: number; productId?: string | null }[],
): EditableLineItem[] {
  return lineItems.map((li) => ({
    description: li.description,
    quantity: String(li.quantity),
    unitDollars: (li.unitCents / 100).toFixed(2),
    productId: li.productId ?? undefined,
  }));
}

// Quantities are parsed as floats, not ints: hourly catalogue products bill in
// fractions of an hour, and invoice_line_items.quantity is numeric(10,3).
export function lineItemsTotalCents(items: EditableLineItem[]): number {
  return items.reduce((sum, li) => {
    const qty = Number.parseFloat(li.quantity);
    const unit = Number.parseFloat(li.unitDollars);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit) || unit < 0) return sum;
    return sum + Math.round(Math.round(unit * 100) * qty);
  }, 0);
}

export type LineItemPayload = {
  description: string;
  quantity: number;
  unitDollars: number;
  productId?: string;
};

/** Validates and converts editor rows into the server-action payload shape. */
export function toLineItemPayload(
  items: EditableLineItem[],
): { ok: true; lineItems: LineItemPayload[] } | { ok: false } {
  const lineItems: LineItemPayload[] = [];
  for (const li of items) {
    const description = li.description.trim();
    const quantity = Math.round(Number.parseFloat(li.quantity) * 1000) / 1000;
    const unitDollars = Number.parseFloat(li.unitDollars);
    if (!description) return { ok: false };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false };
    if (!Number.isFinite(unitDollars) || unitDollars < 0) return { ok: false };
    lineItems.push({ description, quantity, unitDollars, productId: li.productId });
  }
  if (lineItems.length === 0) return { ok: false };
  return { ok: true, lineItems };
}

export function LineItemRows({
  items,
  onChange,
  labels,
  disabled,
  products,
}: {
  items: EditableLineItem[];
  onChange: (items: EditableLineItem[]) => void;
  labels: {
    description: string;
    quantity: string;
    unitPrice: string;
    addLine: string;
    remove: string;
    total: string;
    /** Placeholder for the catalogue picker; omit to keep lines free-text only. */
    product?: string;
  };
  disabled?: boolean;
  /** When given, each row offers a catalogue picker that fills the line. */
  products?: LineProductOption[];
}) {
  const update = (idx: number, patch: Partial<EditableLineItem>) => {
    onChange(items.map((li, i) => (i === idx ? { ...li, ...patch } : li)));
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, emptyLineItem()]);
  const total = lineItemsTotalCents(items);

  return (
    <div className="space-y-2">
      {items.map((li, idx) => (
        <div key={idx} className="flex items-start gap-2">
          {products && products.length > 0 && !disabled && (
            <select
              value={li.productId ?? ""}
              onChange={(e) => {
                const product = products.find((p) => p.id === e.target.value);
                if (!product) {
                  // Back to a free-text line: keep whatever's typed, drop the link.
                  update(idx, { productId: undefined });
                  return;
                }
                update(idx, {
                  productId: product.id,
                  description: product.name,
                  unitDollars: (product.unitAmountCents / 100).toFixed(2),
                });
              }}
              className="w-36 shrink-0 rounded-lg border border-[--hair] bg-base px-2 py-1.5 text-sm text-ink"
            >
              <option value="">{labels.product ?? "Custom"}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="text"
            value={li.description}
            onChange={(e) => update(idx, { description: e.target.value })}
            placeholder={labels.description}
            disabled={disabled}
            className="min-w-0 flex-1 rounded-lg border border-[--hair] bg-base px-2.5 py-1.5 text-sm text-ink disabled:opacity-60"
          />
          <input
            type="number"
            min="0"
            step="0.25"
            value={li.quantity}
            onChange={(e) => update(idx, { quantity: e.target.value })}
            placeholder={labels.quantity}
            disabled={disabled}
            className="w-16 rounded-lg border border-[--hair] bg-base px-2 py-1.5 text-sm text-ink disabled:opacity-60"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={li.unitDollars}
            onChange={(e) => update(idx, { unitDollars: e.target.value })}
            placeholder={labels.unitPrice}
            disabled={disabled}
            className="w-24 rounded-lg border border-[--hair] bg-base px-2 py-1.5 text-sm text-ink disabled:opacity-60"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => remove(idx)}
              disabled={items.length <= 1}
              className="rounded-lg px-2 py-1.5 text-sm text-muted hover:text-[#dc2626] disabled:opacity-30"
              aria-label={labels.remove}
            >
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        {!disabled && (
          <button
            type="button"
            onClick={add}
            className="rounded-lg border border-[--hair] px-2.5 py-1 text-xs font-semibold text-ink hover:bg-base"
          >
            + {labels.addLine}
          </button>
        )}
        <span className="ml-auto text-sm font-bold text-ink">
          {labels.total}: {formatMoney(total)}
        </span>
      </div>
    </div>
  );
}
