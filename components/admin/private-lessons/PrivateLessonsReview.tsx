"use client";

import { useMemo, useState, useTransition } from "react";
import { billPrivateLesson } from "@/app/portal/admin/private-lessons/actions";
import {
  type AdminBooking,
  type LessonRate,
  type PrivateLessonStatus,
} from "@/lib/private-lessons/types";
import { applyUnitRules, hoursBetween } from "@/lib/billing/pricing";
import { formatMoney } from "@/lib/currency";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const STATUS_STYLES: Record<PrivateLessonStatus, string> = {
  requested: "bg-amber-100 text-amber-700",
  accepted: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-600",
  cancelled: "bg-base-200 text-base-content/50",
};

const STATUS_LABELS: Record<PrivateLessonStatus, string> = {
  requested: "Requested",
  accepted: "Confirmed",
  declined: "Declined",
  cancelled: "Cancelled",
};

const FILTERS = [
  { id: "toBill", label: "To bill" },
  { id: "requested", label: "Requested" },
  { id: "billed", label: "Billed" },
  { id: "all", label: "All" },
] as const;

type FilterId = (typeof FILTERS)[number]["id"];

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

/** Hours actually billable for a booking, after the product's minimum and rounding. */
function billableHours(booking: AdminBooking, rate: LessonRate | null): number {
  const raw = hoursBetween(booking.startTime, booking.endTime);
  if (!rate) return raw;
  return applyUnitRules(raw, { minUnits: rate.minUnits, incrementUnits: rate.incrementUnits });
}

export default function PrivateLessonsReview({
  bookings,
  rate,
}: {
  bookings: AdminBooking[];
  rate: LessonRate | null;
}) {
  const [filter, setFilter] = useState<FilterId>("toBill");
  const [billing, setBilling] = useState<AdminBooking | null>(null);
  const [amount, setAmount] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDate());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    switch (filter) {
      case "toBill":
        return bookings.filter((b) => b.status === "accepted" && !b.invoiceId);
      case "requested":
        return bookings.filter((b) => b.status === "requested");
      case "billed":
        return bookings.filter((b) => b.invoiceId);
      default:
        return bookings;
    }
  }, [bookings, filter]);

  function openBill(b: AdminBooking) {
    setBilling(b);
    // Pre-priced from the studio's hourly lesson product so the common case is
    // a single click; the admin can still overwrite it to discount.
    setAmount(
      rate ? ((rate.unitAmountCents * billableHours(b, rate)) / 100).toFixed(2) : "",
    );
    setDueDate(defaultDueDate());
    setError(null);
  }

  function submitBill() {
    if (!billing) return;
    const amountDollars = Number(amount);
    if (!Number.isFinite(amountDollars) || amountDollars <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await billPrivateLesson({
        bookingId: billing.id,
        amountDollars,
        dueDate,
        productId: rate?.productId,
      });
      if (res?.error) {
        setError(res.error);
        return;
      }
      setBilling(null);
      location.reload();
    });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-base-content">Private lessons</h1>
        <p className="text-sm text-base-content/60 mt-0.5">
          Review private lessons teachers have confirmed and invoice families for them.
        </p>
      </div>

      <GlassPanel className="w-fit !p-1">
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-4 py-1.5 text-xs font-semibold transition ${
                filter === f.id ? "bg-ink text-paper" : "text-base-content/60 hover:text-base-content"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </GlassPanel>

      {filtered.length === 0 ? (
        <GlassPanel className="text-center !p-12">
          <p className="text-base-content/50 text-sm">Nothing here.</p>
        </GlassPanel>
      ) : (
        <div className="space-y-2">
          {filtered.map((b) => (
            <GlassPanel
              key={b.id}
              className="flex items-start justify-between gap-3"
            >
              <div>
                <p className="text-sm font-medium text-base-content">
                  {b.studentName ?? "Dancer"} with {b.teacherName ?? "teacher"}
                </p>
                <p className="text-xs text-base-content/60">
                  {formatDate(b.lessonDate)} · {b.startTime}–{b.endTime}
                  {b.locationName ? ` · ${b.locationName}` : ""}
                </p>
                <p className="text-xs text-base-content/40 mt-0.5">
                  Requested by {b.parentName ?? "parent"}
                </p>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[b.status]}`}
                >
                  {STATUS_LABELS[b.status]}
                </span>
                {b.invoiceId ? (
                  <span className="text-xs text-base-content/60">
                    Invoiced
                    {b.amountCents != null ? ` · $${(b.amountCents / 100).toFixed(2)}` : ""}
                    {b.invoiceStatus ? ` · ${b.invoiceStatus}` : ""}
                  </span>
                ) : b.status === "accepted" ? (
                  <button
                    onClick={() => openBill(b)}
                    className="btn-brand rounded-lg px-3 py-1.5 text-xs font-medium"
                  >
                    Bill
                  </button>
                ) : null}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      {billing && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setBilling(null)} />
          <div className="w-full max-w-sm bg-surface shadow-xl flex flex-col">
            <div className="p-5 border-b border-base-200 flex items-center justify-between">
              <h2 className="font-semibold text-base-content">Bill private lesson</h2>
              <button
                onClick={() => setBilling(null)}
                className="text-base-content/40 hover:text-base-content text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {error && <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>}

              <div className="rounded-lg bg-base px-3 py-2 text-sm text-base-content/70">
                <p className="font-medium text-base-content">
                  {billing.studentName ?? "Dancer"} with {billing.teacherName ?? "teacher"}
                </p>
                <p className="text-xs">
                  {formatDate(billing.lessonDate)} · {billing.startTime}–{billing.endTime}
                </p>
                <p className="text-xs mt-0.5">Invoice goes to {billing.parentName ?? "the parent"}.</p>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">
                  Amount (NZD)
                </span>
                {rate && (
                  <span className="block text-xs text-base-content/50">
                    {rate.name} · {formatMoney(rate.unitAmountCents)}/hour ×{" "}
                    {billableHours(billing, rate)}h
                  </span>
                )}
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">
                  Due date
                </span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>
            </div>
            <div className="p-5 border-t border-base-200 flex gap-3">
              <button
                onClick={() => setBilling(null)}
                className="flex-1 border border-base-300 rounded-lg py-2 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={submitBill}
                disabled={pending}
                className="flex-1 btn-brand rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {pending ? "Sending…" : "Send invoice"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
