"use client";

import { useState, useTransition } from "react";
import type { AdminSubRequest, ClassOption } from "@/app/portal/admin/substitutes/page";
import {
  createSubstituteRequest,
  cancelSubstituteRequest,
  reopenSubstituteRequest,
} from "@/app/portal/admin/substitutes/actions";
import { GlassPanel } from "@/components/portal/admin/glass/GlassPanel";

const STATUS_STYLE: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  filled: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const DAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return `${DAY[dt.getDay()]} ${dt.toLocaleDateString("en-NZ", { day: "numeric", month: "short" })}`;
}

const EMPTY_FORM = {
  class_id: "" as string,
  class_name: "",
  discipline: "",
  date: "",
  start_time: "",
  end_time: "",
  notes: "",
};

export function SubstituteBoardAdmin({
  requests: initial,
  classOptions,
}: {
  requests: AdminSubRequest[];
  classOptions: ClassOption[];
}) {
  const [requests, setRequests] = useState(initial);
  const [filter, setFilter] = useState<"all" | "open" | "filled" | "cancelled">("all");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const visible = filter === "all" ? requests : requests.filter((r) => r.status === filter);

  function handleClassSelect(classId: string) {
    const cls = classOptions.find((c) => c.id === classId);
    setForm((f) => ({
      ...f,
      class_id: classId,
      class_name: cls?.name ?? f.class_name,
      discipline: cls?.discipline ?? f.discipline,
      start_time: cls?.startTime ?? f.start_time,
    }));
  }

  function handleCreate() {
    setError(null);
    startTransition(async () => {
      const res = await createSubstituteRequest({
        class_id: form.class_id || null,
        class_name: form.class_name,
        discipline: form.discipline || null,
        date: form.date,
        start_time: form.start_time,
        end_time: form.end_time,
        notes: form.notes || null,
      });
      if (res?.error) { setError(res.error); return; }
      setShowCreate(false);
      setForm(EMPTY_FORM);
      location.reload();
    });
  }

  function handleCancel(id: string) {
    startTransition(async () => {
      const res = await cancelSubstituteRequest(id);
      if (res?.error) { setError(res.error); return; }
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "cancelled" } : r));
    });
  }

  function handleReopen(id: string) {
    startTransition(async () => {
      const res = await reopenSubstituteRequest(id);
      if (res?.error) { setError(res.error); return; }
      setRequests((prev) => prev.map((r) => r.id === id ? { ...r, status: "open", filledByName: null } : r));
    });
  }

  const openCount = requests.filter((r) => r.status === "open").length;
  const filledCount = requests.filter((r) => r.status === "filled").length;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-content">Substitute board</h1>
          <p className="text-sm text-base-content/60 mt-0.5">Post classes that need covering — instructors can claim them</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-brand px-4 py-2 rounded-lg text-sm font-medium">
          + Post sub slot
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4">
        <GlassPanel className="text-center">
          <p className="text-xs text-base-content/50 uppercase tracking-wide">Open</p>
          <p className="text-2xl font-bold text-blue-600 mt-1">{openCount}</p>
        </GlassPanel>
        <GlassPanel className="text-center">
          <p className="text-xs text-base-content/50 uppercase tracking-wide">Filled</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{filledCount}</p>
        </GlassPanel>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["all", "open", "filled", "cancelled"] as const).map((f) => (
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

      {/* List */}
      {visible.length === 0 ? (
        <GlassPanel className="text-center !p-12">
          <p className="text-sm text-base-content/40">No requests here.</p>
        </GlassPanel>
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <GlassPanel key={r.id} className="flex items-center gap-4">
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  {r.discipline && (
                    <span className="text-xs bg-base-200 text-base-content/60 rounded-full px-2 py-0.5">{r.discipline}</span>
                  )}
                </div>
                <p className="font-semibold text-base-content">{r.className}</p>
                <p className="text-sm text-base-content/60">{formatDate(r.date)} · {r.startTime}–{r.endTime}</p>
                {r.filledByName && (
                  <p className="text-xs text-green-600">Covered by {r.filledByName}</p>
                )}
                {r.notes && <p className="text-xs text-base-content/50">{r.notes}</p>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0 text-right">
                {r.status === "open" && (
                  <button onClick={() => handleCancel(r.id)} disabled={pending} className="text-xs text-red-500 hover:underline">Cancel</button>
                )}
                {(r.status === "filled" || r.status === "cancelled") && (
                  <button onClick={() => handleReopen(r.id)} disabled={pending} className="text-xs text-brand hover:underline">Re-open</button>
                )}
              </div>
            </GlassPanel>
          ))}
        </div>
      )}

      {/* Create slide-over */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40" onClick={() => setShowCreate(false)} />
          <div className="w-full max-w-md bg-surface shadow-xl flex flex-col">
            <div className="p-5 border-b border-base-200 flex items-center justify-between">
              <h2 className="font-semibold text-base-content">Post a sub slot</h2>
              <button onClick={() => setShowCreate(false)} className="text-base-content/40 hover:text-base-content text-xl leading-none">×</button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {error && <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>}

              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Class (optional)</span>
                <select
                  value={form.class_id}
                  onChange={(e) => handleClassSelect(e.target.value)}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                >
                  <option value="">— select a class or type below —</option>
                  {classOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.discipline ? ` (${c.discipline})` : ""}</option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Class name *</span>
                <input
                  type="text"
                  value={form.class_name}
                  onChange={(e) => setForm((f) => ({ ...f, class_name: e.target.value }))}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Date *</span>
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                {(["start_time", "end_time"] as const).map((f) => (
                  <label key={f} className="block space-y-1">
                    <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">
                      {f === "start_time" ? "Start *" : "End *"}
                    </span>
                    <input
                      type="time"
                      value={form[f]}
                      onChange={(e) => setForm((prev) => ({ ...prev, [f]: e.target.value }))}
                      className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                    />
                  </label>
                ))}
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-base-content/70 uppercase tracking-wide">Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  placeholder="e.g. Advanced level, please arrive 10 min early"
                  className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
                />
              </label>
            </div>
            <div className="p-5 border-t border-base-200 flex gap-3">
              <button onClick={() => setShowCreate(false)} className="flex-1 border border-base-300 rounded-lg py-2 text-sm">Cancel</button>
              <button
                onClick={handleCreate}
                disabled={pending || !form.class_name.trim() || !form.date || !form.start_time || !form.end_time}
                className="flex-1 btn-brand rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {pending ? "Posting…" : "Post"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
