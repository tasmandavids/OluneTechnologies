"use client";

import { formatMoney } from "@/lib/currency";

export type EditableLineItem = {
  description: string;
  quantity: string;
  unitDollars: string;
};

export function emptyLineItem(): EditableLineItem {
  return { description: "", quantity: "1", unitDollars: "" };
}

export function fromInvoiceLineItems(
  lineItems: { description: string; quantity: number; unitCents: number }[],
): EditableLineItem[] {
  return lineItems.map((li) => ({
    description: li.description,
    quantity: String(li.quantity),
    unitDollars: (li.unitCents / 100).toFixed(2),
  }));
}

export function lineItemsTotalCents(items: EditableLineItem[]): number {
  return items.reduce((sum, li) => {
    const qty = Number.parseInt(li.quantity, 10);
    const unit = Number.parseFloat(li.unitDollars);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit) || unit < 0) return sum;
    return sum + Math.round(unit * 100) * qty;
  }, 0);
}

/** Validates and converts editor rows into the server-action payload shape. */
export function toLineItemPayload(
  items: EditableLineItem[],
): { ok: true; lineItems: { description: string; quantity: number; unitDollars: number }[] } | { ok: false } {
  const lineItems: { description: string; quantity: number; unitDollars: number }[] = [];
  for (const li of items) {
    const description = li.description.trim();
    const quantity = Number.parseInt(li.quantity, 10);
    const unitDollars = Number.parseFloat(li.unitDollars);
    if (!description) return { ok: false };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false };
    if (!Number.isFinite(unitDollars) || unitDollars < 0) return { ok: false };
    lineItems.push({ description, quantity, unitDollars });
  }
  if (lineItems.length === 0) return { ok: false };
  return { ok: true, lineItems };
}

export function LineItemRows({
  items,
  onChange,
  labels,
  disabled,
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
  };
  disabled?: boolean;
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
            min="1"
            step="1"
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
