"use client";

import { useLocale } from "next-intl";

import { useNumberFormat } from "@/lib/i18n/format";

import { useState, useTransition } from "react";
import { motion } from "framer-motion";

export type Costume = {
  id: string;
  studentName: string | null;
  costumeNumber?: string | null;
  costumeName: string;
  className: string | null;
  eventName: string | null;
  sizeLabel: string | null;
  sizeNotes: string | null;
  colour: string | null;
  status: string;
  priceCents: number | null;
  paid: boolean;
  fittingDate: string | null;
  returnRequired: boolean;
  notes: string | null;
};

export type RecitalInfo = {
  eventName: string;
  eventDate: string | null;
  venue: string | null;
  photoDay: string | null;
  runningOrder: string | null;
  ticketLink: string | null;
  infoPack: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_size: "Size needed",
  size_confirmed: "Size confirmed",
  ordered: "Ordered",
  received: "Received",
  fitted: "Fitted",
  ready: "Ready",
};

const STATUS_COLORS: Record<string, string> = {
  pending_size: "var(--brand-hot)",
  size_confirmed: "var(--brand)",
  ordered: "#a855f7",
  received: "#f59e0b",
  fitted: "#22c55e",
  ready: "#22c55e",
};


const COMMON_SIZES = [
  "Child 6", "Child 8", "Child 10", "Child 12", "Child 14",
  "Adult XS", "Adult S", "Adult M", "Adult L", "Adult XL",
  "Custom",
];

