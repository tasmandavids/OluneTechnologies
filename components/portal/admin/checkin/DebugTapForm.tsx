"use client";

// ============================================================================
//  DebugTapForm — exercises the tap-resolution path from an admin session,
//  without physical NFC hardware. Web NFC only runs on real Android Chrome,
//  so this is the only way to verify the direction/insert/notify logic from
//  a dev browser. Posts to /api/checkin/tap-debug (admin-session-authenticated
//  twin of the real reader endpoint).
// ============================================================================

import { useState, useTransition } from "react";
import { toast } from "@/lib/feedback";

export function DebugTapForm() {
  const [token, setToken] = useState("");
  const [direction, setDirection] = useState<"" | "in" | "out">("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    startTransition(async () => {
      const res = await fetch("/api/checkin/tap-debug", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardToken: token, direction: direction || undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult(json.error ?? "Tap failed.");
        toast.error(json.error ?? "Tap failed.");
        return;
      }
      setResult(`Tapped ${json.direction} at ${new Date(json.tappedAt).toLocaleTimeString()}`);
      toast.success("Tap recorded.");
    });
  };

  return (
    <div>
      <h2 className="mb-1 text-sm font-bold text-ink">Simulate a tap</h2>
      <p className="mb-3 text-sm text-muted">
        For verifying the tap logic without a physical reader — type a card&apos;s token (visible on the
        student&apos;s card row once issued) and simulate a reader tap.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted" htmlFor="debug-tap-token">
            Card token
          </label>
          <input
            id="debug-tap-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="rounded-lg border px-3 py-2 text-sm text-ink outline-none"
            style={{ borderColor: "var(--ring)", background: "var(--surface)" }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-muted" htmlFor="debug-tap-direction">
            Direction
          </label>
          <select
            id="debug-tap-direction"
            value={direction}
            onChange={(e) => setDirection(e.target.value as "" | "in" | "out")}
            className="rounded-lg border px-3 py-2 text-sm text-ink outline-none"
            style={{ borderColor: "var(--ring)", background: "var(--surface)" }}
          >
            <option value="">Auto</option>
            <option value="in">In</option>
            <option value="out">Out</option>
          </select>
        </div>
        <button
          type="submit"
          disabled={pending || !token}
          className="rounded-xl border px-4 py-2 text-sm font-semibold text-ink transition hover:bg-[--t2] disabled:opacity-60"
          style={{ borderColor: "var(--ring)" }}
        >
          {pending ? "Tapping…" : "Tap"}
        </button>
      </form>

      {result && <p className="mt-2 text-xs text-muted">{result}</p>}
    </div>
  );
}
