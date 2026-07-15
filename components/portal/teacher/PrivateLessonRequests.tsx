"use client";

import { useState, useTransition } from "react";
import { respondToBooking } from "@/app/portal/teacher/private-lessons/actions";
import type { TeacherBooking } from "@/lib/private-lessons/types";

function formatDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export default function PrivateLessonRequests({
  pending,
  upcoming,
}: {
  pending: TeacherBooking[];
  upcoming: TeacherBooking[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pendingTransition, startTransition] = useTransition();

  function respond(id: string, decision: "accepted" | "declined", declineNote?: string) {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      const res = await respondToBooking({ bookingId: id, decision, note: declineNote ?? null });
      setBusyId(null);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setDeclining(null);
      setNote("");
      location.reload();
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-base-content">Private lessons</h1>
        <p className="text-sm text-base-content/60 mt-0.5">
          Requests families have sent you. Accepting adds the lesson to everyone&apos;s schedule.
        </p>
      </div>

      {error && <p className="text-sm text-red-500 bg-red-50 rounded p-2">{error}</p>}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide">
          Requests ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <div className="border-2 border-dashed border-base-300 rounded-xl p-8 text-center">
            <p className="text-base-content/50 text-sm">No pending requests.</p>
          </div>
        ) : (
          pending.map((b) => (
            <div key={b.id} className="bg-surface rounded-xl p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-base-content">{b.studentName ?? "Student"}</p>
                  <p className="text-sm text-base-content/70">
                    {formatDate(b.lessonDate)} · {b.startTime}–{b.endTime}
                  </p>
                  {b.locationName && (
                    <p className="text-xs text-base-content/50 mt-0.5">{b.locationName}</p>
                  )}
                  {b.parentNote && (
                    <p className="text-sm text-base-content/60 mt-1 italic">“{b.parentNote}”</p>
                  )}
                  {b.parentName && (
                    <p className="text-xs text-base-content/40 mt-1">Requested by {b.parentName}</p>
                  )}
                </div>
              </div>

              {declining === b.id ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="Optional reason (shared with the family)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="w-full border border-base-300 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-brand/30"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => setDeclining(null)}
                      className="flex-1 border border-base-300 rounded-lg py-2 text-sm"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => respond(b.id, "declined", note)}
                      disabled={pendingTransition && busyId === b.id}
                      className="flex-1 rounded-lg py-2 text-sm font-medium bg-red-500 text-white disabled:opacity-50"
                    >
                      {pendingTransition && busyId === b.id ? "Declining…" : "Confirm decline"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setNote("");
                      setDeclining(b.id);
                    }}
                    className="flex-1 border border-base-300 rounded-lg py-2 text-sm"
                  >
                    Decline
                  </button>
                  <button
                    onClick={() => respond(b.id, "accepted")}
                    disabled={pendingTransition && busyId === b.id}
                    className="flex-1 btn-brand rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                  >
                    {pendingTransition && busyId === b.id ? "Accepting…" : "Accept"}
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-base-content/70 uppercase tracking-wide">
          Upcoming accepted ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-base-content/40 italic">No upcoming private lessons.</p>
        ) : (
          <div className="space-y-2">
            {upcoming.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between bg-surface rounded-lg px-4 py-3 shadow-sm"
              >
                <div>
                  <p className="text-sm font-medium text-base-content">
                    {b.studentName ?? "Student"}
                  </p>
                  <p className="text-xs text-base-content/60">
                    {formatDate(b.lessonDate)} · {b.startTime}–{b.endTime}
                    {b.locationName ? ` · ${b.locationName}` : ""}
                  </p>
                </div>
                <span className="text-xs font-medium text-green-600">Confirmed</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
