"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TermPlan, PayerOption, UnpaidInvoice } from "@/app/portal/admin/payment-plans/page";
import { createTermPaymentPlan, cancelTermPaymentPlan, recordInstallmentPayment } from "@/app/portal/admin/payment-plans/actions";
import { formatMoney } from "@/lib/currency";

function statusBadge(status: TermPlan["status"]) {
  const map = {
    active:    "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${map[status]}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((paid / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
        <div className="bg-indigo-600 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap">{paid}/{total}</span>
    </div>
  );
}

type CreateFormState = {
  payerId: string;
  totalDollars: string;
  installmentCount: string;
  firstDueDate: string;
  invoiceIds: string[];
};

export function TermPaymentPlansManager({
  plans,
  payers,
  unpaidInvoices,
}: {
  plans: TermPlan[];
  payers: PayerOption[];
  unpaidInvoices: UnpaidInvoice[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateFormState>({
    payerId: payers[0]?.id ?? "",
    totalDollars: "",
    installmentCount: "3",
    firstDueDate: "",
    invoiceIds: [],
  });
  const [error, setError] = useState<string | null>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  // Invoices for selected payer
  const payerInvoices = unpaidInvoices.filter((i) => i.payerId === form.payerId);
  const invoicesTotalCents = form.invoiceIds.reduce(
    (sum, id) => sum + (unpaidInvoices.find((i) => i.id === id)?.amountCents ?? 0), 0
  );

  function setPayerId(id: string) {
    setForm((f) => ({ ...f, payerId: id, invoiceIds: [] }));
  }

  function toggleInvoice(id: string) {
    setForm((f) => {
      const ids = f.invoiceIds.includes(id)
        ? f.invoiceIds.filter((x) => x !== id)
        : [...f.invoiceIds, id];
      const total = ids.reduce((sum, iid) => sum + (unpaidInvoices.find((i) => i.id === iid)?.amountCents ?? 0), 0);
      return { ...f, invoiceIds: ids, totalDollars: total > 0 ? (total / 100).toFixed(2) : f.totalDollars };
    });
  }

  function handleCreate() {
    setError(null);
    const totalCents = Math.round(parseFloat(form.totalDollars) * 100);
    if (isNaN(totalCents) || totalCents <= 0) { setError("Enter a valid total"); return; }
    if (!form.firstDueDate) { setError("Set a first due date"); return; }
    startTransition(async () => {
      const res = await createTermPaymentPlan({
        payer_id: form.payerId,
        total_cents: totalCents,
        installment_count: parseInt(form.installmentCount),
        first_due_date: form.firstDueDate,
        invoice_ids: form.invoiceIds.length ? form.invoiceIds : undefined,
      });
      if (res.error) { setError(res.error); return; }
      setShowCreate(false);
      setForm({ payerId: payers[0]?.id ?? "", totalDollars: "", installmentCount: "3", firstDueDate: "", invoiceIds: [] });
      router.refresh();
    });
  }

  function handleCancel(planId: string) {
    startTransition(async () => {
      await cancelTermPaymentPlan(planId);
      router.refresh();
    });
  }

  function handleRecord(plan: TermPlan) {
    const nextAmount = plan.installmentAmounts[plan.installmentsPaid];
    if (!nextAmount) return;
    // This records a payment WITHOUT taking money — it advances the schedule and
    // can complete the plan (marking its invoices paid). Guard against a stray
    // click marking a family as paid when they haven't actually paid.
    const ok = window.confirm(
      `Record a ${formatMoney(nextAmount)} installment for ${plan.payerName ?? "this family"} as paid?\n\n` +
        `This does NOT charge them — only use it when the money has already been received outside the app ` +
        `(bank transfer, cash, etc.).`,
    );
    if (!ok) { setRecordingId(null); return; }
    startTransition(async () => {
      await recordInstallmentPayment(plan.id, nextAmount);
      setRecordingId(null);
      router.refresh();
    });
  }

  const active = plans.filter((p) => p.status === "active");
  const historical = plans.filter((p) => p.status !== "active");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Term payment plans</h1>
          <p className="text-sm text-gray-500 mt-0.5">Split balances into monthly installments for families</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
        >
          New plan
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Active plans</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{active.length}</p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Outstanding</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatMoney(active.reduce((s, p) => s + (p.totalCents - p.amountPaidCents), 0))}
          </p>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <p className="text-xs text-gray-500">Collected this term</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {formatMoney(plans.reduce((s, p) => s + p.amountPaidCents, 0))}
          </p>
        </div>
      </div>

      {/* Active plans */}
      {active.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-700">Active plans</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {active.map((plan) => {
              const nextAmount = plan.installmentAmounts[plan.installmentsPaid];
              return (
                <li key={plan.id} className="px-4 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{plan.payerName ?? "Parent"}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Total: {formatMoney(plan.totalCents)} · {formatMoney(plan.amountPaidCents)} paid
                        {plan.nextDueDate && ` · Next due ${plan.nextDueDate}`}
                      </p>
                      <div className="mt-2 max-w-xs">
                        <ProgressBar paid={plan.installmentsPaid} total={plan.installmentCount} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {nextAmount && (
                        <button
                          disabled={pending && recordingId === plan.id}
                          onClick={() => { setRecordingId(plan.id); handleRecord(plan); }}
                          className="px-3 py-1.5 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 disabled:opacity-50"
                        >
                          Record {formatMoney(nextAmount)}
                        </button>
                      )}
                      <button
                        disabled={pending}
                        onClick={() => handleCancel(plan.id)}
                        className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Historical plans */}
      {historical.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h2 className="text-sm font-medium text-gray-700">Completed & cancelled</h2>
          </div>
          <ul className="divide-y divide-gray-100">
            {historical.map((plan) => (
              <li key={plan.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-900">{plan.payerName ?? "Parent"}</p>
                  <p className="text-xs text-gray-500">
                    {formatMoney(plan.totalCents)} · {plan.installmentCount} installments
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(plan.status)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {plans.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">
          No payment plans yet. Create one to split a family&apos;s balance into installments.
        </div>
      )}

      {/* Create slide-over */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/30" onClick={() => setShowCreate(false)} />
          <div className="relative ml-auto w-full max-w-md bg-white shadow-xl flex flex-col h-full">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New term payment plan</h2>
              <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Payer */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Family / payer</label>
                <select
                  value={form.payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.email ? ` — ${p.email}` : ""}</option>
                  ))}
                </select>
              </div>

              {/* Invoices to link */}
              {payerInvoices.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Link outstanding invoices (optional — auto-fills total)
                  </label>
                  <div className="space-y-1">
                    {payerInvoices.map((inv) => (
                      <label key={inv.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.invoiceIds.includes(inv.id)}
                          onChange={() => toggleInvoice(inv.id)}
                          className="rounded border-gray-300"
                        />
                        <span className="text-gray-700">
                          #{inv.invoiceNumber} — {formatMoney(inv.amountCents)}
                          {inv.description ? ` · ${inv.description}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  {invoicesTotalCents > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      Selected total: {formatMoney(invoicesTotalCents)}
                    </p>
                  )}
                </div>
              )}

              {/* Total */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Total amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.totalDollars}
                    onChange={(e) => setForm((f) => ({ ...f, totalDollars: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg pl-7 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Installment count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Number of installments</label>
                <select
                  value={form.installmentCount}
                  onChange={(e) => setForm((f) => ({ ...f, installmentCount: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[2, 3, 4, 6, 9, 10, 12].map((n) => (
                    <option key={n} value={n}>{n} installments</option>
                  ))}
                </select>
                {form.totalDollars && !isNaN(parseFloat(form.totalDollars)) && (
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ {formatMoney(Math.round(parseFloat(form.totalDollars) * 100 / parseInt(form.installmentCount)))} per installment
                  </p>
                )}
              </div>

              {/* First due date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First due date</label>
                <input
                  type="date"
                  value={form.firstDueDate}
                  onChange={(e) => setForm((f) => ({ ...f, firstDueDate: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm hover:bg-gray-50">Cancel</button>
              <button
                disabled={pending}
                onClick={handleCreate}
                className="flex-1 bg-indigo-600 text-white rounded-lg py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {pending ? "Creating…" : "Create plan"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
