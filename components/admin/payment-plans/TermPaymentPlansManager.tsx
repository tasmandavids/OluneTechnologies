"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TermPlan, PayerOption, UnpaidInvoice } from "@/app/portal/admin/payment-plans/page";
import { createTermPaymentPlan, cancelTermPaymentPlan, recordInstallmentPayment } from "@/app/portal/admin/payment-plans/actions";
import { formatMoney } from "@/lib/currency";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const STATUS_STYLES: Record<TermPlan["status"], { bg: string; text: string }> = {
  active: { bg: "rgba(107,102,201,.12)", text: "#3d3a8a" },
  completed: { bg: "rgba(22,163,74,.12)", text: "#16803c" },
  cancelled: { bg: "var(--base)", text: "var(--muted)" },
};

function statusBadge(status: TermPlan["status"]) {
  const s = STATUS_STYLES[status];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wider"
      style={{ background: s.bg, color: s.text }}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function ProgressBar({ paid, total }: { paid: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((paid / total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)]">
        <div className="h-1.5 rounded-full bg-[--brand]" style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs text-muted">{paid}/{total}</span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <GlassPanel className="!p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p
        className="mt-1 tabular-nums tracking-tight text-ink"
        style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: "1.9rem" }}
      >
        {value}
      </p>
    </GlassPanel>
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
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-black tracking-tight text-ink"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Payment plans
          </h1>
          <p className="mt-1 text-sm text-muted">Split balances into instalments for families</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="rounded-xl bg-ink px-4 py-2.5 text-sm font-bold text-paper shadow-sm hover:opacity-90"
        >
          + New plan
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Active plans" value={String(active.length)} />
        <StatCard
          label="Outstanding"
          value={formatMoney(active.reduce((s, p) => s + (p.totalCents - p.amountPaidCents), 0))}
        />
        <StatCard
          label="Collected this term"
          value={formatMoney(plans.reduce((s, p) => s + p.amountPaidCents, 0))}
        />
      </div>

      {/* Active plans */}
      {active.length > 0 && (
        <GlassPanel className="!p-0 overflow-hidden">
          <div className="border-b border-[--hair] px-6 py-4">
            <h2 className="text-sm font-bold text-ink">Active plans</h2>
          </div>
          <ul className="divide-y divide-[--hair]">
            {active.map((plan) => {
              const nextAmount = plan.installmentAmounts[plan.installmentsPaid];
              return (
                <li key={plan.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">{plan.payerName ?? "Parent"}</p>
                      <p className="mt-0.5 text-xs text-muted">
                        Total: {formatMoney(plan.totalCents)} · {formatMoney(plan.amountPaidCents)} paid
                        {plan.nextDueDate && ` · Next due ${plan.nextDueDate}`}
                      </p>
                      <div className="mt-2 max-w-xs">
                        <ProgressBar paid={plan.installmentsPaid} total={plan.installmentCount} />
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {nextAmount && (
                        <button
                          disabled={pending && recordingId === plan.id}
                          onClick={() => { setRecordingId(plan.id); handleRecord(plan); }}
                          className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Record {formatMoney(nextAmount)}
                        </button>
                      )}
                      <button
                        disabled={pending}
                        onClick={() => handleCancel(plan.id)}
                        className="rounded-lg border border-[--hair] px-3 py-1.5 text-xs font-semibold text-muted hover:bg-base disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </GlassPanel>
      )}

      {/* Historical plans */}
      {historical.length > 0 && (
        <GlassPanel className="!p-0 overflow-hidden">
          <div className="border-b border-[--hair] px-6 py-4">
            <h2 className="text-sm font-bold text-ink">Completed &amp; cancelled</h2>
          </div>
          <ul className="divide-y divide-[--hair]">
            {historical.map((plan) => (
              <li key={plan.id} className="flex items-center justify-between px-6 py-3">
                <div>
                  <p className="text-sm text-ink">{plan.payerName ?? "Parent"}</p>
                  <p className="text-xs text-muted">
                    {formatMoney(plan.totalCents)} · {plan.installmentCount} installments
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(plan.status)}
                </div>
              </li>
            ))}
          </ul>
        </GlassPanel>
      )}

      {plans.length === 0 && (
        <GlassPanel className="!p-14 text-center text-sm text-muted">
          No payment plans yet. Create one to split a family&apos;s balance into installments.
        </GlassPanel>
      )}

      {/* Create slide-over */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="relative ml-auto flex h-full w-full max-w-md flex-col bg-surface shadow-xl">
            <div className="flex items-center justify-between border-b border-[--hair] px-6 py-4">
              <h2 className="text-base font-bold text-ink">New payment plan</h2>
              <button onClick={() => setShowCreate(false)} className="text-xl leading-none text-muted hover:text-ink">&times;</button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {/* Payer */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Family / payer</label>
                <select
                  value={form.payerId}
                  onChange={(e) => setPayerId(e.target.value)}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                >
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.email ? ` — ${p.email}` : ""}</option>
                  ))}
                </select>
              </div>

              {/* Invoices to link */}
              {payerInvoices.length > 0 && (
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">
                    Link outstanding invoices (optional — auto-fills total)
                  </label>
                  <div className="space-y-1">
                    {payerInvoices.map((inv) => (
                      <label key={inv.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={form.invoiceIds.includes(inv.id)}
                          onChange={() => toggleInvoice(inv.id)}
                          className="rounded border-[--hair]"
                        />
                        <span className="text-ink">
                          #{inv.invoiceNumber} — {formatMoney(inv.amountCents)}
                          {inv.description ? ` · ${inv.description}` : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                  {invoicesTotalCents > 0 && (
                    <p className="mt-1 text-xs text-muted">
                      Selected total: {formatMoney(invoicesTotalCents)}
                    </p>
                  )}
                </div>
              )}

              {/* Total */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Total amount</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.totalDollars}
                    onChange={(e) => setForm((f) => ({ ...f, totalDollars: e.target.value }))}
                    className="w-full rounded-lg border border-[--hair] bg-base py-2 pl-7 pr-3 text-sm text-ink"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Installment count */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Number of installments</label>
                <select
                  value={form.installmentCount}
                  onChange={(e) => setForm((f) => ({ ...f, installmentCount: e.target.value }))}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                >
                  {[2, 3, 4, 6, 9, 10, 12].map((n) => (
                    <option key={n} value={n}>{n} installments</option>
                  ))}
                </select>
                {form.totalDollars && !isNaN(parseFloat(form.totalDollars)) && (
                  <p className="mt-1 text-xs text-muted">
                    ≈ {formatMoney(Math.round(parseFloat(form.totalDollars) * 100 / parseInt(form.installmentCount)))} per installment
                  </p>
                )}
              </div>

              {/* First due date */}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">First due date</label>
                <input
                  type="date"
                  value={form.firstDueDate}
                  onChange={(e) => setForm((f) => ({ ...f, firstDueDate: e.target.value }))}
                  className="w-full rounded-lg border border-[--hair] bg-base px-3 py-2 text-sm text-ink"
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
            <div className="flex gap-3 border-t border-[--hair] px-6 py-4">
              <button onClick={() => setShowCreate(false)} className="flex-1 rounded-xl border border-[--hair] py-2 text-sm font-semibold text-ink hover:bg-base">Cancel</button>
              <button
                disabled={pending}
                onClick={handleCreate}
                className="flex-1 rounded-xl bg-ink py-2 text-sm font-bold text-paper hover:opacity-90 disabled:opacity-50"
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
