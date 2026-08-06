"use client";

import { useState, useTransition } from "react";
import type { ContractorInvoice, ClientOption } from "@/app/portal/teacher/invoices/page";
import {
  createContractorInvoice,
  updateContractorInvoice,
  markInvoiceSent,
  sendContractorInvoice,
  markInvoicePaid,
  voidContractorInvoice,
  deleteContractorInvoice,
} from "@/app/portal/teacher/invoices/actions";
import { formatMoney } from "@/lib/currency";

type LineItem = { description: string; quantity: number; unit_cents: number };

const EMPTY_FORM = {
  recipient_label: "",
  studio_id: null as string | null,
  private_client_id: null as string | null,
  description: "",
  line_items: [{ description: "", quantity: 1, unit_cents: 0 }] as LineItem[],
  due_date: "",
  notes: "",
};

const STATUS_STYLE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  sent: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  void: "bg-red-100 text-red-600",
};

function totalCents(items: LineItem[]) {
  return items.reduce((s, i) => s + Math.round(i.quantity * i.unit_cents), 0);
}

export function ContractorInvoicesManager({
  invoices: initial,
  clientOptions,
}: {
  invoices: ContractorInvoice[];
  clientOptions: ClientOption[];
}) {
  const [invoices, setInvoices] = useState(initial);
  const [filter, setFilter] = useState<"all" | ContractorInvoice["status"]>("all");
  const [slide, setSlide] = useState<"create" | ContractorInvoice | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = filter === "all" ? invoices : invoices.filter((i) => i.status === filter);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setSlide("create");
  }

  function openEdit(inv: ContractorInvoice) {
    setForm({
      recipient_label: inv.recipientLabel,
      studio_id: inv.studioId,
      private_client_id: inv.privateClientId,
      description: inv.description,
      line_items: inv.lineItems.length ? inv.lineItems : [{ description: "", quantity: 1, unit_cents: 0 }],
      due_date: inv.dueDate ?? "",
      notes: inv.notes ?? "",
    });
    setError(null);
    setSlide(inv);
  }

  function setLineItem(index: number, patch: Partial<LineItem>) {
    setForm((f) => ({
      ...f,
      line_items: f.line_items.map((li, i) => (i === index ? { ...li, ...patch } : li)),
    }));
  }

  function handleClientSelect(opt: ClientOption | null) {
    setForm((f) => ({
      ...f,
      recipient_label: opt?.label ?? "",
      studio_id: opt?.kind === "studio" ? opt.id : null,
      private_client_id: opt?.kind === "private" ? opt.id : null,
    }));
  }

  function handleSave() {
    setError(null);
    const amount_cents = totalCents(form.line_items);
    const payload = {
      ...form,
      amount_cents,
      due_date: form.due_date || null,
      notes: form.notes || null,
    };
    startTransition(async () => {
      if (slide === "create") {
        const res = await createContractorInvoice(payload);
        if (res?.error) { setError(res.error); return; }
        location.reload();
      } else if (slide) {
        const res = await updateContractorInvoice(slide.id, payload);
        if (res?.error) { setError(res.error); return; }
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === slide.id
              ? { ...inv, ...payload, lineItems: form.line_items, amountCents: amount_cents }
              : inv
          )
        );
        setSlide(null);
      }
    });
  }

  function handleAction(id: string, action: "send" | "sent" | "paid" | "void" | "delete") {
    startTransition(async () => {
      let res;
      // "send" emails it for real; "sent" only records that the instructor
      // delivered it themselves. Both land the invoice in the same status.
      if (action === "send") res = await sendContractorInvoice(id);
      else if (action === "sent") res = await markInvoiceSent(id);
      else if (action === "paid") res = await markInvoicePaid(id);
      else if (action === "void") res = await voidContractorInvoice(id);
      else res = await deleteContractorInvoice(id);
      if (res?.error) { setError(res.error); return; }
      if (action === "delete") {
        setInvoices((prev) => prev.filter((i) => i.id !== id));
      } else {
        const nextStatus =
          action === "send" || action === "sent" ? "sent" : action === "paid" ? "paid" : "void";
        setInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, status: nextStatus } : i)));
      }
    });
  }

  const paidTotal = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amountCents, 0);
  const outstandingTotal = invoices.filter((i) => ["draft", "sent"].includes(i.status)).reduce((s, i) => s + i.amountCents, 0);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-content">Invoices</h1>
          <p className="text-sm text-base-content/60 mt-0.5">Bill studios and private clients</p>
        </div>
        <button onClick={openCreate} className="btn-brand px-4 py-2 rounded-lg text-sm font-medium">
          + New invoice
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface rounded-xl p-4 shadow-sm">
          <p className="text-xs text-base-content/50 uppercase tracking-wide">Paid (all time)</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{formatMoney(paidTotal)}</p>
        </div>
        <div className="bg-surface rounded-xl p-4 shadow-sm">
          <p className="text-xs text-base-content/50 uppercase tracking-wide">Outstanding</p>
          <p className="text-2xl font-bold text-brand mt-1">{formatMoney(outstandingTotal)}</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "draft", "sent", "paid", "void"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filter === f ? "bg-brand text-white" : "bg-base-200 text-base-content/70 hover:bg-base-300"
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>}

      {/* Invoice list */}
      {visible.length === 0 ? (
        <div className="border-2 border-dashed border-base-300 rounded-xl p-12 text-center">
          <p className="text-base-content/50 text-sm">No invoices here yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((inv) => (
            <div key={inv.id} className="bg-surface rounded-xl p-4 shadow-sm flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {inv.invoiceNumber && (
                    <span className="text-xs text-base-content/40 font-mono">#{inv.invoiceNumber}</span>
                  )}
                  <p className="font-semibold text-base-content truncate">{inv.recipientLabel}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[inv.status]}`}>
                    {inv.status}
                  </span>
                </div>
                <p className="text-sm text-base-content/60 truncate mt-0.5">{inv.description}</p>
                {inv.dueDate && (
                  <p className="text-xs text-base-content/40 mt-0.5">Due {inv.dueDate}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-semibold text-base-content">{formatMoney(inv.amountCents)}</p>
                <div className="flex gap-2 mt-1 justify-end">
                  {inv.status === "draft" && (
                    <>
                      <button onClick={() => openEdit(inv)} className="text-xs text-brand hover:underline">Edit</button>
                      <button onClick={() => handleAction(inv.id, "send")} disabled={pending} className="text-xs text-blue-600 hover:underline">Send</button>
                      <button onClick={() => handleAction(inv.id, "sent")} disabled={pending} className="text-xs text-base-content/60 hover:underline" title="Record it as sent without emailing — for an invoice you delivered yourself">Mark sent</button>
                      <button onClick={() => handleAction(inv.id, "delete")} disabled={pending} className="text-xs text-red-500 hover:underline">Delete</button>
                    </>
                  )}
                  {inv.status === "sent" && (
                    <>
                      <button onClick={() => handleAction(inv.id, "paid")} disabled={pending} className="text-xs text-green-600 hover:underline">Mark paid</button>
                      <button onClick={() => handleAction(inv.id, "void")} disabled={pending} className="text-xs text-red-500 hover:underline">Void</button>
                    </>
                  )}
                  {inv.status === "paid" && (
                    <span className="text-xs text-base-content/40">
                      {inv.paidAt ? `Paid ${new Date(inv.paidAt).toLocaleDateString()}` : "Paid"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Slide-over form */}
      {slide !== null && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setSlide(null)} />
          <div className="w-full max-w-lg bg-surface shadow-xl flex flex-col overflow-hidden">
            <div className="p-5 border-b border-base-200 flex items-center justify-between">
              <h2 className="font-semibold text-base-content">
                {slide === "create" ? "New invoice" : "Edit invoice"}
              </h2>
              <button onClick={() => setSlide(null)} className="text-base-content/40 hover:text-base-content text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {error && <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>}

              {/* Recipient */}
              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Bill to</span>
                <select
                  value={
                    form.studio_id
                      ? `studio:${form.studio_id}`
                      : form.private_client_id
                      ? `private:${form.private_client_id}`
                      : ""
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) { handleClientSelect(null); return; }
                    const [kind, id] = val.split(":");
                    const opt = clientOptions.find((o) => o.kind === kind && o.id === id);
                    handleClientSelect(opt ?? null);
                  }}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">— select or type below —</option>
                  {clientOptions.filter((o) => o.kind === "studio").length > 0 && (
                    <optgroup label="Studios">
                      {clientOptions.filter((o) => o.kind === "studio").map((o) => (
                        <option key={o.id} value={`studio:${o.id}`}>{o.label}</option>
                      ))}
                    </optgroup>
                  )}
                  {clientOptions.filter((o) => o.kind === "private").length > 0 && (
                    <optgroup label="Private clients">
                      {clientOptions.filter((o) => o.kind === "private").map((o) => (
                        <option key={o.id} value={`private:${o.id}`}>{o.label}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
                <input
                  type="text"
                  placeholder="Or type a name directly"
                  value={form.recipient_label}
                  onChange={(e) => setForm((f) => ({ ...f, recipient_label: e.target.value, studio_id: null, private_client_id: null }))}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>

              {/* Description */}
              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Description *</span>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                  placeholder="e.g. Teaching services — June 2025"
                />
              </label>

              {/* Line items */}
              <div className="space-y-2">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Line items</span>
                {form.line_items.map((li, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      type="text"
                      placeholder="Item"
                      value={li.description}
                      onChange={(e) => setLineItem(i, { description: e.target.value })}
                      className="flex-1 border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    <input
                      type="number"
                      placeholder="Qty"
                      min={0.5}
                      step={0.5}
                      value={li.quantity}
                      onChange={(e) => setLineItem(i, { quantity: parseFloat(e.target.value) || 1 })}
                      className="w-16 border border-base-300 rounded-lg px-2 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    <input
                      type="number"
                      placeholder="Unit $"
                      min={0}
                      step={0.01}
                      value={(li.unit_cents / 100).toFixed(2)}
                      onChange={(e) => setLineItem(i, { unit_cents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
                      className="w-24 border border-base-300 rounded-lg px-2 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                    {form.line_items.length > 1 && (
                      <button
                        onClick={() => setForm((f) => ({ ...f, line_items: f.line_items.filter((_, j) => j !== i) }))}
                        className="text-red-400 hover:text-red-600 text-lg leading-none mt-2"
                      >×</button>
                    )}
                  </div>
                ))}
                <button
                  onClick={() => setForm((f) => ({ ...f, line_items: [...f.line_items, { description: "", quantity: 1, unit_cents: 0 }] }))}
                  className="text-xs text-brand hover:underline"
                >
                  + Add line
                </button>
                <p className="text-sm font-semibold text-base-content text-right">
                  Total: {formatMoney(totalCents(form.line_items))}
                </p>
              </div>

              {/* Due date */}
              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Due date</span>
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>

              {/* Notes */}
              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
              </label>
            </div>
            <div className="p-5 border-t border-base-200 flex gap-3">
              <button onClick={() => setSlide(null)} className="flex-1 border border-base-300 rounded-lg py-2 text-sm">Cancel</button>
              <button
                onClick={handleSave}
                disabled={pending || !form.description.trim() || !form.recipient_label.trim()}
                className="flex-1 btn-brand rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
