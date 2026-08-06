"use client";

// ============================================================================
//  /reset-password — where "forgot password" links land.
//
//  Flow: login page calls resetPasswordForEmail on the implicit-flow client
//        (redirectTo: "/reset-password") → Supabase emails a link with the
//        recovery session embedded directly in the URL fragment (#access_
//        token=...&type=recovery) → this page's implicit client parses it on
//        load and fires PASSWORD_RECOVERY → the form appears → user sets a
//        new password → redirected to /login to sign in fresh.
//
//  Why implicit and not the app's normal PKCE client: PKCE stores a
//  code_verifier in the browser that *requests* the reset, but the emailed
//  link is almost always opened elsewhere (a phone's Mail app, a different
//  browser) with no access to that storage — the exchange then fails
//  silently and the user lands back on a plain, logged-out page. Implicit
//  tokens are self-contained in the URL, so they work from any device.
// ============================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { createImplicitClient } from "@/lib/supabase/client";

type Status = "validating" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const [supabase] = useState(() => createImplicitClient());
  const [status, setStatus] = useState<Status>("validating");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setStatus("ready");
    });
    // No recovery hash in the URL (link expired/reused, or a direct visit) —
    // the PASSWORD_RECOVERY event never fires, so time out to an error state.
    const timeout = setTimeout(() => {
      setStatus((s) => (s === "validating" ? "invalid" : s));
    }, 3000);
    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [supabase]);

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
    setLoading(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setStatus("done");
    setTimeout(() => window.location.assign("/login"), 1500);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-4">
      <div className="box w-full max-w-sm rounded-2xl p-8">
        <h1 className="text-2xl font-black text-ink">Set a new password</h1>

        {status === "validating" && (
          <p className="mt-4 text-sm text-muted">Checking your reset link…</p>
        )}

        {status === "invalid" && (
          <>
            <p className="mt-4 text-sm text-muted">
              This reset link is invalid or has expired.
            </p>
            <Link
              href="/login"
              className="mt-6 inline-block w-full rounded-xl bg-brand px-4 py-3 text-center text-sm font-bold text-white"
            >
              Back to sign in
            </Link>
          </>
        )}

        {status === "done" && (
          <p className="mt-4 text-sm text-green-600">
            Password updated — redirecting to sign in…
          </p>
        )}

        {status === "ready" && (
          <>
            <p className="mt-2 text-sm text-muted">
              Choose a new password for your account.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-semibold text-ink">
                  New password
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
                {loading ? "Saving…" : "Update password"}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
