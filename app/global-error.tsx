"use client";

import { useEffect, useMemo, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";
import enErrors from "@/messages/en/errors.json";
import frErrors from "@/messages/fr/errors.json";
import itErrors from "@/messages/it/errors.json";
import ruErrors from "@/messages/ru/errors.json";
import zhErrors from "@/messages/zh/errors.json";

const ERROR_MESSAGES: Record<Locale, typeof enErrors> = {
  en: enErrors,
  fr: frErrors,
  it: itErrors,
  ru: ruErrors,
  zh: zhErrors,
};

function resolveClientLocale(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(new RegExp(`${LOCALE_COOKIE}=([^;]+)`));
  const value = match?.[1];
  return isLocale(value) ? value : "en";
}

function needsAuthRecovery(pathname: string): boolean {
  return pathname === "/join" || pathname.startsWith("/portal");
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const locale = useMemo(resolveClientLocale, []);
  const t = ERROR_MESSAGES[locale].errors.global;
  const [recoverToLogin, setRecoverToLogin] = useState(false);

  // global-error replaces the root layout, which means React has already given
  // up on the whole tree. Nothing downstream will report this, so it is
  // captured here explicitly — `digest` ties it back to the server-side log
  // line when the error originated on the server.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    setRecoverToLogin(needsAuthRecovery(window.location.pathname));
  }, []);

  async function handleRetry() {
    const pathname = window.location.pathname;
    if (!needsAuthRecovery(pathname)) {
      reset();
      return;
    }

    const next = pathname.startsWith("/portal") ? pathname : "/join";
    try {
      const { createClient } = await import("@/lib/supabase/client");
      await createClient().auth.signOut();
    } catch {
      /* still send the user to login */
    }
    window.location.assign(`/login?next=${encodeURIComponent(next)}`);
  }

  return (
    <html lang={locale}>
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#faf9f7", color: "#1a1a1a" }}>
        <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "1.5rem" }}>
          <div style={{ maxWidth: "28rem", textAlign: "center" }}>
            <h1 style={{ fontSize: "1.5rem", fontWeight: 700 }}>{t.title}</h1>
            <p style={{ marginTop: "0.75rem", color: "#666" }}>{t.body}</p>
            <button
              type="button"
              onClick={handleRetry}
              style={{
                marginTop: "1.5rem",
                padding: "0.5rem 1.25rem",
                borderRadius: "9999px",
                border: "none",
                background: "#111",
                color: "#fff",
                cursor: "pointer",
              }}
            >
              {recoverToLogin ? t.signInAgain : t.retry}
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