export function CostumeHub({
  costumes,
  recitals,
  onUpdateSize,
}: {
  costumes: Costume[];
  recitals: RecitalInfo[];
  onUpdateSize: (costumeId: string, sizeLabel: string, sizeNotes: string) => Promise<void>;
}) {
  const locale = useLocale();
  const NZD = useNumberFormat({ style: "currency", currency: "NZD", maximumFractionDigits: 2 });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sizeLabel, setSizeLabel] = useState("");
  const [sizeNotes, setSizeNotes] = useState("");
  const [isPending, startTransition] = useTransition();

  const pendingSize = costumes.filter((c) => c.status === "pending_size");

  function startEdit(c: Costume) {
    setEditingId(c.id);
    setSizeLabel(c.sizeLabel ?? "");
    setSizeNotes(c.sizeNotes ?? "");
  }

  function handleSave(costumeId: string) {
    startTransition(async () => {
      await onUpdateSize(costumeId, sizeLabel, sizeNotes);
      setEditingId(null);
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-ink">Costumes & Recital</h1>
        <p className="text-sm text-muted">Your dancers&apos; costumes, fitting dates, and recital info in one place.</p>
      </div>

      {/* Urgent: sizes needed */}
      {pendingSize.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[color-mix(in_srgb,var(--brand-hot)_40%,transparent)] bg-[color-mix(in_srgb,var(--brand-hot)_5%,transparent)] p-4"
        >
          <p className="text-sm font-bold text-[--brand-hot]">
            Action needed: {pendingSize.length} costume size{pendingSize.length > 1 ? "s" : ""} required
          </p>
          <p className="mt-0.5 text-xs text-muted">
            Please confirm the sizes below so your studio can place orders on time.
          </p>
        </motion.div>
      )}

      {/* Recital info cards */}
      {recitals.length > 0 && (
        <div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
            Upcoming performances
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {recitals.map((r, i) => (
              <div key={i} className="box rounded-2xl p-5 space-y-2">
                <p className="font-bold text-ink">{r.eventName}</p>
                {r.eventDate && (
                  <p className="text-sm text-muted">
                    📅 {new Date(r.eventDate).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                  </p>
                )}
                {r.venue && <p className="text-sm text-muted">📍 {r.venue}</p>}
                {r.photoDay && (
                  <p className="text-sm text-muted">
                    📸 Photo day: {new Date(r.photoDay).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                  </p>
                )}
                {r.runningOrder && (
                  <p className="text-xs text-muted whitespace-pre-line pt-2 mt-2">
                    {r.runningOrder}
                  </p>
                )}
                <div className="flex gap-3 pt-1">
                  {r.ticketLink && (
                    <a
                      href={r.ticketLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[--brand] hover:underline"
                    >
                      Get tickets →
                    </a>
                  )}
                  {r.infoPack && (
                    <a
                      href={r.infoPack}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[--brand] hover:underline"
                    >
                      Info pack →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Costumes list */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted">
          Costumes ({costumes.length})
        </h2>
        {costumes.length === 0 ? (
          <div className="box rounded-2xl px-6 py-10 text-center text-sm text-muted">
            No costumes assigned yet. Your studio will add them when recital planning begins.
          </div>
        ) : (
          <div className="space-y-3">
            {costumes.map((c) => (
              <div
                key={c.id}
                className="box rounded-2xl p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-ink">{c.costumeName}</p>
                      {c.colour && (
                        <span className="text-xs text-muted border border-[--hair] rounded-full px-2 py-0.5">
                          {c.colour}
                        </span>
                      )}
                      <span
                        className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.62rem] font-semibold text-white"
                        style={{ background: STATUS_COLORS[c.status] ?? "var(--muted)" }}
                      >
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      {c.studentName} {c.className ? `· ${c.className}` : ""} {c.eventName ? `· ${c.eventName}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    {c.priceCents != null && (
                      <p className={`text-sm font-semibold ${c.paid ? "text-[#22c55e]" : "text-ink"}`}>
                        {NZD.format(c.priceCents / 100)}
                        {c.paid && <span className="ml-1 text-xs font-normal">paid</span>}
                      </p>
                    )}
                    {c.fittingDate && (
                      <p className="text-xs text-muted">
                        Fitting: {new Date(c.fittingDate).toLocaleDateString(locale, { day: "numeric", month: "short" })}
                      </p>
                    )}
                    {c.returnRequired && (
                      <p className="text-xs text-[--brand-hot] font-semibold">Return required</p>
                    )}
                  </div>
                </div>

                {/* Size section */}
                {editingId === c.id ? (
                  <div className="mt-4 space-y-3 pt-4">
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">Size</label>
                      <div className="flex flex-wrap gap-1.5">
                        {COMMON_SIZES.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => setSizeLabel(s)}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                              sizeLabel === s
                                ? "border-[--brand] bg-[color-mix(in_srgb,var(--brand)_12%,transparent)] text-ink"
                                : "border-[--hair] text-muted hover:border-[--brand]"
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        value={sizeLabel}
                        onChange={(e) => setSizeLabel(e.target.value)}
                        placeholder="Or type a custom size…"
                        className="mt-2 w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm text-ink"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-1">Notes (optional)</label>
                      <input
                        type="text"
                        value={sizeNotes}
                        onChange={(e) => setSizeNotes(e.target.value)}
                        placeholder="e.g. between S and M, slim build"
                        className="w-full rounded-xl border border-[--hair] bg-surface px-3 py-2 text-sm text-ink"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="flex-1 rounded-xl border border-[--hair] py-2 text-sm font-semibold text-ink"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!sizeLabel || isPending}
                        onClick={() => handleSave(c.id)}
                        className="flex-1 rounded-xl bg-brand py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {isPending ? "Saving…" : "Save size"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-center justify-between pt-3">
                    <p className="text-xs text-muted">
                      Size:{" "}
                      <span className={c.sizeLabel ? "font-semibold text-ink" : "text-[--brand-hot]"}>
                        {c.sizeLabel ?? "Not yet confirmed"}
                      </span>
                      {c.sizeNotes && <span className="ml-1">({c.sizeNotes})</span>}
                    </p>
                    {(c.status === "pending_size" || c.status === "size_confirmed") && (
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="text-xs font-semibold text-[--brand] hover:underline"
                      >
                        {c.sizeLabel ? "Edit size" : "Confirm size →"}
                      </button>
                    )}
                  </div>
                )}

                {c.notes && (
                  <p className="mt-2 text-xs text-muted italic">{c.notes}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
