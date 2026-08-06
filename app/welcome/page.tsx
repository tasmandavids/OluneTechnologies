"use client";

// ============================================================================
//  /welcome — post-invite password setup page.
//
//  New users who arrive here via an invite link already have a valid session
//  (the auth callback exchanged the invite code) but no password. This page
//  lets them set one before entering their portal.
//
//  Flow: inviteUserByEmail(redirectTo: "/auth/callback?next=/welcome")
//        → callback exchanges code → session created → redirect here
//        → user sets password → redirect to their portal home
// ============================================================================

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function WelcomePage() {
  const supabase = createClient();
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    const { error: updateErr } = await supabase.auth.updateUser({ password });

    if (updateErr) {
      setError(updateErr.message);
      setLoading(false);
      return;
    }

    // Full navigation so middleware sees the refreshed session and routes
    // to the correct portal (admin → /portal/admin, student → /portal/student, etc.)
    window.location.assign("/portal");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="box w-full max-w-sm rounded-2xl p-8">
        <h1 className="text-2xl font-black text-ink">Welcome to Olune</h1>
        <p className="mt-2 text-sm text-muted">
          Set a password so you can log in any time.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="field-premium w-full"
              autoFocus
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-ink">
              Confirm password
            </label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className="field-premium w-full"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand px-4 py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {loading ? "Saving…" : "Set password & continue"}
          </button>
        </form>
      </div>
    </main>
  );
}
